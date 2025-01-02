document.addEventListener('DOMContentLoaded', () => {
    // Log when the popup is opened
    console.log("Popup opened. Loading relevant posts...");

    // Retrieve relevant posts and last refresh time from Chrome storage
    chrome.storage.local.get(['relevantPosts', 'lastRefresh'], (result) => {
        const relevantPosts = result.relevantPosts || [];
        const lastRefresh = result.lastRefresh;

        // Log the retrieved relevant posts
        console.log("Loaded relevant posts:", relevantPosts);

        const latestPostElement = document.getElementById('latestPost');
        const postListElement = document.createElement('ul');

        if (relevantPosts.length > 0) {
            // Display the last 10 relevant posts
            relevantPosts.forEach((post, index) => {
                console.log(`Post #${index + 1}:`, post); // Log each post

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

        // Log the last refresh time
        if (lastRefresh) {
            console.log("Last refresh time:", new Date(lastRefresh).toLocaleString());
            document.getElementById('lastRefresh').textContent = `Last refresh: ${new Date(lastRefresh).toLocaleString()}`;
        } else {
            document.getElementById('lastRefresh').textContent = "Last refresh: Never.";
        }
    });

    // Add listener for the "Check Now" button
    document.getElementById('checkNowButton').addEventListener('click', () => {
        console.log("Check Now button clicked. Checking for new posts...");

        document.getElementById('statusMessage').textContent = "Checking for new posts...";
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.runtime.sendMessage({ action: "checkNow", tabId: tabs[0].id }, (response) => {
                    if (response?.status === "Manual check completed successfully.") {
                        console.log("Manual check completed successfully.");
                        document.getElementById('statusMessage').textContent = "Check completed!";
                        setTimeout(() => location.reload(), 1000); // Reload popup after 1 second
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
    });
});
