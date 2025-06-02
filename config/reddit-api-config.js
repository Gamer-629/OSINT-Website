const redditConfig = {
    clientId: process.env.REDDIT_CLIENT_ID,
    clientSecret: process.env.REDDIT_CLIENT_SECRET,
    userAgent: 'reconXhunter:v1.0.0 (by /u/your_reddit_username)',
    defaultParams: {
        limit: 25,
        sort: 'relevance',
        time: 'all'
    }
};

module.exports = redditConfig; 