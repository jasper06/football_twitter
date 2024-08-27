chrome.alarms.create("refreshPosts", { periodInMinutes: 10 });

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "refreshPosts") {
        checkForNewPosts();
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "postsExtracted") {
        const newPosts = request.data;
        processNewPosts(newPosts)
            .then(() => sendResponse({ status: "Posts processed" }))
            .catch((error) => {
                console.error("Error processing posts:", error);
                sendResponse({ status: "Error processing posts" });
            });
        return true; // Indicates we want to send a response asynchronously
    }

    if (request.action === "checkNow") {
        // Use chrome.tabs.query to find the active tab
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].id) {
                // Inject the content script and run it
                chrome.scripting.executeScript(
                    {
                        target: { tabId: tabs[0].id },
                        files: ['content.js']
                    },
                    () => {
                        console.log("Content script injected and executed.");
                        sendResponse({ status: "Script executed" });
                    }
                );
            } else {
                console.error("No active tab found.");
                sendResponse({ status: "No active tab found" });
            }
        });
        return true; // Indicates we want to send a response asynchronously
    }
});

async function processNewPosts(newPosts) {
    const storedPosts = await getStoredPosts();
    const freshPosts = newPosts.filter(post => !storedPosts.some(storedPost => storedPost.link_to_post === post.link_to_post));

    for (const post of freshPosts) {
        const isRelevant = await checkRelevanceWithOllama(post.message);
        if (isRelevant) {
            showNotification(post);
        }
    }

    storePosts([...storedPosts, ...freshPosts]); // Store both old and new posts
    storeLastRefreshTime(new Date().toISOString());
}

async function getStoredPosts() {
    return new Promise((resolve) => {
        chrome.storage.local.get(["posts"], (result) => {
            resolve(result.posts || []);
        });
    });
}

function storePosts(posts) {
    console.log("Storing posts:", posts);
    chrome.storage.local.set({ posts });
}

function storeLastRefreshTime(time) {
    console.log("Storing last refresh time:", time);
    chrome.storage.local.set({ lastRefresh: time });
}

async function checkRelevanceWithOllama(message) {
    const response = await fetch("http://127.0.0.1:11434/api/generate", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: "llama3",
            prompt: `Is this post about Excelsior football club or one of their players? Post: "${message}"`,
            format: "json",
            stream: false
        })
    });

    if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
    }

    const result = await response.json();
    return result.response.toLowerCase().includes("yes");
}


function showNotification(post) {
    chrome.notifications.create({
        type: "basic",
        iconUrl: "icon.png",
        title: "New Excelsior Post",
        message: `${post.from}: ${post.message}`,
        contextMessage: post.link_to_post
    });
}
