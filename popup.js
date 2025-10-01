// popup.js
// Simple tab switching functionality
function openTab(evt, tabName) {
    console.log("openTab called:", tabName);

    // Hide all tab contents
    const tabcontents = document.getElementsByClassName("tabcontent");
    for (let i = 0; i < tabcontents.length; i++) {
        tabcontents[i].classList.remove("active");
    }

    // Remove active class from all tab buttons
    const tablinks = document.getElementsByClassName("tablinks");
    for (let i = 0; i < tablinks.length; i++) {
        tablinks[i].classList.remove("active");
    }

    // Show the selected tab and activate the button
    const targetTab = document.getElementById(tabName);
    if (targetTab) {
        targetTab.classList.add("active");
        console.log("Activated tab:", tabName);
    } else {
        console.error("Tab not found:", tabName);
    }

    if (evt && evt.currentTarget) {
        evt.currentTarget.classList.add("active");
        console.log("Activated button");
    }
}

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log("Popup DOM loaded");

    // CRITICAL: Setup tab event listeners
    try {
        const postsTab = document.querySelector('[data-tab="PostsTab"]');
        const termsTab = document.querySelector('[data-tab="TermsTab"]');

        console.log("Posts tab element:", postsTab);
        console.log("Terms tab element:", termsTab);

        if (postsTab) {
            postsTab.addEventListener('click', (e) => {
                console.log("Posts tab clicked");
                openTab(e, 'PostsTab');
            });
        }

        if (termsTab) {
            termsTab.addEventListener('click', (e) => {
                console.log("Terms tab clicked");
                openTab(e, 'TermsTab');
            });
        }

        console.log("Tab listeners setup complete");
    } catch (error) {
        console.error("Error setting up tabs:", error);
    }

    // Load data for both tabs
    loadPostsTab();
    loadTemporaryTermsTab();

    // Setup Check Now button
    const checkNowBtn = document.getElementById('checkNowButton');
    if (checkNowBtn) {
        checkNowBtn.addEventListener('click', handleCheckNow);
    }

    // Setup temporary terms form
    const form = document.getElementById('addTermForm');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            addTemporaryTerm();
        });
    }

    // Setup event delegation for remove buttons
    const termsList = document.getElementById('temporaryTermsList');
    if (termsList) {
        termsList.addEventListener('click', (event) => {
            if (event.target && event.target.matches('.remove-btn')) {
                const termId = event.target.dataset.termId;
                handleRemoveTemporaryTerm(termId);
            }
        });
    }
});

function handleCheckNow() {
    console.log("Check Now button clicked. Checking for new posts...");

    document.getElementById('statusMessage').textContent = "Checking for new posts...";
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.runtime.sendMessage({ action: "checkNow", tabId: tabs[0].id }, (response) => {
                if (response?.status === "Manual check completed successfully.") {
                    console.log("Manual check completed successfully.");
                    document.getElementById('statusMessage').textContent = "Check completed!";
                    setTimeout(() => loadPostsTab(), 1000);
                } else {
                    console.log("Manual check failed:", response?.error || "Unknown error");
                    document.getElementById('statusMessage').textContent = "Check failed. Please try again.";
                }
            });
        } else {
            console.log("No active tab found.");
            document.getElementById('statusMessage').textContent = "No active tab found.";
        }
    });
}

