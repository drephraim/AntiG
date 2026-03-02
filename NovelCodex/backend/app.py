import os
import uuid
import re
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from groq import Groq

# ── Configuration ────────────────────────────────────────────────────────────
# Set your Groq API key as an environment variable (GROQ_API_KEY)
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None
MODEL_NAME = "llama-3.1-8b-instant"

app = Flask(__name__, static_folder="../frontend", static_url_path="")
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100 MB max request
app.config['MAX_FORM_MEMORY_SIZE'] = 100 * 1024 * 1024  # 100 MB max memory size
app.config['MAX_FORM_PARTS'] = 10000  # Up to 10k files at once
CORS(app)

# ── In-Memory Chapter Store ──────────────────────────────────────────────────
chapters = {}  # {id: {"id": str, "title": str, "filename": str, "content": str}}


# ── Helper ───────────────────────────────────────────────────────────────────
def build_context(chapter_ids=None, max_chars=300000):
    """Build a context string from chapters for the AI prompts."""
    selected = chapters.values() if chapter_ids is None else [
        chapters[cid] for cid in chapter_ids if cid in chapters
    ]
    
    # Sort selected chapters naturally so they are in reading order
    import re
    def natural_sort_key(ch):
        return [int(text) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', ch["title"])]
    selected = sorted(selected, key=natural_sort_key)
    
    parts = []
    total = 0
    for ch in selected:
        header = f"\n\n--- {ch['title']} (ID: {ch['id']}) ---\n"
        snippet = ch["content"]
        if total + len(header) + len(snippet) > max_chars:
            remaining = max_chars - total - len(header)
            if remaining > 200:
                snippet = snippet[:remaining] + "\n[...truncated]"
            else:
                break
        parts.append(header + snippet)
        total += len(header) + len(snippet)
    return "".join(parts)


def extract_context_snippets(content, query, context_chars=120):
    """Return list of text snippets around each match of query in content."""
    snippets = []
    lower_content = content.lower()
    lower_query = query.lower()
    start = 0
    while True:
        idx = lower_content.find(lower_query, start)
        if idx == -1:
            break
        s = max(0, idx - context_chars)
        e = min(len(content), idx + len(query) + context_chars)
        snippet = ("..." if s > 0 else "") + content[s:e] + ("..." if e < len(content) else "")
        snippets.append(snippet)
        start = idx + 1
    return snippets


# ── Error Handlers ───────────────────────────────────────────────────────────
from werkzeug.exceptions import HTTPException

@app.errorhandler(Exception)
def handle_exception(e):
    return jsonify(error=str(e)), 500

@app.errorhandler(HTTPException)
def handle_http_exception(e):
    # Return JSON instead of HTML for HTTP errors
    return jsonify(error=e.description), e.code

# ── Routes ───────────────────────────────────────────────────────────────────

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_static(path):
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/upload", methods=["POST"])
def upload_chapters():
    """Upload multiple chapter files (.txt, .md)."""
    files = request.files.getlist("files")
    if not files:
        return jsonify({"error": "No files provided"}), 400

    uploaded = []
    for f in files:
        filename = f.filename or "untitled.txt"
        if not filename.lower().endswith((".txt", ".md")):
            continue
        content = f.read().decode("utf-8", errors="replace")
        # Derive title from filename
        title = os.path.splitext(filename)[0]
        title = re.sub(r"[-_]+", " ", title).strip().title()
        chapter_id = str(uuid.uuid4())[:8]
        chapters[chapter_id] = {
            "id": chapter_id,
            "title": title,
            "filename": filename,
            "content": content,
        }
        uploaded.append({"id": chapter_id, "title": title, "filename": filename})

    return jsonify({"uploaded": uploaded, "total_chapters": len(chapters)})


@app.route("/api/chapters", methods=["GET"])
def list_chapters():
    """List all uploaded chapters (without full content)."""
    result = []
    for ch in chapters.values():
        result.append({
            "id": ch["id"],
            "title": ch["title"],
            "filename": ch["filename"],
            "word_count": len(ch["content"].split()),
        })

    # Natural sort by title so Chapter 2 comes before Chapter 10
    import re
    def natural_sort_key(s):
        return [int(text) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', s["title"])]
    
    result.sort(key=natural_sort_key)
    return jsonify({"chapters": result})


@app.route("/api/chapter/<chapter_id>", methods=["GET"])
def get_chapter(chapter_id):
    """Return the full text of a specific chapter."""
    ch = chapters.get(chapter_id)
    if not ch:
        return jsonify({"error": "Chapter not found"}), 404
    return jsonify(ch)


@app.route("/api/search", methods=["POST"])
def search_chapters():
    """Keyword search across all chapters. Returns matching chapters with context snippets."""
    data = request.get_json(silent=True) or {}
    query = data.get("q", "").strip()
    chapter_ids = data.get("chapter_ids")

    if not query:
        return jsonify({"error": "Query parameter 'q' is required"}), 400

    selected = chapters.values() if chapter_ids is None else [
        chapters[cid] for cid in chapter_ids if cid in chapters
    ]

    results = []
    for ch in selected:
        snippets = extract_context_snippets(ch["content"], query)
        if snippets:
            count = ch["content"].lower().count(query.lower())
            results.append({
                "id": ch["id"],
                "title": ch["title"],
                
                "match_count": count,
                "snippets": snippets[:5],  # limit snippets per chapter
            })

    # Sort by match count descending
    results.sort(key=lambda r: r["match_count"], reverse=True)
    return jsonify({"query": query, "results": results, "total_matches": sum(r["match_count"] for r in results)})


@app.route("/api/ai/summarize", methods=["POST"])
def ai_summarize():
    """Summarize one or more chapters using Gemini."""
    data = request.get_json(silent=True) or {}
    chapter_ids = data.get("chapter_ids")  # None = all chapters

    if not chapters:
        return jsonify({"error": "No chapters uploaded yet"}), 400

    context = build_context(chapter_ids)
    if not context.strip():
        return jsonify({"error": "No matching chapters found"}), 404

    prompt = (
        "You are an expert literary assistant and structural editor. "
        "Analyze and summarize the following novel chapter(s) with depth and nuance. "
        "Provide a comprehensive, well-structured summary that captures key plot events, "
        "character arcs, thematic elements, and any notable foreshadowing. "
        "Use detailed markdown formatting (headers, bullet points, bold text) to organize the response.\n\n"
        f"CHAPTERS:\n{context}"
    )

    try:
        if not client:
            return jsonify({"error": "Groq API key missing. Please edit app.py with your key!"}), 500
        response = client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You are a strict literary analysis AI. You MUST ONLY use the chapter text provided in the user prompt. DO NOT invent, hallucinate, or assume plot details outside of the text provided to you. If the answer is not in the text, say you don't know based on the current segment."},
                {"role": "user", "content": prompt}
            ],
            model=MODEL_NAME
        )
        return jsonify({"summary": response.choices[0].message.content})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/ai/ask", methods=["POST"])
