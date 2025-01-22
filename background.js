// background.js
// OllamaService class for handling all Ollama interactions
class OllamaService {
    constructor() {
        this.baseUrl = "http://127.0.0.1:11434";
        this.currentModel = "mistral-nemo:latest";
        this.isInitialized = false;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.lastSuccessfulCheck = null;
        this.healthCheckInterval = null;
        this.prompt = `I'm looking for posts about Excelsior (usually referred to as Excelsior, Excelsior Rotterdam or Excelsiorrdam), a football club that plays in the Dutch league. I'm mainly interested in people saying stuff about Excelsior, potential new players, leaving players or other news about the club. As a first step I want to make sure that the link with the tweet is about a football club, and second if there might be a link with Excelsior. Please review this tweet "{message}" and respond yes or no in this json format: {{"relevant":"", "reason":""}}`;
        this.setupHealthCheck();
    }

    setupHealthCheck() {
        // Clear any existing interval
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        // Check health every minute
        this.healthCheckInterval = setInterval(async () => {
            await this.checkHealth();
        }, 60000);
    }

    async checkHealth() {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`, {
                method: "GET",
                headers: { "Accept": "application/json" },
                signal: AbortSignal.timeout(5000) // 5 second timeout
            });

            if (response.ok) {
                this.lastSuccessfulCheck = Date.now();
                return true;
            }

            console.warn("Health check failed, attempting to reinitialize...");
            this.isInitialized = false;
            await this.initialize(true);
            return false;
        } catch (error) {
            console.warn("Health check failed:", error.message);
            this.isInitialized = false;
            await this.initialize(true);
            return false;
        }
    }

    async initialize(isRetry = false) {
        if (this.isInitialized && !isRetry) return true;

        try {
            // Add delay between retries
            if (isRetry && this.retryCount > 0) {
                const delayMs = Math.min(1000 * Math.pow(2, this.retryCount), 30000); // exponential backoff up to 30s
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }

            const modelCheck = await fetch(`${this.baseUrl}/api/tags`, {
                signal: AbortSignal.timeout(5000)
            });

            if (!modelCheck.ok) {
                throw new Error(`Model check failed: ${modelCheck.status}`);
            }

            const models = await modelCheck.json();
            console.log("Available models:", models);

            // Check if our model is available
            const hasModel = models.models?.some(model =>
                model.name.startsWith("mistral-nemo") || model.name.startsWith("mistral:"));

            if (!hasModel) {
                console.warn("Preferred model not found, attempting to use alternative model");
                this.currentModel = "mistral:latest";
            }

            this.isInitialized = true;
            this.retryCount = 0; // Reset retry count on successful initialization
            this.lastSuccessfulCheck = Date.now();
            return true;
        } catch (error) {
            console.error("Failed to initialize Ollama service:", error);
            this.retryCount++;

            this.showErrorNotification(
                "Ollama Service Error",
                `Cannot connect to Ollama (Attempt ${this.retryCount}/${this.maxRetries}). Please ensure the service is running.`
            );

            // If we haven't exceeded max retries, try again
            if (this.retryCount < this.maxRetries) {
                return await this.initialize(true);
            }

            return false;
        }
    }

    showErrorNotification(title, message) {
        if (chrome.notifications) {
            chrome.notifications.create({
                type: "basic",
                iconUrl: "icon.png",
                title: title,
                message: message
            });
        }
    }

    async checkRelevance(message) {
        try {
            // Check if too much time has passed since last successful check
            const timeSinceLastCheck = this.lastSuccessfulCheck ? Date.now() - this.lastSuccessfulCheck : Infinity;
            if (timeSinceLastCheck > 300000) { // 5 minutes
                this.isInitialized = false; // Force reinitialization
            }

            if (!this.isInitialized) {
                const initialized = await this.initialize();
                if (!initialized) {
                    return { relevant: "no", reason: "Ollama service not initialized" };
                }
            }

            const response = await fetch(`${this.baseUrl}/api/generate`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                signal: AbortSignal.timeout(30000), // 30 second timeout for generation
                body: JSON.stringify({
                    model: this.currentModel,
                    prompt: this.prompt.replace("{message}", message),
                    format: "json",
                    stream: false
                })
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status}`);
            }

            const result = await response.json();
            let parsedResponse = this.parseOllamaResponse(result);
            this.lastSuccessfulCheck = Date.now(); // Update last successful check
            return parsedResponse;

        } catch (error) {
            console.error("Error in checkRelevance:", error);

            // Reset initialization if we get a connection error
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                this.isInitialized = false;
            }

            // Try to reinitialize and retry
            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                await this.initialize(true);
                return await this.checkRelevance(message);
            }

            return {
                relevant: "no",
                reason: `Error: ${error.message}`
            };
        }
    }

    parseOllamaResponse(result) {
        try {
            let parsedResponse = typeof result.response === 'string'
                ? JSON.parse(result.response)
                : result.response;

            return {
                relevant: String(parsedResponse?.relevant || "no").toLowerCase() === "yes" ? "yes" : "no",
                reason: parsedResponse?.reason || "No reason provided"
            };
        } catch (error) {
            console.error("Error parsing Ollama response:", error);
            return {
                relevant: "no",
                reason: "Failed to parse response"
            };
        }
    }
}

