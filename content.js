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

// Send the posts data back to the background script
chrome.runtime.sendMessage({
    action: "postsExtracted",
    data: extractPostsFromPage()
});
