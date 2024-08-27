document.addEventListener('DOMContentLoaded', () => {
    // Display the latest post and last refresh time
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

    // Add click event listener to the "Check Now" button
    document.getElementById('checkNowButton').addEventListener('click', () => {
        document.getElementById('statusMessage').textContent = "Checking for new posts...";
        chrome.runtime.sendMessage({ action: "checkNow" }, (response) => {
            if (response.status === "Check completed") {
                document.getElementById('statusMessage').textContent = "Check completed!";
                // Optionally refresh the displayed data
                setTimeout(() => location.reload(), 1000);
            } else {
                document.getElementById('statusMessage').textContent = "Check failed. Please try again.";
            }
        });
    });
});

