function extractPostsFromPage() {
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
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

    // Sort posts by time in descending order (newest first)
    posts.sort((a, b) => b.time - a.time);

    console.log('Extracted posts:', posts); // Log the posts to verify extraction

    return posts;
}

function waitForTweets() {
    return new Promise((resolve) => {
        const maxAttempts = 20; // Try up to 20 times
        let attempts = 0;

        const intervalId = setInterval(() => {
            const articles = document.querySelectorAll('article[data-testid="tweet"]');
            if (articles.length > 0 || attempts >= maxAttempts) {
                clearInterval(intervalId);
                resolve();
            } else {
                attempts += 1;
            }
        }, 500); // Check every 500ms
    });
}

// Wait for tweets to be loaded and then extract them
waitForTweets().then(() => {
    chrome.runtime.sendMessage({
        action: "postsExtracted",
        data: extractPostsFromPage()
    });
});
