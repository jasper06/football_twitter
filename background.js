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
        this.defaultPrompt = `I'm looking for posts about Excelsior (usually referred to as Excelsior, Excelsior Rotterdam or Excelsiorrdam), a football club that plays in the Dutch league. I'm mainly interested in people saying stuff about Excelsior, potential new players, leaving players or other news about the club. As a first step I want to make sure that the link with the tweet is about a football club, and second if there might be a link with Excelsior. Please review this tweet "{message}" and respond yes or no in this json format: {{"relevant":"", "reason":""}}`;
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
            if (response.status === 403) {
                console.error("Forbidden error: CORS issue detected");
                // Log the actual headers for debugging
                console.log("Response headers:", Object.fromEntries([...response.headers]));
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

    async checkRelevance(message, customPrompt = null) {
        try {
            // Check initialization as before
            const timeSinceLastCheck = this.lastSuccessfulCheck ? Date.now() - this.lastSuccessfulCheck : Infinity;
            if (timeSinceLastCheck > 300000) {
                this.isInitialized = false;
            }

            if (!this.isInitialized) {
                const initialized = await this.initialize();
                if (!initialized) {
                    return { relevant: "no", reason: "Ollama service not initialized" };
                }
            }

            // Use custom prompt if provided, otherwise use default
            const promptToUse = customPrompt || this.defaultPrompt;

            // Get the extension's origin for the request
            const extensionOrigin = chrome.runtime.getURL("");
            console.log("Making request from origin:", extensionOrigin);

            // More comprehensive request headers
            const headers = {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Origin": extensionOrigin,
                "X-Requested-With": "XMLHttpRequest"
            };

            // Log the complete request configuration
            console.log("Request configuration:", {
                url: `${this.baseUrl}/api/generate`,
                headers: headers,
                body: {
                    model: this.currentModel,
                    prompt: promptToUse.replace("{message}", message),
                    format: "json",
                    stream: false
                }
            });

            const response = await fetch(`${this.baseUrl}/api/generate`, {
                method: "POST",
                headers: headers,
                signal: AbortSignal.timeout(130000),
                body: JSON.stringify({
                    model: this.currentModel,
                    prompt: promptToUse.replace("{message}", message),
                    format: "json",
                    stream: false
                })
            });

            // Log detailed response information
            console.log("Response status:", response.status);
            console.log("Response headers:", Object.fromEntries([...response.headers]));

            if (!response.ok) {
                const errorText = await response.text();
                console.error("Error response body:", errorText);
                throw new Error(`API request failed: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            let parsedResponse = this.parseOllamaResponse(result);
            this.lastSuccessfulCheck = Date.now();
            return parsedResponse;

        } catch (error) {
            console.error("Error in checkRelevance:", error);

            if (error.message.includes('403')) {
                console.error("CORS Error detected. Please verify OLLAMA_ORIGINS setting.");
                console.log("Extension ID:", chrome.runtime.id);
                console.log("Extension Origin:", chrome.runtime.getURL(""));
            }

            // Reset initialization if we get a connection error
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                this.isInitialized = false;
            }

            // Limit retries to prevent infinite loop
            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                console.log(`Retrying request (attempt ${this.retryCount}/${this.maxRetries})`);
                await this.initialize(true);
                return await this.checkRelevance(message, customPrompt);
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
        processNewPosts(request.data, request.searchContext)
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

    if (request.action === "addTemporaryTerm") {
        console.log("Adding temporary search term:", request.data);
        addTemporarySearchTerm(request.data)
            .then(() => sendResponse({ status: "Temporary term added successfully." }))
            .catch((error) => {
                console.error("Error adding temporary term:", error);
                sendResponse({ status: "Error adding temporary term.", error: error.message });
            });
        return true;
    }

    if (request.action === "removeTemporaryTerm") {
        console.log("Removing temporary search term:", request.data.id);
        removeTemporarySearchTerm(request.data.id)
            .then(() => sendResponse({ status: "Temporary term removed successfully." }))
            .catch((error) => {
                console.error("Error removing temporary term:", error);
                sendResponse({ status: "Error removing temporary term.", error: error.message });
            });
        return true;
    }

    if (request.action === "getTemporaryTerms") {
        getTemporarySearchTerms()
            .then((terms) => sendResponse({ status: "success", data: terms }))
            .catch((error) => {
                console.error("Error getting temporary terms:", error);
                sendResponse({ status: "Error getting temporary terms.", error: error.message });
            });
        return true;
    }
});

async function checkForNewPosts() {
    try {
        // Get all active search terms (main Excelsior + temporary terms)
        const temporaryTerms = await getTemporarySearchTerms();
        const activeTemporaryTerms = temporaryTerms.filter(term => term.isActive);

        // Always include the main Excelsior search
        const mainSearch = {
            id: "main_excelsior",
            searchTerm: "excelsior",
            customPrompt: ollamaService.defaultPrompt,
            url: "https://x.com/search?q=excelsior+-from%3ALiberty1Jami&src=typed_query&f=live",
            isMain: true
        };

        const allSearches = [mainSearch, ...activeTemporaryTerms.map(term => ({
            id: term.id,
            searchTerm: term.searchTerm,
            customPrompt: term.customPrompt,
            url: `https://x.com/search?q=${encodeURIComponent(term.searchTerm)}&src=typed_query&f=live`,
            isMain: false
        }))];

        console.log(`Executing ${allSearches.length} searches: 1 main + ${activeTemporaryTerms.length} temporary`);

        // Execute each search in parallel
        const searchPromises = allSearches.map(async (search) => {
            return await executeSearchForTerm(search);
        });

        await Promise.all(searchPromises);
        console.log("All searches completed successfully.");

    } catch (error) {
        console.error("Error in checkForNewPosts:", error);
    }
}

