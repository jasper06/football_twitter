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

/**
 * Function to check for new posts.
 * This function searches for an open tab with the specified URL and injects the content script.
 * If the tab is not found, it opens a new tab and then injects the content script.
 */
// async function checkForNewPosts() {
//     try {
//         const targetUrl = "https://x.com/search?q=excelsior+-lang%3Aes+-lang%3Aen+-from%3ALiberty1Jami&src=typed_query&f=live";
//         let [tab] = await chrome.tabs.query({ url: "*://x.com/*" });

//         if (!tab) {
//             console.log(`No tab found with URL ${targetUrl}. Opening new tab.`);
//             tab = await chrome.tabs.create({ url: targetUrl, active: false });
//             // Wait for the tab to fully load before injecting the script
//             await waitForTabToLoad(tab.id);
//         } else {
//             console.log(`Found existing tab with URL ${tab.url}. Using tab ID: ${tab.id}`);
//             // Bring the tab to the foreground if needed
//             // await chrome.tabs.update(tab.id, { active: true });
//             // Ensure the tab is updated to the latest content
//             await chrome.tabs.reload(tab.id);
//             await waitForTabToLoad(tab.id);
//         }

//         // Inject the content script into the target tab
//         await chrome.scripting.executeScript({
//             target: { tabId: tab.id },
//             files: ['content.js']
//         });

//         console.log("Content script injected successfully.");

//     } catch (error) {
//         console.error("Error in checkForNewPosts:", error);
//     }
// }
async function checkForNewPosts() {
    try {
        const targetUrl = "https://x.com/search?q=excelsior+-lang%3Aes+-lang%3Aen+-from%3ALiberty1Jami&src=typed_query&f=live";
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



/**
 * Helper function to wait for a tab to complete loading.
 * @param {number} tabId - The ID of the tab to wait for.
 */
function waitForTabToLoad(tabId) {
    return new Promise((resolve, reject) => {
        const timeout = 10000; // 10 seconds timeout
        const interval = 500; // Check every 500ms
        let elapsedTime = 0;

        const checkTabStatus = async () => {
            try {
                const tab = await chrome.tabs.get(tabId);
                if (tab.status === 'complete') {
                    resolve();
                } else if (elapsedTime >= timeout) {
                    reject(new Error("Tab loading timed out."));
                } else {
                    elapsedTime += interval;
                    setTimeout(checkTabStatus, interval);
                }
            } catch (error) {
                reject(error);
            }
        };

        checkTabStatus();
    });
}

/**
 * Processes new posts extracted from the content script.
 * Filters out already processed posts, checks relevance, and shows notifications.
 * @param {Array} newPosts - Array of posts extracted from the content script.
 */
async function processNewPosts(newPosts) {
    try {
        const storedPosts = await getStoredPosts();

        // Filter out duplicates based on the unique link_to_post
        const freshPosts = newPosts.filter(
            post => !storedPosts.some(storedPost => storedPost.link_to_post === post.link_to_post)
        );

        console.log(`Found ${freshPosts.length} new posts.`);

        for (const post of freshPosts) {
            const isRelevant = await checkRelevanceWithOllama(post.message);
            console.log(`Post: "${post.message}" | Relevant: ${isRelevant}`);

            if (isRelevant) {
                await showNotification(post);
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
 * @returns {Promise<boolean>} - Promise resolving to true if relevant, false otherwise.
 */
async function checkRelevanceWithOllama(message) {
    try {
        const apiUrl = "http://127.0.0.1:11434/api/generate";
        const prompt = `I'm looking for posts about Excelsior Rotterdam, a football club from the Netherlands. Given the following post, answer with 'yes' if it's related to Excelsior Rotterdam, otherwise answer 'no'.\n\nPost: "${message}"\n\nAnswer:`;

        const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama3.1",
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

        const answer = result.response.trim().toLowerCase();
        return answer === "yes";

    } catch (error) {
        console.error("Error in checkRelevanceWithOllama:", error);
        return false; // Default to not relevant on error to prevent false positives
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
                        chrome.tabs.create({ url: post.link_to_post });
                        chrome.notifications.clear(notificationId);
                    }
                });

                // Auto-clear the notification after a certain time (e.g., 10 seconds)
                setTimeout(() => {
                    chrome.notifications.clear(notificationId);
                }, 10000);

                resolve();
            }
        });
    });
}
