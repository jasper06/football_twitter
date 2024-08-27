// background.js

// Set up periodic alarm to check for new posts every 10 minutes
chrome.alarms.create("refreshPosts", { periodInMinutes: 10 });

// Listen for the alarm and trigger check for new posts
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "refreshPosts") {
        console.log("Alarm triggered: Checking for new posts...");
        await checkForNewPosts();
    }
});

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "postsExtracted") {
        console.log("Posts extracted from content script:", request.data);
        processNewPosts(request.data)
            .then(() => sendResponse({ status: "Posts processed successfully." }))
            .catch((error) => {
                console.error("Error processing posts:", error);
                sendResponse({ status: "Error processing posts.", error: error.message });
            });
        return true; // Indicates that the response is asynchronous
    }

    if (request.action === "checkNow") {
        console.log("Manual check triggered from popup.");
        checkForNewPosts()
            .then(() => sendResponse({ status: "Manual check completed successfully." }))
            .catch((error) => {
                console.error("Error during manual check:", error);
                sendResponse({ status: "Error during manual check.", error: error.message });
            });
        return true; // Indicates that the response is asynchronous
    }
});

async function checkForNewPosts() {
    try {
        const targetUrl = "https://x.com/search?q=excelsior+-lang%3Aes+-from%3ALiberty1Jami&src=typed_query&f=live";
        let [tab] = await chrome.tabs.query({ url: targetUrl });

        if (!tab) {
            console.log(`No tab found with URL ${targetUrl}. Opening new tab.`);
            tab = await chrome.tabs.create({ url: targetUrl, active: false });
            await waitForTabToLoad(tab.id);
        } else {
            console.log(`Found existing tab with URL ${tab.url}. Using tab ID: ${tab.id}`);
            await chrome.tabs.reload(tab.id);
            await waitForTabToLoad(tab.id);
        }

        // Inject the content script after ensuring the page is fully loaded
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
        });

        console.log("Content script injected successfully.");
    } catch (error) {
        console.error("Error in checkForNewPosts:", error);
    }
}

function waitForTabToLoad(tabId) {
    return new Promise((resolve, reject) => {
        const maxWaitTime = 20000; // 20 seconds max wait time
        const checkInterval = 500; // Check every 500ms
        let elapsedTime = 0;

        const intervalId = setInterval(async () => {
            const tab = await chrome.tabs.get(tabId);
            if (tab.status === 'complete') {
                clearInterval(intervalId);
                resolve();
            } else if (elapsedTime >= maxWaitTime) {
                clearInterval(intervalId);
                reject(new Error("Tab loading timed out."));
            } else {
                elapsedTime += checkInterval;
            }
        }, checkInterval);
    });
}

async function processNewPosts(newPosts) {
    try {
        const storedPosts = await getStoredPosts();

        // Filter out duplicates based on the unique link_to_post
        const freshPosts = newPosts.filter(
            post => !storedPosts.some(storedPost => storedPost.link_to_post === post.link_to_post)
        );

        console.log(`Found ${freshPosts.length} new posts.`);

        for (const post of freshPosts) {
            // Preprocess: Ensure the message contains "Excelsior"
            if (containsExcelsior(post.message)) {
                const isRelevant = await checkRelevanceWithOllama(post.message);
                console.log(`Post: "${post.message}" | Relevant: ${isRelevant.relevant}`);

                if (isRelevant.relevant === "yes") {
                    console.log(`Notification should be sent: tweet: "${post.message}", Ollama response JSON: ${JSON.stringify(isRelevant)}`);
                    await showNotification(post);
                } else {
                    console.log(`No notification: tweet "${post.message}", Reason: ${isRelevant.reason}`);
                }
            } else {
                console.log(`Filtered out post (no 'Excelsior' in message): "${post.message}"`);
            }
        }

        // Combine and sort all posts, keep only the latest 100 to prevent storage bloat
        const allPosts = [...freshPosts, ...storedPosts];
        allPosts.sort((a, b) => new Date(b.time) - new Date(a.time));
        const postsToStore = allPosts.slice(0, 100);

        await storePosts(postsToStore);
        await storeLastRefreshTime(new Date().toISOString());

        console.log("Posts processing completed successfully.");

    } catch (error) {
        console.error("Error in processNewPosts:", error);
        throw error;
    }
}

