chrome.alarms.create("refreshPosts", { periodInMinutes: 10 });

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "refreshPosts") {
        checkForNewPosts();
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "checkNow") {
        checkForNewPosts()
            .then(() => {
                sendResponse({ status: "Check completed" });
            })
            .catch(error => {
                console.error("Error during manual check:", error);
                sendResponse({ status: "Check failed" });
            });
        return true; // Indicates we want to send a response asynchronously
    }
});

async function checkForNewPosts() {
    const url = "https://x.com/search?q=excelsior%20-lang%3Aes%20-lang%3Aen%20-from%3ALiberty1Jami&src=typed_query&f=live";
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error("Fetch failed:", response.status, response.statusText);
            return;
        }

        const html = await response.text();
        console.log("Fetched HTML:", html.substring(0, 100)); // Log the first 100 characters

        const newPosts = extractNewPosts(html);

        if (newPosts.length === 0) {
            console.log("No new posts found");
        } else {
            console.log("New posts found:", newPosts);
        }

        const storedPosts = await getStoredPosts();
        const freshPosts = newPosts.filter(post => !storedPosts.some(storedPost => storedPost.link_to_post === post.link_to_post));

        for (const post of freshPosts) {
            const isRelevant = await checkRelevanceWithOllama(post.message);
            if (isRelevant) {
                showNotification(post);
            }
        }

        storePosts(newPosts);
        storeLastRefreshTime(new Date().toISOString());
    } catch (error) {
        console.error("Error in checkForNewPosts:", error);
    }
}


function extractNewPosts(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const articles = doc.querySelectorAll('article[data-testid="tweet"]');
    const posts = [];

    console.log(`Found ${articles.length} articles`);

    articles.forEach(article => {
        const userNameElement = article.querySelector('div[data-testid="User-Name"] a[role="link"] div');
        const timeElement = article.querySelector('time');
        const messageElement = article.querySelector('div[data-testid="tweetText"]');
        const linkElement = article.querySelector('a[href*="/status/"]');

        if (userNameElement && timeElement && messageElement && linkElement) {
            const userName = userNameElement.textContent.trim();
            const time = new Date(timeElement.getAttribute('datetime'));
            const message = messageElement.textContent.trim();
            const linkToPost = 'https://x.com' + linkElement.getAttribute('href');

            posts.push({
                from: userName,
                time: time,
                message: message,
                link_to_post: linkToPost
            });

            console.log("Extracted post:", { userName, time, message, linkToPost });
        }
    });

    return posts;
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
    const response = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "llama3.1",
            prompt: `Is this post about Excelsior football club or one of their players? Post: "${message}"`
        })
    });
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