function loadPostsTab() {
    console.log("Loading posts...");
    chrome.storage.local.get(['relevantPosts', 'lastRefresh'], (result) => {
        const relevantPosts = result.relevantPosts || [];
        const lastRefresh = result.lastRefresh;

        console.log("Loaded relevant posts:", relevantPosts.length);

        const latestPostElement = document.getElementById('latestPost');
        const postListElement = document.createElement('ul');

        if (relevantPosts.length > 0) {
            relevantPosts.slice(0, 50).forEach((post, index) => {
                const listItem = document.createElement('li');
                const searchContext = post.searchContext || 'excelsior';
                const reasoning = post.ollamaReasoning || 'No reasoning available';

                listItem.innerHTML = `<strong>${post.from}</strong> at ${new Date(post.time).toLocaleString()}:
                                      <p>${post.message}</p>
                                      <p class="search-context">Found via: ${searchContext}</p>
                                      <p class="ollama-reasoning"><strong>LLM Reasoning:</strong> ${reasoning}</p>
                                      <a href="${post.link_to_post}" target="_blank">Link to Tweet</a>`;
                postListElement.appendChild(listItem);
            });
            latestPostElement.innerHTML = "";
            latestPostElement.appendChild(postListElement);
        } else {
            latestPostElement.textContent = "No relevant posts found.";
        }

        if (lastRefresh) {
            document.getElementById('lastRefresh').textContent = `Last refresh: ${new Date(lastRefresh).toLocaleString()}`;
        } else {
            document.getElementById('lastRefresh').textContent = "Last refresh: Never.";
        }
    });
}

function loadTemporaryTermsTab() {
    console.log("Loading temporary terms...");

    chrome.runtime.sendMessage({ action: "getTemporaryTerms" }, (response) => {
        if (response?.status === "success") {
            displayTemporaryTerms(response.data);
        } else {
            console.error("Failed to load temporary terms:", response?.error);
            document.getElementById('temporaryTermsList').textContent = "Error loading temporary terms.";
        }
    });
}

function displayTemporaryTerms(terms) {
    const container = document.getElementById('temporaryTermsList');

    if (terms.length === 0) {
        container.innerHTML = '<p>No temporary search terms active.</p>';
        return;
    }

    let html = '';
    terms.forEach(term => {
        const shortPrompt = term.customPrompt.length > 100
            ? term.customPrompt.substring(0, 100) + '...'
            : term.customPrompt;

        html += `
            <div class="temporary-term">
                <h4>${term.searchTerm}</h4>
                <p><strong>Added:</strong> ${new Date(term.dateAdded).toLocaleString()}</p>
                <p><strong>Status:</strong> ${term.isActive ? 'Active' : 'Inactive'}</p>
                <p class="prompt-preview"><strong>Prompt:</strong> ${shortPrompt}</p>
                <button class="btn btn-danger remove-btn" data-term-id="${term.id}">Remove</button>
            </div>
        `;
    });

    container.innerHTML = html;
}

function addTemporaryTerm() {
    const searchTerm = document.getElementById('searchTerm').value.trim();
    const customPrompt = document.getElementById('customPrompt').value.trim();

    if (!searchTerm || !customPrompt) {
        alert('Please fill in both the search term and custom prompt.');
        return;
    }

    if (!customPrompt.includes('{message}')) {
        alert('Custom prompt must include {message} as a placeholder for the tweet text.');
        return;
    }

    console.log("Adding temporary term:", { searchTerm, customPrompt });

    chrome.runtime.sendMessage({
        action: "addTemporaryTerm",
        data: { searchTerm, customPrompt }
    }, (response) => {
        if (response?.status === "Temporary term added successfully.") {
            console.log("Temporary term added successfully.");

            document.getElementById('addTermForm').reset();
            loadTemporaryTermsTab();
            alert('Temporary search term added successfully!');
        } else {
            console.error("Failed to add temporary term:", response?.error);
            alert('Failed to add temporary search term. Please try again.');
        }
    });
}

function handleRemoveTemporaryTerm(termId) {
    if (!confirm('Are you sure you want to remove this search term?')) {
        return;
    }

    console.log("Removing temporary term:", termId);

    chrome.runtime.sendMessage({
        action: "removeTemporaryTerm",
        data: { id: termId }
    }, (response) => {
        if (response?.status === "Temporary term removed successfully.") {
            console.log("Temporary term removed successfully.");
            loadTemporaryTermsTab();
            alert('Temporary search term removed successfully!');
        } else {
            console.error("Failed to remove temporary term:", response?.error);
            alert('Failed to remove temporary search term. Please try again.');
        }
    });
}