def ai_ask():
    """Answer any question about the uploaded chapters using Gemini."""
    data = request.get_json(silent=True) or {}
    question = data.get("question", "").strip()
    chapter_ids = data.get("chapter_ids")  # None = all chapters

    if not question:
        return jsonify({"error": "A question is required"}), 400
    if not chapters:
        return jsonify({"error": "No chapters uploaded yet"}), 400

    context = build_context(chapter_ids)

    prompt = (
        "You are an expert literary assistant and structural editor with access to the novel chapters below. "
        "Answer the user's question accurately, deeply analyzing the text to provide insightful context. "
        "Always cite specific chapters and quote relevant lines where applicable to support your answer. "
        "Use detailed markdown formatting (headers, bullet points, bold text) to organize your response.\n\n"
        f"CHAPTERS:\n{context}\n\n"
        f"USER QUESTION: {question}"
    )

    try:
        if not client:
            return jsonify({"error": "Groq API key missing. Please edit app.py with your key!"}), 500
        response = client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You are a strict QA assistant. You MUST ONLY use the chapter text provided in the user prompt. DO NOT invent context, characters, or plotlines. If the user's question cannot be answered using ONLY the provided chapters, state: 'Currently, the selected segment does not contain information to answer this question. Please select a different segment.'"},
                {"role": "user", "content": prompt}
            ],
            model=MODEL_NAME
        )
        return jsonify({"answer": response.choices[0].message.content, "question": question})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/ai/find-mentions", methods=["POST"])
def ai_find_mentions():
    """Find all chapters where a character or term is mentioned, with AI-enhanced context."""
    data = request.get_json(silent=True) or {}
    term = data.get("term", "").strip()

    if not term:
        return jsonify({"error": "A search term is required"}), 400
    if not chapters:
        return jsonify({"error": "No chapters uploaded yet"}), 400

    # First do a literal search
    chapter_ids = data.get("chapter_ids")
    selected = chapters.values() if chapter_ids is None else [
        chapters[cid] for cid in chapter_ids if cid in chapters
    ]
    
    keyword_results = []
    chapters_with_mentions = []
    for ch in selected:
        snippets = extract_context_snippets(ch["content"], term)
        if snippets:
            keyword_results.append({
                "id": ch["id"],
                "title": ch["title"],
                "match_count": ch["content"].lower().count(term.lower()),
                "snippets": snippets[:5],
            })
            chapters_with_mentions.append(ch["id"])

    if not chapters_with_mentions:
        return jsonify({
            "term": term,
            "keyword_results": [],
            "ai_analysis": f"The term '{term}' was not found in the selected chapters.",
        })

    # Then use AI for deeper analysis ONLY on the chapters where it literally appeared
    context = build_context(chapters_with_mentions)
    prompt = (
        f"You are an expert literary assistant. The user wants to find all mentions and references to "
        f"\"{term}\" across these novel chapters. This includes direct name mentions, pronouns "
        f"referring to them, nicknames, and indirect analytical references.\n\n"
        f"For each chapter where the term appears, provide a structured markdown breakdown:\n"
        f"### Chapter title\n"
        f"- **Reference count:** How many times they're referenced\n"
        f"- **Role & Context:** A deep analysis of their role, actions, or significance in that specific chapter.\n\n"
        f"Use rich markdown formatting.\n\n"
        f"CHAPTERS:\n{context}"
    )

    try:
        if not client:
            return jsonify({"error": "Groq API key missing. Please edit app.py with your key!"}), 500
        response = client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You are a strict mention-finding assistant. Read the provided chapters and ONLY report on the mentions of the exact character/term found WITHIN the text provided. Do NOT hallucinate mentions that did not happen in these exact chapters."},
                {"role": "user", "content": prompt}
            ],
            model=MODEL_NAME
        )
        return jsonify({
            "term": term,
            "keyword_results": keyword_results,
            "ai_analysis": response.choices[0].message.content,
        })
    except Exception as e:
        return jsonify({
            "term": term,
            "keyword_results": keyword_results,
            "ai_analysis": f"AI analysis failed: {str(e)}",
        })


@app.route("/api/clear", methods=["POST"])
def clear_chapters():
    """Clear all uploaded chapters."""
    chapters.clear()
    return jsonify({"message": "All chapters cleared"})


# ── Main ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("🔮 Novel Codex server starting...")
    print("   Open http://localhost:5000 in your browser")
    app.run(debug=True, port=5000)