async function executeSearchForTerm(searchConfig) {
    try {
        console.log(`Executing search for: ${searchConfig.searchTerm}`);

        let [tab] = await chrome.tabs.query({ url: searchConfig.url });

        if (!tab) {
            console.log(`No tab found with URL ${searchConfig.url}. Opening new tab.`);
            tab = await chrome.tabs.create({ url: searchConfig.url, active: false });
            await waitForTabToLoad(tab.id);
        } else {
            console.log(`Found existing tab with URL ${tab.url}. Using tab ID: ${tab.id}`);
            await chrome.tabs.reload(tab.id);
            await waitForTabToLoad(tab.id);
        }

        // Inject the content script with search context
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (searchContext) => {
                // Store search context for the content script
                window.searchContext = searchContext;
            },
            args: [searchConfig]
        });

        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
        });

        console.log(`Content script injected successfully for search: ${searchConfig.searchTerm}`);
    } catch (error) {
        console.error(`Error executing search for ${searchConfig.searchTerm}:`, error);
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

async function processNewPosts(newPosts, searchContext) {
    try {
        console.log(`Processing ${newPosts.length} posts for search: ${searchContext.searchTerm}`);

        const storedPosts = await getStoredPosts();
        const relevantPosts = await getRelevantPosts();

        // Filter out duplicates based on tweet ID (handles /photo and other URL variations)
        const freshPosts = newPosts.filter(post => {
            const newPostId = getTweetId(post.link_to_post);
            if (!newPostId) return false; // Skip posts without valid tweet IDs

            // Check against stored posts using tweet ID
            const isDuplicateStored = storedPosts.some(storedPost =>
                getTweetId(storedPost.link_to_post) === newPostId
            );

            // Check against relevant posts using tweet ID  
            const isDuplicateRelevant = relevantPosts.some(relevantPost =>
                getTweetId(relevantPost.link_to_post) === newPostId
            );

            return !isDuplicateStored && !isDuplicateRelevant;
        });

        console.log(`Found ${freshPosts.length} new posts for search: ${searchContext.searchTerm}`);

        for (const post of freshPosts) {
            // For main Excelsior search, use the existing containsExcelsior filter
            // For temporary terms, check if the search term appears in the message
            let shouldProcess = false;

            if (searchContext.isMain) {
                shouldProcess = containsExcelsior(post.message);
            } else {
                shouldProcess = containsSearchTerm(post.message, searchContext.searchTerm);
            }

            if (shouldProcess) {
                const isRelevant = await checkRelevanceWithOllama(post.message, searchContext.customPrompt);
                console.log(`Post: "${post.message}" | Search: ${searchContext.searchTerm} | Relevant: ${isRelevant.relevant}`);

                if (isRelevant.relevant === "yes") {
                    console.log(`Notification should be sent: tweet: "${post.message}", Search: ${searchContext.searchTerm}, Ollama response JSON: ${JSON.stringify(isRelevant)}`);
                    await showNotification(post, searchContext.searchTerm);

                    // Add relevant post to local storage if it's not already there
                    post.searchContext = searchContext.searchTerm; // Add context to the post
                    post.ollamaReasoning = isRelevant.reason; // Add LLM reasoning
                    relevantPosts.unshift(post);
                } else {
                    console.log(`No notification: tweet "${post.message}", Search: ${searchContext.searchTerm}, Reason: ${isRelevant.reason}`);
                }
            } else {
                console.log(`Filtered out post (no '${searchContext.searchTerm}' in message): "${post.message}"`);
            }
        }

        // Save the top 100 relevant posts (increased from 10)
        const postsToStore = relevantPosts.slice(0, 100);
        await storeRelevantPosts(postsToStore);

        // Combine and sort all posts, keep only the latest 100 to prevent storage bloat
        const allPosts = [...freshPosts, ...storedPosts];
        allPosts.sort((a, b) => new Date(b.time) - new Date(a.time));
        const postsToStoreAll = allPosts.slice(0, 100);

        await storePosts(postsToStoreAll);
        await storeLastRefreshTime(new Date().toISOString());

        console.log(`Posts processing completed successfully for search: ${searchContext.searchTerm}`);

    } catch (error) {
        console.error("Error in processNewPosts:", error);
        throw error;
    }
}

// Function to check if a message contains a specific search term
function containsSearchTerm(message, searchTerm) {
    const normalizedMessage = message
        .normalize('NFKD')
        .replace(/[^\x00-\x7F]/g, '')
        .toLowerCase();

    const normalizedSearchTerm = searchTerm
        .normalize('NFKD')
        .replace(/[^\x00-\x7F]/g, '')
        .toLowerCase();

    return normalizedMessage.includes(normalizedSearchTerm);
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

// Temporary search terms management functions
function getTemporarySearchTerms() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(["temporarySearchTerms"], (result) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(result.temporarySearchTerms || []);
            }
        });
    });
}

