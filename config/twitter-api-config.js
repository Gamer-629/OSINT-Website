const twitterConfig = {
    apiKey: process.env.TWITTER_API_KEY,
    apiKeySecret: process.env.TWITTER_API_KEY_SECRET,
    bearerToken: process.env.TWITTER_BEARER_TOKEN,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
    defaultParams: {
        max_results: 25,
        tweet: {
            fields: ['created_at', 'public_metrics', 'entities', 'context_annotations'],
        },
        user: {
            fields: ['description', 'public_metrics', 'verified', 'location', 'url', 'profile_image_url']
        }
    }
};

module.exports = twitterConfig; 