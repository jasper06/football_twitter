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
});
