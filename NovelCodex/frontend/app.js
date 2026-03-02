// ── Novel Codex — Client-Side App ──────────────────────────────────────────
const API = "http://localhost:5000";

// ── State ──────────────────────────────────────────────────────────────────
let currentMode = "search";
let allChapters = [];
let selectedSegmentIndex = -1; // -1 means no segment is currently selected for viewing. 0 means Segment 1.

// ── DOM References ─────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const uploadZone = $("upload-zone");
const fileInput = $("file-input");
const folderInput = $("folder-input");
const uploadProgress = $("upload-progress");
const progressBar = $("progress-bar");
const progressText = $("progress-text");
const uploadedFiles = $("uploaded-files");
const searchSection = $("search-section");
const searchInput = $("search-input");
const searchBtn = $("search-btn");
const loading = $("loading");
const loadingText = $("loading-text");
const resultsSection = $("results-section");
const resultsTitle = $("results-title");
const resultsGrid = $("results-grid");
const aiResponse = $("ai-response");
const aiContent = $("ai-response-content");
const chaptersPanel = $("chapters-panel");
const chaptersList = $("chapters-list");
const chapterModal = $("chapter-modal");
const chapterCount = $("chapter-count");
const wordCount = $("word-count");
const clearBtn = $("clear-btn");
const keywordResultsSection = $("keyword-results-section");
const keywordResultsGrid = $("keyword-results-grid");

// ── Upload ─────────────────────────────────────────────────────────────────
uploadZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadZone.classList.add("drag-over");
});

uploadZone.addEventListener("dragleave", () => {
    uploadZone.classList.remove("drag-over");
});

uploadZone.addEventListener("drop", async (e) => {
    e.preventDefault();
    uploadZone.classList.remove("drag-over");

    const items = e.dataTransfer.items;
    if (items && items.length) {
        const files = await getFilesFromDataTransfer(items);
        if (files.length) uploadFiles(files);
    } else {
        const files = e.dataTransfer.files;
        if (files && files.length) uploadFiles(files);
    }
});

async function getFilesFromDataTransfer(items) {
    const files = [];
    const queue = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i].webkitGetAsEntry ? items[i].webkitGetAsEntry() : null;
        if (item) queue.push(item);
    }

    while (queue.length > 0) {
        const entry = queue.shift();
        if (entry.isFile) {
            const file = await new Promise(resolve => entry.file(resolve));
            files.push(file);
        } else if (entry.isDirectory) {
            const reader = entry.createReader();
            const entries = await new Promise(resolve => {
                reader.readEntries(resolve, () => resolve([]));
            });
            queue.push(...entries);
        }
    }
    return files;
}

uploadZone.addEventListener("click", (e) => {
    if (e.target.tagName !== "SPAN" && e.target.tagName !== "CODE") {
        folderInput.click();
    }
});

fileInput.addEventListener("change", () => {
    if (fileInput.files.length) uploadFiles(fileInput.files);
});

folderInput.addEventListener("change", () => {
    if (folderInput.files.length) uploadFiles(folderInput.files);
});

async function uploadFiles(files) {
    const formData = new FormData();
    let count = 0;
    for (const file of files) {
        if (file.name.endsWith(".txt") || file.name.endsWith(".md")) {
            formData.append("files", file);
            count++;
        }
    }

    if (count === 0) {
        showToast("No .txt or .md files found", "error");
        return;
    }

    // Show progress
    uploadProgress.classList.add("visible");
    progressBar.style.width = "20%";
    progressText.textContent = `Uploading ${count} file(s)...`;

    try {
        progressBar.style.width = "60%";
        const res = await fetch(`${API}/api/upload`, {
            method: "POST",
            body: formData,
        });

        progressBar.style.width = "90%";
        const data = await res.json();

        if (data.error) {
            showToast(data.error, "error");
            return;
        }

        progressBar.style.width = "100%";
        progressText.textContent = `Uploaded ${data.uploaded.length} chapter(s)!`;
        showToast(`✅ ${data.uploaded.length} chapter(s) uploaded`, "success");

        // Refresh chapter list
        await loadChapters();

        // Show search section
        searchSection.classList.add("visible");

        setTimeout(() => {
            uploadProgress.classList.remove("visible");
            progressBar.style.width = "0%";
        }, 1500);

    } catch (err) {
        showToast("Upload failed: " + err.message, "error");
        uploadProgress.classList.remove("visible");
    }
}


