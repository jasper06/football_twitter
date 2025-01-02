// background.js
// OllamaService class for handling all Ollama interactions
class OllamaService {
    constructor() {
        this.baseUrl = "http://127.0.0.1:11434";
        this.currentModel = "mistral-nemo:latest";
        this.isInitialized = false;
        this.retryCount = 0;
        this.maxRetries = 3;
    }

    async initialize() {
        if (this.isInitialized) return true;

        try {
            // Check service availability
            const modelCheck = await fetch(`${this.baseUrl}/api/tags`);
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
            return true;
        } catch (error) {
            console.error("Failed to initialize Ollama service:", error);
            this.showErrorNotification("Ollama Service Error",
                "Cannot connect to Ollama. Please ensure the service is running.");
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
            if (!this.isInitialized) {
                const initialized = await this.initialize();
                if (!initialized) {
                    return { relevant: "no", reason: "Ollama service not initialized" };
                }
            }

            const prompt = `I'm looking for posts about Excelsior (usually referred to as Excelsior, Excelsior Rotterdam or Excelsiorrdam), a football club that plays in the Dutch league. I'm mainly interested in people saying stuff about Excelsior, potential new players, leaving players or other news about the club. As a first step I want to make sure that the link with the tweet is about a football club, and second if there might be a link with Excelsior. Please review this tweet "${message}" and respond yes or no in this json format: {{"relevant":"", "reason":""}}`;

            const response = await fetch(`${this.baseUrl}/api/generate`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: this.currentModel,
                    prompt: prompt,
                    format: "json",
                    stream: false
                })
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status}`);
            }

            const result = await response.json();
            let parsedResponse = this.parseOllamaResponse(result);
            return parsedResponse;

        } catch (error) {
            console.error("Error in checkRelevance:", error);

            // Try to reinitialize on error
            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                this.isInitialized = false;
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

// Initialize Ollama service when extension loads
chrome.runtime.onInstalled.addListener(async () => {
    console.log("Extension installed/updated - initializing Ollama service...");
    await ollamaService.initialize();
});

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

async function checkOllamaAvailability() {
    const baseUrl = "http://127.0.0.1:11434";

    try {
        console.log("Checking model availability...");
        const modelCheck = await fetch(`${baseUrl}/api/tags`, {
            method: "GET",
            headers: {
                "Accept": "application/json"
            }
        });

        console.log("Model endpoint status:", modelCheck.status);

        if (!modelCheck.ok) {
            console.error(`Model check failed: ${modelCheck.status}`);
            return false;
        }

        const models = await modelCheck.json();
        console.log("Available models:", models);

        // Improved model check that handles version tags
        const hasRequiredModel = models.models?.some(model => {
            const modelName = model.name.split(':')[0]; // Split on ':' to remove version tag
            return modelName === "mistral-nemo" || modelName === "mistral";
        });

        if (!hasRequiredModel) {
            console.error("Required model (mistral-nemo) not found. Available models:",
                models.models?.map(m => m.name).join(', '));

            if (chrome.notifications) {
                chrome.notifications.create({
                    type: "basic",
                    iconUrl: "icon.png",
                    title: "Ollama Model Not Found",
                    message: "Please install the required model: ollama pull mistral-nemo"
                });
            }
            return false;
        }

        return true;

    } catch (error) {
        console.error("Detailed Ollama connection error:", {
            message: error.message,
            stack: error.stack,
            type: error.name
        });

        if (chrome.notifications) {
            chrome.notifications.create({
                type: "basic",
                iconUrl: "icon.png",
                title: "Ollama Connection Error",
                message: `Cannot connect to Ollama: ${error.message}. Please ensure the service is running.`
            });
        }
        return false;
    }
}

// Update the main checkRelevanceWithOllama function to also handle versioned model names
async function checkRelevanceWithOllama(message) {
    try {
        const apiUrl = "http://127.0.0.1:11434/api/generate";
        const prompt = `I'm looking for posts about Excelsior (usually referred to as Excelsior, Excelsior Rotterdam or Excelsiorrdam), a football club that plays in the Dutch league. I'm mainly interested in people saying stuff about Excelsior, potential new players, leaving players or other news about the club. As a first step I want to make sure that the link with the tweet is about a football club, and second if there might be a link with Excelsior. Please review this tweet "${message}" and respond yes or no in this json format: {{"relevant":"", "reason":""}}`;

        const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "mistral-nemo:latest", // Updated to include version tag
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

        let parsedResponse;
        try {
            parsedResponse = typeof result.response === 'string'
                ? JSON.parse(result.response)
                : result.response;
        } catch (parseError) {
            console.warn("Failed to parse response as JSON:", parseError);
            return {
                relevant: "no",
                reason: "Failed to parse Ollama response"
            };
        }

        const relevant = String(parsedResponse?.relevant || "no").toLowerCase();
        const reason = parsedResponse?.reason || "No reason provided";

        return {
            relevant: relevant === "yes" || relevant === "true" ? "yes" : "no",
            reason: reason
        };

    } catch (error) {
        console.error("Error in checkRelevanceWithOllama:", error);
        return {
            relevant: "no",
            reason: `Error occurred: ${error.message}`
        };
    }
}

// async function testNoCorsCall() {
//     try {
//         const apiUrl = "http://127.0.0.1:11434/api/generate";
//         const prompt = "What is the result of 2x4?";

//         const response = await fetch(apiUrl, {
//             method: "POST",
//             // mode: "no-cors",  // Bypass CORS restrictions
//             headers: {
//                 "Content-Type": "application/json"
//             },
//             body: JSON.stringify({
//                 model: "mistral-nemo",
//                 prompt: prompt,
//                 format: "json",
//                 stream: false
//             })
//         });

//         // Since no-cors prevents us from reading the response, just check if the request completed
//         console.log('Request sent successfully!', response.json());
//     } catch (error) {
//         console.error('Error in no-cors fetch call:', error);
//     }
// }
// // Test the call by triggering the function when your extension is loaded or when a button is clicked
// chrome.runtime.onInstalled.addListener(() => {
//     console.log('the result of 2x4 is:');
//     testNoCorsCall();  // Test the no-cors call when the extension is installed/loaded
// });