// Create singleton instance
const ollamaService = new OllamaService();

// Add cleanup handler for extension unload
chrome.runtime.onSuspend.addListener(() => {
    if (ollamaService.healthCheckInterval) {
        clearInterval(ollamaService.healthCheckInterval);
    }
});

// Initialize Ollama service when extension loads
chrome.runtime.onInstalled.addListener(async () => {
    console.log("Extension installed/updated - initializing Ollama service...");
    await ollamaService.initialize();
});

// Set up periodic alarm to check for new posts every 5 minutes
chrome.alarms.create("refreshPosts", { periodInMinutes: 5 });

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
        const targetUrl = "https://x.com/search?q=excelsior+-from%3ALiberty1Jami&src=typed_query&f=live";
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
        const relevantPosts = await getRelevantPosts(); // Get stored relevant posts

        // Filter out duplicates based on the unique link_to_post (extract tweet ID from the URL)
        const freshPosts = newPosts.filter(
            post => !storedPosts.some(storedPost => storedPost.link_to_post === post.link_to_post) &&
                    !relevantPosts.some(relevantPost => getTweetId(relevantPost.link_to_post) === getTweetId(post.link_to_post))
        );

        console.log(`Found ${freshPosts.length} new posts.`);

        for (const post of freshPosts) {
            if (containsExcelsior(post.message)) {
                const isRelevant = await checkRelevanceWithOllama(post.message);
                console.log(`Post: "${post.message}" | Relevant: ${isRelevant.relevant}`);

                if (isRelevant.relevant === "yes") {
                    console.log(`Notification should be sent: tweet: "${post.message}", Ollama response JSON: ${JSON.stringify(isRelevant)}`);
                    await showNotification(post);

                    // Add relevant post to local storage if it's not already there
                    relevantPosts.unshift(post); // Add new relevant post to the top
                } else {
                    console.log(`No notification: tweet "${post.message}", Reason: ${isRelevant.reason}`);
                }
            } else {
                console.log(`Filtered out post (no 'Excelsior' in message): "${post.message}"`);
            }
        }

        // Save the top 10 relevant posts
        const postsToStore = relevantPosts.slice(0, 10); // Limit to 10 posts
        await storeRelevantPosts(postsToStore);

        // Combine and sort all posts, keep only the latest 100 to prevent storage bloat
        const allPosts = [...freshPosts, ...storedPosts];
        allPosts.sort((a, b) => new Date(b.time) - new Date(a.time));
        const postsToStoreAll = allPosts.slice(0, 100);

        await storePosts(postsToStoreAll);
        await storeLastRefreshTime(new Date().toISOString());

        console.log("Posts processing completed successfully.");

    } catch (error) {
        console.error("Error in processNewPosts:", error);
        throw error;
    }
}

// Function to extract tweet ID from the tweet URL
function getTweetId(link) {
    const match = link.match(/\/status\/(\d+)/);
    return match ? match[1] : null;
}

// Helper functions for relevant posts storage

function getRelevantPosts() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(["relevantPosts"], (result) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(result.relevantPosts || []);
            }
        });
    });
}

function storeRelevantPosts(posts) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set({ relevantPosts: posts }, () => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                console.log("Relevant posts stored successfully.");
                resolve();
            }
        });
    });
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


// Replace the old checkRelevanceWithOllama function
async function checkRelevanceWithOllama(message) {
    return await ollamaService.checkRelevance(message);
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