// ── Load Chapters ──────────────────────────────────────────────────────────
async function loadChapters() {
    try {
        const res = await fetch(`${API}/api/chapters`);
        const data = await res.json();
        allChapters = data.chapters || [];

        // Update header stats
        chapterCount.textContent = allChapters.length;
        const totalWords = allChapters.reduce((sum, ch) => sum + ch.word_count, 0);
        wordCount.textContent = totalWords.toLocaleString();

        // Show/hide clear button
        clearBtn.classList.toggle("visible", allChapters.length > 0);

        // Render chapter list
        renderChapters();

        // Show panels if chapters exist
        if (allChapters.length > 0) {
            chaptersPanel.classList.add("visible");
            searchSection.classList.add("visible");
        }

    } catch (err) {
        console.error("Failed to load chapters:", err);
    }
}

function getSegmentedChapters(chunkSize = 30) {
    const segments = [];
    for (let i = 0; i < allChapters.length; i += chunkSize) {
        segments.push(allChapters.slice(i, i + chunkSize));
    }
    return segments;
}

function renderChapters() {
    const segmentedChapters = getSegmentedChapters();
    const container = $("chapters-list");
    if (!container) return; // Wait until DOM is ready

    container.innerHTML = ""; // Clear existing

    // 1. Render Segment Selector Grid
    let segmentsHtml = "";
    if (segmentedChapters.length > 0) {
        segmentsHtml = `
            <div class="segments-grid">
                ${segmentedChapters.length > 1 ? `
                <div class="segment-card ${selectedSegmentIndex === -2 ? 'active' : ''}" 
                        onclick="selectSegment(-2)">
                    <div class="segment-card-title">All Segments</div>
                    <div class="segment-card-subtitle">Search Across Entire Novel</div>
                </div>
                ` : ""}
                ${segmentedChapters.map((seg, i) => `
                    <div class="segment-card ${i === selectedSegmentIndex ? 'active' : ''}" 
                            onclick="selectSegment(${i})">
                        <div class="segment-card-title">Segment ${i + 1}</div>
                        <div class="segment-card-subtitle">(Ch ${i * 30 + 1} - ${i * 30 + seg.length})</div>
                    </div>
                `).join("")}
            </div>
        `;
    }

    // 2. Render chapters ONLY if a segment is currently selected
    let chaptersHtml = "";
    if (selectedSegmentIndex !== -1) {
        let currentSegment = [];
        let label = "";

        if (selectedSegmentIndex === -2) {
            currentSegment = allChapters;
            label = "All Segments";
        } else if (segmentedChapters[selectedSegmentIndex]) {
            currentSegment = segmentedChapters[selectedSegmentIndex];
            label = `Segment ${selectedSegmentIndex + 1}`;
        }

        if (currentSegment.length > 0) {
            chaptersHtml = `
                <div class="chapters-grid-section">
                    <div class="chapters-header">
                        <div class="chapters-header-box">Showing ${currentSegment.length} chapters from ${label}</div>
                        <button onclick="selectSegment(-1)" class="hide-chapters-btn">Hide Chapters</button>
                    </div>
                    <div class="chapters-grid-inner">
                        ${currentSegment.map((ch, i) => {
                const parsed = splitChapterTitle(formatChapterTitle(ch.title));
                return `
                            <div class="chapter-card" onclick="viewChapter('${ch.id}')" style="animation-delay: ${i * 0.01}s">
                                <div class="chapter-number">${escapeHtml(parsed.num)}</div>
                                <div class="chapter-subtitle">${escapeHtml(parsed.sub)}</div>
                                <div class="chapter-card-meta">${ch.word_count.toLocaleString()} words</div>
                            </div>
                        `}).join("")}
                    </div>
                </div>
            `;
        }
    }

    container.innerHTML = segmentsHtml + chaptersHtml;
}

function selectSegment(index) {
    // If clicking the already selected segment, deselect it (hide chapters)
    if (selectedSegmentIndex === index) {
        selectedSegmentIndex = -1;
    } else {
        selectedSegmentIndex = index;
    }
    renderChapters(); // Re-render the sidebar
}


// ── Mode Switching ─────────────────────────────────────────────────────────
function setMode(mode) {
    currentMode = mode;

    // Update tabs
    document.querySelectorAll(".mode-tab").forEach((tab) => {
        tab.classList.toggle("active", tab.dataset.mode === mode);
    });

    // Update placeholder & button
    const placeholders = {
        search: "Search for a keyword, name, or phrase...",
        ai: "Ask anything about your chapters...",
        summarize: "e.g. 'Summarize chapter 3' or 'Summarize all chapters'",
        mentions: "Enter a character name or term to find...",
    };

    const btnLabels = {
        search: "🔍 <span>Search</span>",
        ai: "✨ <span>Ask AI</span>",
        summarize: "📝 <span>Summarize</span>",
        mentions: "👤 <span>Find</span>",
    };

    searchInput.placeholder = placeholders[mode];
    searchBtn.innerHTML = btnLabels[mode];

    // Clear previous results
    hideResults();
}


