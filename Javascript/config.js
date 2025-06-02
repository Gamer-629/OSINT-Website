// API Configuration
const CONFIG = {
    API_KEYS: {
        TRUECALLER: process.env.TRUECALLER_API_KEY,
        TWITTER: process.env.TWITTER_API_KEY,
        FACEBOOK: process.env.FACEBOOK_API_KEY,
        INSTAGRAM: process.env.INSTAGRAM_API_KEY,
        GITHUB: process.env.GITHUB_API_KEY,
        WHATSAPP: process.env.WHATSAPP_API_KEY,
        UPI: process.env.UPI_API_KEY
    },
    API_ENDPOINTS: {
        TRUECALLER: 'https://api4.truecaller.com/v1/search',
        TWITTER: 'https://api.twitter.com/2',
        FACEBOOK: 'https://graph.facebook.com/v17.0',
        INSTAGRAM: 'https://graph.instagram.com/v17.0',
        GITHUB: 'https://api.github.com',
        WHATSAPP: 'https://graph.facebook.com/v17.0',
        UPI: 'https://api.upi.system/v1'
    },
    RATE_LIMITS: {
        TRUECALLER: 10, // requests per minute
        TWITTER: 300,   // requests per 15 minutes
        FACEBOOK: 200,  // requests per hour
        INSTAGRAM: 200, // requests per hour
        GITHUB: 5000,   // requests per hour
        WHATSAPP: 80,   // requests per second
        UPI: 100        // requests per minute
    }
};

// Export the configuration
export default CONFIG; 