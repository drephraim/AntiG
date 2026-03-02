// script.js for Pen_Drop Portfolio

// script.js for Pen_Drop Portfolio

document.addEventListener("DOMContentLoaded", () => {
    // Basic initialization code
    initSmoothScroll();
    initNavbar();
    initParticles();
    initCodexSearch();
});

function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

function initNavbar() {
    const navbar = document.querySelector('.navbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.style.background = 'rgba(10, 10, 12, 0.95)';
            navbar.style.boxShadow = '0 4px 30px rgba(0, 0, 0, 0.5)';
        } else {
            navbar.style.background = 'rgba(10, 10, 12, 0.8)';
            navbar.style.boxShadow = 'none';
        }
    });
}

function initParticles() {
    tsParticles.load("tsparticles", {
        fpsLimit: 60,
        particles: {
            color: { value: ["#d4af37", "#c41e3a", "#ffffff"] },
            links: {
                color: "#ffffff",
                distance: 150,
                enable: true,
                opacity: 0.05,
                width: 1
            },
            move: {
                enable: true,
                speed: 0.8,
                direction: "none",
                random: true,
                outModes: "out"
            },
            number: {
                density: { enable: true, area: 800 },
                value: 40
            },
            opacity: { value: 0.3, random: true },
            size: { value: { min: 1, max: 3 } }
        }
    });
}

let localCodexDB = [];

function initCodexSearch() {
    const folderInput = document.getElementById('chapter-folder');
    const loadedCount = document.getElementById('loaded-count');
    const searchInput = document.getElementById('codex-search');
    const searchBtn = document.getElementById('search-btn');
    const resultsContainer = document.getElementById('search-results');

    folderInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files).filter(file => file.name.endsWith('.txt'));
        if (files.length === 0) {
            alert('No .txt files found in the selected folder!');
            return;
        }

        loadedCount.textContent = "Loading chapters...";
        localCodexDB = [];

        // Read all text files from the selected local directory
        for (const file of files) {
            try {
                const text = await file.text();
                localCodexDB.push({
                    name: file.name.replace('.txt', ''),
                    content: text
                });
            } catch (err) {
                console.error("Error reading file:", file.name, err);
            }
        }

        loadedCount.textContent = `${localCodexDB.length} chapters loaded!`;
        loadedCount.style.color = 'var(--primary-gold)';
        searchInput.disabled = false;
        searchBtn.disabled = false;
        searchInput.placeholder = "Enter text to search in loaded chapters...";
    });

    // Helper to extract a context snippet around the matched search text
    function getSnippet(text, query, padding = 60) {
        const index = text.toLowerCase().indexOf(query);
        if (index === -1) return "Snippet not found.";

        const start = Math.max(0, index - padding);
        const end = Math.min(text.length, index + query.length + padding);

        let snippet = text.substring(start, end);
        if (start > 0) snippet = "..." + snippet;
        if (end < text.length) snippet = snippet + "...";

        // Highlight the matched query
        const regex = new RegExp(`(${query})`, "gi");
        return snippet.replace(regex, '<span style="color: var(--primary-red); font-weight: bold;">$1</span>');
    }

    async function performSearch() {
        if (localCodexDB.length === 0) return;

        const query = searchInput.value.trim();
        resultsContainer.innerHTML = '';

        if (query === '') {
            resultsContainer.classList.add('hidden');
            return;
        }

        resultsContainer.classList.remove('hidden');
        resultsContainer.innerHTML = '<div style="text-align:center; padding: 20px;"><div class="loader" style="margin: 0 auto 10px; width: 30px; height: 30px; border: 3px solid rgba(212,175,55,0.3); border-radius: 50%; border-top-color: var(--primary-gold); animation: spin 1s ease-in-out infinite;"></div><p style="color: var(--primary-gold);">The Codex is consulting the ancient texts... (This may take a few seconds)</p></div>';

        if (!document.getElementById('codex-loader-style')) {
            const style = document.createElement('style');
            style.id = 'codex-loader-style';
            style.innerHTML = '@keyframes spin { to { transform: rotate(360deg); } }';
            document.head.appendChild(style);
        }

        const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

        localCodexDB.forEach(chapter => {
            chapter.score = 0;
            const lowerText = chapter.content.toLowerCase() + " " + chapter.name.toLowerCase();
            words.forEach(w => {
                const count = (lowerText.match(new RegExp(w, 'g')) || []).length;
                chapter.score += count;
            });
        });

        const topChapters = [...localCodexDB].sort((a, b) => b.score - a.score).slice(0, 3);

        let contextString = "";
        topChapters.forEach(c => {
            contextString += `\n--- Chapter: ${c.name} ---\n${c.content}\n`;
        });

        try {
            const response = await fetch('http://localhost:5000/api/ask', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: query, context: contextString })
            });

            const data = await response.json();

            if (data.error) {
                resultsContainer.innerHTML = `<div class="no-results" style="color: var(--primary-red);">Error: ${data.error}</div>`;
                return;
            }

            let formattedAnswer = data.answer.replace(/\*\*(.*?)\*\*/g, '<strong style="color: var(--primary-gold);">$1</strong>');
            formattedAnswer = formattedAnswer.replace(/\n/g, '<br>');

            resultsContainer.innerHTML = `
                <div class="result-item" style="border: 1px solid var(--primary-gold); box-shadow: 0 0 15px rgba(212, 175, 55, 0.1);">
                    <div class="result-term" style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 1.5rem;">🔮</span> AI Codex Response
                    </div>
                    <p style="margin-top: 15px; font-size: 1.05rem; color: #e0e0e0; line-height: 1.8;">${formattedAnswer}</p>
                    <div style="margin-top: 20px; font-size: 0.85rem; color: #a0a0b0; border-top: 1px solid var(--border-glass); padding-top: 10px;">
                        <strong>Analyzed Chapters:</strong> ${topChapters.map(c => c.name).join(', ')}
                    </div>
                </div>
            `;

        } catch (err) {
            resultsContainer.innerHTML = `<div class="no-results" style="color: var(--primary-red);">Failed to connect to the AI Codex backend. Is the Python server running on port 5000?</div>`;
            console.error(err);
        }
    }

    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });
}