// ── Query ────────────────────────────────────────────────────────
async function executeQuery() {
    const query = searchInput.value.trim();
    if (!query && currentMode !== "summarize") {
        showToast("Please enter a query", "info");
        return;
    }

    hideResults();
    showLoading();

    // Limit actions query to ONLY the selected Segment
    const segmentedChapters = getSegmentedChapters();

    // If no segment is selected, we cannot execute a query. Force the user to pick a segment.
    if (selectedSegmentIndex === -1 && currentMode !== "clear") {
        showToast("Please pick a Segment (or All Segments) first!", "error");
        hideLoading();
        return;
    }

    let chapterIds = [];
    if (selectedSegmentIndex === -2) {
        chapterIds = allChapters.map(ch => ch.id);
    } else {
        let currentSegment = segmentedChapters[selectedSegmentIndex] || [];
        chapterIds = currentSegment.map(ch => ch.id);
    }

    try {
        switch (currentMode) {
            case "search":
                await doSearch(query, chapterIds);
                break;
            case "ai":
                await doAI(query, chapterIds);
                break;
            case "summarize":
                await doSummarize(query, chapterIds);
                break;
            case "mentions":
                await doMentions(query, chapterIds);
                break;
        }
    } catch (err) {
        showToast("Request failed: " + err.message, "error");
    } finally {
        hideLoading();
    }
}


// ── Search ─────────────────────────────────────────────────────────────────
async function doSearch(query, chapterIds) {
    loadingText.textContent = "Searching chapters...";
    const res = await fetch(`${API}/api/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: query, chapter_ids: chapterIds }),
    });
    const data = await res.json();

    if (data.error) {
        showToast(data.error, "error");
        return;
    }

    if (data.results.length === 0) {
        resultsTitle.innerHTML = `No matches found for "<strong>${escapeHtml(query)}</strong>"`;
        resultsGrid.innerHTML = `
      <div class="empty-state">
        <span class="empty-state-icon">🔍</span>
        <span class="empty-state-text">No results found. Try a different keyword.</span>
      </div>
    `;
        resultsSection.classList.add("visible");
        return;
    }

    resultsTitle.innerHTML = `Found <strong>${data.total_matches}</strong> matches across <strong>${data.results.length}</strong> chapter(s)`;

    resultsGrid.innerHTML = data.results.map((r, i) => {
        const parsed = splitChapterTitle(formatChapterTitle(r.title));
        return `
      <div class="result-card" onclick="viewChapter('${r.id}')" style="animation-delay: ${i * 0.08}s">
        <div class="result-card-header">
            <div>
              <div class="chapter-number" style="font-size: 1.1rem;">${escapeHtml(parsed.num)}</div>
              <div class="chapter-subtitle">${escapeHtml(parsed.sub)}</div>
            </div>
          <span class="match-badge">${r.match_count} match${r.match_count > 1 ? "es" : ""}</span>
        </div>
        ${r.snippets.map((s) => `
          <div class="result-snippet">${highlightMatch(escapeHtml(s), query)}</div>
        `).join("")}
      </div>
    `}).join("");

    resultsSection.classList.add("visible");
}


// ── AI Ask ─────────────────────────────────────────────────────────────────
async function doAI(question, chapterIds) {
    loadingText.textContent = "AI is reading your chapters...";
    const res = await fetch(`${API}/api/ai/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, chapter_ids: chapterIds }),
    });
    const data = await res.json();

    if (data.error) {
        showToast(data.error, "error");
        return;
    }

    aiContent.innerHTML = renderMarkdown(data.answer);
    keywordResultsSection.style.display = "none";
    aiResponse.classList.add("visible");
}


// ── Summarize ──────────────────────────────────────────────────────────────
async function doSummarize(query, chapterIds) {
    loadingText.textContent = "AI is summarizing your chapters...";

    const res = await fetch(`${API}/api/ai/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapter_ids: chapterIds }),
    });
    const data = await res.json();

    if (data.error) {
        showToast(data.error, "error");
        return;
    }

    aiContent.innerHTML = renderMarkdown(data.summary);
    keywordResultsSection.style.display = "none";
    aiResponse.classList.add("visible");
}


// ── Find Mentions ──────────────────────────────────────────────────────────
async function doMentions(term, chapterIds) {
    loadingText.textContent = `Finding "${term}" across chapters...`;
    const res = await fetch(`${API}/api/ai/find-mentions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term, chapter_ids: chapterIds }),
    });
    const data = await res.json();

    if (data.error) {
        showToast(data.error, "error");
        return;
    }

    // Show AI analysis
    aiContent.innerHTML = renderMarkdown(data.ai_analysis);
    aiResponse.classList.add("visible");

    // Show keyword results if any
    if (data.keyword_results && data.keyword_results.length > 0) {
        keywordResultsSection.style.display = "block";
        keywordResultsGrid.innerHTML = data.keyword_results.map((r, i) => {
            const parsed = splitChapterTitle(formatChapterTitle(r.title));
            return `
      <div class="result-card" onclick="viewChapter('${r.id}')" style="animation-delay: ${i * 0.08}s">
        <div class="result-card-header">
            <div>
              <div class="chapter-number" style="font-size: 1.1rem;">${escapeHtml(parsed.num)}</div>
              <div class="chapter-subtitle">${escapeHtml(parsed.sub)}</div>
            </div>
          <span class="match-badge">${r.match_count} match${r.match_count > 1 ? "es" : ""}</span>
        </div>
        ${r.snippets.slice(0, 3).map((s) => `
          <div class="result-snippet">${highlightMatch(escapeHtml(s), term)}</div>
        `).join("")}
      </div>
    `}).join("");
    } else {
        keywordResultsSection.style.display = "none";
    }
}


