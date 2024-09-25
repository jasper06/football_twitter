document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['relevantPosts', 'lastRefresh'], (result) => {
        const relevantPosts = result.relevantPosts || [];
        const lastRefresh = result.lastRefresh;

        const latestPostElement = document.getElementById('latestPost');
        const postListElement = document.createElement('ul');

        if (relevantPosts.length > 0) {
            // Display the last 10 relevant posts
            relevantPosts.forEach((post, index) => {
                const listItem = document.createElement('li');
                listItem.innerHTML = `<strong>${post.from}</strong> at ${new Date(post.time).toLocaleString()}:
                                      <p>${post.message}</p>
                                      <a href="${post.link_to_post}" target="_blank">Link to Tweet</a>`;
                postListElement.appendChild(listItem);
            });
            latestPostElement.innerHTML = ""; // Clear the 'Loading latest post...' message
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

    document.getElementById('checkNowButton').addEventListener('click', () => {
        document.getElementById('statusMessage').textContent = "Checking for new posts...";
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.runtime.sendMessage({ action: "checkNow", tabId: tabs[0].id }, (response) => {
                    if (response?.status === "Manual check completed successfully.") {
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