function containsExcelsior(message) {
    return message.toLowerCase().includes("excelsior");
}

function getStoredPosts() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(["posts"], (result) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(result.posts || []);
            }
        });
    });
}

function storePosts(posts) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set({ posts }, () => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                console.log("Posts stored successfully.");
                resolve();
            }
        });
    });
}

function storeLastRefreshTime(time) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set({ lastRefresh: time }, () => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                console.log("Last refresh time stored successfully.");
                resolve();
            }
        });
    });
}

async function checkRelevanceWithOllama(message) {
    try {
        const apiUrl = "http://127.0.0.1:11434/api/generate";
        const prompt = `I'm looking for posts about Excelsior (usually referred to as Excelsior, Excelsior Rotterdam or Excelsiorrdam), a football club that is linked to new players or leaving players. I'm mainly interested in people saying stuff about Excelsior, potential new players or leaving players. As a first step I want to make sure that the link with the tweet is about a football club, and second if there might be a link with Excelsior. Please review this tweet "${message}" and respond yes or no in this json format: {{"relevant":"", "reason":""}}`;

        const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "mistral-nemo",
                prompt: prompt,
                format: "json",
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama API request failed with status ${response.status}`);
        }

        const result = await response.json();
        console.log("Ollama API Response:", result);

        // Handle different possible formats of the 'response' field
        let parsedResponse;
        try {
            // Attempt to parse the 'response' as a JSON string
            parsedResponse = JSON.parse(result.response);
        } catch (e) {
            console.error("Failed to parse response as JSON string. Attempting to handle manually.", e);
            // Handle the case where the response might not be a valid JSON string
            parsedResponse = result.response;
        }

        // Normalize the 'relevant' and 'reason' fields
        let relevant = "no";
        let reason = "No reason provided.";

        if (typeof parsedResponse === 'string') {
            // If parsedResponse is a string, try to parse it as JSON
            try {
                parsedResponse = JSON.parse(parsedResponse);
                relevant = parsedResponse.relevant?.toString().toLowerCase() || "no";
                reason = parsedResponse.reason || reason;
            } catch (e) {
                console.error("Failed to parse inner JSON string.", e);
            }
        } else if (typeof parsedResponse === 'object') {
            // If parsedResponse is an object, extract relevant fields
            relevant = parsedResponse.relevant?.toString().toLowerCase() || "no";
            reason = parsedResponse.reason || reason;
        }

        return {
            relevant: relevant === "yes" || relevant === "true" ? "yes" : "no",
            reason: reason
        };

    } catch (error) {
        console.error("Error in checkRelevanceWithOllama:", error);
        return { relevant: "no", reason: "Error occurred while checking relevance." };
    }
}


function showNotification(post) {
    return new Promise((resolve, reject) => {
        chrome.notifications.create({
            type: "basic",
            iconUrl: "icon.png",
            title: "New Excelsior Post",
            message: `${post.from}: ${post.message}`,
            priority: 2
        }, (notificationId) => {
            if (chrome.runtime.lastError) {
                console.error("Error creating notification:", chrome.runtime.lastError.message);
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                console.log(`Notification shown with ID: ${notificationId}`);

                // Add a click listener to open the post link when the notification is clicked
                chrome.notifications.onClicked.addListener((clickedNotificationId) => {
                    if (clickedNotificationId === notificationId) {
                        chrome.tabs.create({ url: post.link_to_post });
                        chrome.notifications.clear(notificationId);
                    }
                });

                // Auto-clear the notification after a certain time (e.g., 10 seconds)
                setTimeout(() => {
                    chrome.notifications.clear(notificationId);
                    console.log(`Auto-clearing notification with ID: ${notificationId}`);
                }, 10000);

                resolve();
            }
        });
    });
}