// ── Chapter Viewer ─────────────────────────────────────────────────────────
async function viewChapter(id) {
    try {
        const res = await fetch(`${API}/api/chapter/${id}`);
        const data = await res.json();

        if (data.error) {
            showToast(data.error, "error");
            return;
        }

        $("chapter-modal-title").textContent = data.title;
        $("chapter-modal-body").textContent = data.content;
        chapterModal.classList.add("visible");
        document.body.style.overflow = "hidden";
    } catch (err) {
        showToast("Failed to load chapter", "error");
    }
}

function closeChapterModal(e) {
    if (e && e.target !== chapterModal && !e.target.closest(".chapter-modal-close")) return;
    chapterModal.classList.remove("visible");
    document.body.style.overflow = "";
}

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeChapterModal();
});


// ── Clear All ──────────────────────────────────────────────────────────────
async function clearAllChapters() {
    if (!confirm("Clear all uploaded chapters?")) return;

    try {
        await fetch(`${API}/api/clear`, { method: "POST" });
        allChapters = [];
        chapterCount.textContent = "0";
        wordCount.textContent = "0";
        clearBtn.classList.remove("visible");
        chaptersPanel.classList.remove("visible");
        searchSection.classList.remove("visible");
        uploadedFiles.classList.remove("visible");
        uploadedFiles.innerHTML = "";
        hideResults();
        showToast("All chapters cleared", "info");
    } catch (err) {
        showToast("Failed to clear: " + err.message, "error");
    }
}


// ── Utility Functions ──────────────────────────────────────────────────────
function showLoading() {
    loading.classList.add("visible");
}

function hideLoading() {
    loading.classList.remove("visible");
}

function hideResults() {
    resultsSection.classList.remove("visible");
    aiResponse.classList.remove("visible");
    resultsGrid.innerHTML = "";
    aiContent.innerHTML = "";
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function formatChapterTitle(title) {
    if (!title) return "";
    let clean = title.substring(title.lastIndexOf('/') + 1);
    clean = clean.substring(clean.lastIndexOf('\\') + 1);
    return clean.trim();
}

function splitChapterTitle(title) {
    // Looks for "Chapter 1", "Chapter 01", "Chapter 142", etc at the start
    const match = title.match(/^(chapter\s+\d+)(.*)/i);
    if (match) {
        return {
            num: match[1].trim(), // e.g., "Chapter 01"
            sub: match[2].trim().replace(/^[-:]\s*/, "") || "Untitled" // e.g., "How It Began [18+]"
        };
    }
    return { num: title, sub: "" };
}

function highlightMatch(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    return text.replace(regex, "<mark>$1</mark>");
}

function renderMarkdown(text) {
    // Simple markdown renderer
    let html = escapeHtml(text);

    // Headers
    html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
    html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
    html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

    // Bold and italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

    // Inline code
    html = html.replace(/`(.+?)`/g, "<code>$1</code>");

    // Unordered list items
    html = html.replace(/^[*\-] (.+)$/gm, "<li>$1</li>");

    // Wrap consecutive <li> in <ul>
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");

    // Paragraphs (double newlines)
    html = html.replace(/\n\n/g, "</p><p>");
    html = "<p>" + html + "</p>";

    // Clean up empty paragraphs
    html = html.replace(/<p>\s*<\/p>/g, "");
    html = html.replace(/<p>(<h[1-3]>)/g, "$1");
    html = html.replace(/(<\/h[1-3]>)<\/p>/g, "$1");
    html = html.replace(/<p>(<ul>)/g, "$1");
    html = html.replace(/(<\/ul>)<\/p>/g, "$1");

    // Line breaks
    html = html.replace(/\n/g, "<br>");

    return html;
}

function showToast(message, type = "info") {
    const container = $("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3500);
}


// ── Init ───────────────────────────────────────────────────────────────────
loadChapters();
