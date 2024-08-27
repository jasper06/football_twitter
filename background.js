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
                console.log(`Post: "${post.message}" | Relevant: ${isRelevant}`);

                if (isRelevant) {
                    console.log(`Notification should be sent: tweet: "${post.message}", Ollama response JSON: ${JSON.stringify(isRelevant)}`);
                    await showNotification(post);
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

/**
 * Function to check if a message contains the word "Excelsior".
 * @param {string} message - The message content of the post.
 * @returns {boolean} - Returns true if the message contains "Excelsior", false otherwise.
 */
function containsExcelsior(message) {
    return message.toLowerCase().includes("excelsior");
}

/**
 * Retrieves stored posts from chrome.storage.local.
 * @returns {Promise<Array>} - Promise resolving to an array of stored posts.
 */
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

/**
 * Stores posts array into chrome.storage.local.
 * @param {Array} posts - Array of posts to store.
 */
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

/**
 * Stores the last refresh time into chrome.storage.local.
 * @param {string} time - ISO string representing the last refresh time.
 */
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

/**
 * Checks the relevance of a post's message using the Ollama API.
 * @param {string} message - The message content of the post.
 * @returns {Promise<object>} - Promise resolving to the Ollama API response.
 */
async function checkRelevanceWithOllama(message) {
    try {
        const apiUrl = "http://127.0.0.1:11434/api/generate";
        const prompt = `I'm looking for posts about Excelsior (usually referred to as Excelsior, Excelsior Rotterdam or Excelsiorrdam), a football club that is linked to new players or leaving players. I'm mainly interested in people saying stuff about Excelsior, potential new players or leaving players. As a first step I want to make sure that the link with the tweet is about a football club, and second if there might be a link with Excelsior. Please review this tweet "${message}" and respond yes or no in this json format: {{"relevant":"", "reason":""}}`;
        console.log("prompt:", prompt);
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

        // Return the full response object to log it later
        return result;

    } catch (error) {
        console.error("Error in checkRelevanceWithOllama:", error);
        return { relevant: "no", reason: "Error occurred during relevance check" }; // Default response to prevent errors
    }
}

/**
 * Shows a desktop notification for a relevant post.
 * @param {Object} post - The post object containing details to display.
 */
function showNotification(post) {
    return new Promise((resolve, reject) => {
        chrome.notifications.create({
            type: "basic",
            iconUrl: "icon.png", // Ensure 'icon.png' exists in your extension directory
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
                        console.log(`Notification with ID: ${notificationId} was clicked. Opening link: ${post.link_to_post}`);
                        chrome.tabs.create({ url: post.link_to_post });
                        chrome.notifications.clear(notificationId);
                    }
                });

                // Auto-clear the notification after 30 seconds for testing purposes
                setTimeout(() => {
                    console.log(`Auto-clearing notification with ID: ${notificationId}`);
                    chrome.notifications.clear(notificationId);
                }, 30000); // 30 seconds for testing, adjust as needed

                resolve();
            }
        });
    });
}

