import os
import traceback
from flask import Flask, request, jsonify
from flask_cors import CORS
from google import genai

app = Flask(__name__)
# Enable CORS so the local frontend can talk to this API
CORS(app)

# The API key the user provided
api_key = "AIzaSyCKh52fgG9Y5iAudxwnu22-oNj8q7p8wwc"
client = genai.Client(api_key=api_key)

@app.route('/api/ask', methods=['POST'])
def ask():
    data = request.json
    query = data.get('query', '')
    context = data.get('context', '')
    
    if not query or not context:
        return jsonify({"error": "Missing query or context"}), 400
        
    prompt = f"""
    You are the Supreme Codex, an AI encyclopedia for the Webnovel author Pen_Drop.
    Using ONLY the following excerpts from the chapters provided below, answer the user's question completely and accurately.
    If the answer cannot be found in the excerpts, politely state that the current archives do not contain enough specific knowledge.
    Always cite the Source / Chapter Name when providing information. Do not invent any lore.
    
    Excerpts:
    {context}
    
    User Question: {query}
    """
    
    try:
        # Using Gemini 2.0 Flash for fast text generation
        response = client.models.generate_content(
            model='gemini-2.0-flash',
            contents=prompt
        )
        return jsonify({"answer": response.text})
    except Exception as e:
        error_msg = str(e)
        print("API Error:", error_msg)
        traceback.print_exc()
        if "429" in error_msg or "RESOURCE_EXHAUSTED" in error_msg:
            return jsonify({"error": "API quota exhausted. Your Gemini API key has exceeded its free tier limit. Please generate a new API key at https://aistudio.google.com/apikey or enable billing."}), 429
        return jsonify({"error": "Failed to connect to AI Codex. Check the server console for details."}), 500

if __name__ == '__main__':
    # Run the server on port 5000
    print("Starting Supreme Codex AI Backend...")
    app.run(port=5000)
