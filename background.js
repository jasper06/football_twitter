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
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].id) {
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

    // Filter out duplicates and check for relevance
    const freshPosts = newPosts.filter(post => !storedPosts.some(storedPost => storedPost.link_to_post === post.link_to_post));

    for (const post of freshPosts) {
        const isRelevant = await checkRelevanceWithOllama(post.message);
        console.log(`Post: "${post.message}" | Relevant: ${isRelevant}`);
        if (isRelevant) {
            showNotification(post);
        }
    }

    // Store both old and new posts, sorted by time
    const allPosts = [...storedPosts, ...freshPosts];
    allPosts.sort((a, b) => new Date(b.time) - new Date(a.time));

    storePosts(allPosts);
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
            model: "llama3.1",
            prompt: `I'm looking for posts about Excelsior Rotterdam, a football club from the Netherlands. : "${message}", please answer with yes or no if you think with this knowledge that there is a chance that this tweet is saying something about Excelsior. Just answer 'yes' or 'no'.`,
            format: "json",
            stream: false
        })
    });

    if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
    }

    const result = await response.json();
    console.log("Ollama API Response:", result); // Log the entire response

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