function storeTemporarySearchTerms(terms) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set({ temporarySearchTerms: terms }, () => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                console.log("Temporary search terms stored successfully.");
                resolve();
            }
        });
    });
}

async function addTemporarySearchTerm(termData) {
    try {
        const existingTerms = await getTemporarySearchTerms();

        const newTerm = {
            id: Date.now().toString(), // Simple ID generation
            searchTerm: termData.searchTerm,
            customPrompt: termData.customPrompt,
            dateAdded: new Date().toISOString(),
            isActive: true
        };

        existingTerms.push(newTerm);
        await storeTemporarySearchTerms(existingTerms);

        console.log("Temporary search term added:", newTerm);
    } catch (error) {
        console.error("Error adding temporary search term:", error);
        throw error;
    }
}

async function removeTemporarySearchTerm(termId) {
    try {
        const existingTerms = await getTemporarySearchTerms();
        const filteredTerms = existingTerms.filter(term => term.id !== termId);

        await storeTemporarySearchTerms(filteredTerms);

        console.log("Temporary search term removed:", termId);
    } catch (error) {
        console.error("Error removing temporary search term:", error);
        throw error;
    }
}

function containsExcelsior(message) {
    // Convert the message to a normalized form
    const normalizedMessage = message
        // Normalize Unicode characters to their basic form
        .normalize('NFKD')
        // Remove any remaining non-ASCII characters
        .replace(/[^\x00-\x7F]/g, '')
        // Convert to lowercase for case-insensitive matching
        .toLowerCase();

    // Check for "excelsior" in the normalized text
    return normalizedMessage.includes('excelsior');
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
async function checkRelevanceWithOllama(message, customPrompt = null) {
    return await ollamaService.checkRelevance(message, customPrompt);
}

function showNotification(post, searchContext = "Excelsior") {
    return new Promise((resolve, reject) => {
        // Use the post link as the notification ID
        const notificationId = post.link_to_post;

        chrome.notifications.create(notificationId, {
            type: "basic",
            iconUrl: "icon.png",
            title: `New ${searchContext} Post`,
            message: `${post.from}: ${post.message}`,
            priority: 2
        }, (createdId) => {
            if (chrome.runtime.lastError) {
                console.error("Error creating notification:", chrome.runtime.lastError.message);
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                console.log(`Notification shown with ID: ${createdId}`);
                // The top-level listener will handle the click
                resolve();
            }
        });
    });
}