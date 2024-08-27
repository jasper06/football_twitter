document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['posts', 'lastRefresh'], (result) => {
        const latestPost = result.posts?.[0];
        const lastRefresh = result.lastRefresh;

        if (latestPost) {
            document.getElementById('latestPost').textContent = `Latest post from ${latestPost.from} at ${new Date(latestPost.time).toLocaleString()}: "${latestPost.message}"`;
        } else {
            document.getElementById('latestPost').textContent = "No posts found.";
        }

        if (lastRefresh) {
            document.getElementById('lastRefresh').textContent = `Last refresh: ${new Date(lastRefresh).toLocaleString()}`;
        } else {
            document.getElementById('lastRefresh').textContent = "Last refresh: Never.";
        }
    });

    document.getElementById('checkNowButton').addEventListener('click', () => {
        document.getElementById('statusMessage').textContent = "Checking for new posts...";
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.runtime.sendMessage({ action: "checkNow", tabId: tabs[0].id }, (response) => {
                    if (response?.status === "Script executed") {
                        document.getElementById('statusMessage').textContent = "Check completed!";
                        setTimeout(() => location.reload(), 1000);
                    } else {
                        document.getElementById('statusMessage').textContent = "Check failed. Please try again.";
                    }
                });
            } else {
                document.getElementById('statusMessage').textContent = "No active tab found.";
            }
        });
    });
});
