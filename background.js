chrome.alarms.create("refreshPosts", { periodInMinutes: 10 });

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "refreshPosts") {
        checkForNewPosts();
    }
});

async function checkForNewPosts() {
    const url = "https://x.com/search?q=excelsior%20-lang%3Aes%20-lang%3Aen%20-from%3ALiberty1Jami&src=typed_query&f=live";
    const response = await fetch(url);
    const html = await response.text();

    // Extract new posts from the HTML (this is a simplified example)
    const newPosts = extractNewPosts(html);

    for (const post of newPosts) {
        const isRelevant = await checkRelevanceWithOllama(post);
        if (isRelevant) {
            showNotification(post);
        }
    }
}

function extractNewPosts(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const articles = doc.querySelectorAll('article[data-testid="tweet"]');
    const posts = [];

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
        }
    });

    return posts;
}

async function checkRelevanceWithOllama(post) {
    // Implement Ollama API call here
    // This is a placeholder and needs to be implemented with actual Ollama integration
    const response = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "llama2",
            prompt: `Is this post about Excelsior football club or one of their players? Post: "${post}"`
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
        message: post
    });
}
