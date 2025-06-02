const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { getJson } = require('serpapi');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const axios = require('axios');
const snoowrap = require('snoowrap');
const { TwitterApi } = require('twitter-api-v2');

// Load environment variables
const result = dotenv.config();
if (result.error) {
    console.error('Error loading .env file:', result.error);
}

// Validate environment variables
if (!process.env.SERP_API_KEY) {
    console.error('WARNING: SERP_API_KEY is not set in environment variables');
    console.error('Please create a .env file in the project root with:');
    console.error('SERP_API_KEY=your_serp_api_key_here');
}

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from the root directory
app.use(express.static(__dirname));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api', limiter);

// Load SERP API configuration
const serpConfig = require('./config/google-api-config');

// Load Reddit API configuration
const redditConfig = require('./config/reddit-api-config');

// Load Twitter API configuration
const twitterConfig = require('./config/twitter-api-config');

// Initialize Reddit API client
let redditClient;
try {
    redditClient = new snoowrap({
        userAgent: redditConfig.userAgent,
        clientId: redditConfig.clientId,
        clientSecret: redditConfig.clientSecret,
        username: process.env.REDDIT_USERNAME,
        password: process.env.REDDIT_PASSWORD
    });
} catch (error) {
    console.error('Error initializing Reddit client:', error);
}

// Initialize Twitter client
let twitterClient;
try {
    // First try to initialize with OAuth 1.0a credentials
    if (twitterConfig.accessToken && twitterConfig.accessTokenSecret) {
        if (!twitterConfig.apiKey || !twitterConfig.apiKeySecret) {
            throw new Error('Twitter API Key and Secret are required for OAuth 1.0a');
        }
        twitterClient = new TwitterApi({
            appKey: twitterConfig.apiKey,
            appSecret: twitterConfig.apiKeySecret,
            accessToken: twitterConfig.accessToken,
            accessSecret: twitterConfig.accessTokenSecret,
        });
        console.log('Twitter client initialized with OAuth 1.0a');
    } 
    // Fallback to Bearer Token
    else if (twitterConfig.bearerToken) {
        twitterClient = new TwitterApi(twitterConfig.bearerToken);
        console.log('Twitter client initialized with Bearer Token');
    } else {
        throw new Error('No valid Twitter credentials provided. Need either OAuth 1.0a credentials or Bearer Token');
    }

    // Verify the client is working
    twitterClient.v2.me().then(() => {
        console.log('Twitter client verified successfully');
    }).catch((error) => {
        console.error('Twitter client verification failed:', error.message);
    });

} catch (error) {
    console.error('Error initializing Twitter client:', error.message);
    console.error('Twitter credentials status:', {
        hasApiKey: !!twitterConfig.apiKey,
        hasApiSecret: !!twitterConfig.apiKeySecret,
        hasAccessToken: !!twitterConfig.accessToken,
        hasAccessSecret: !!twitterConfig.accessTokenSecret,
        hasBearerToken: !!twitterConfig.bearerToken
    });
}

// Helper function for SERP API requests
async function makeSerpApiRequest(query, type = 'search', extraParams = {}) {
    try {
        // Log the SERP API request parameters for debugging
        console.log('SERP API Request:', {
            query,
            type,
            extraParams,
            apiKeyPresent: !!serpConfig.apiKey
        });

        const params = {
            ...serpConfig.defaultParams,
            engine: "google",
            api_key: serpConfig.apiKey,
            q: query,
            ...extraParams
        };

        const response = await getJson(params);
        return response;
    } catch (error) {
        console.error('SERP API request failed:', error);
        throw error;
    }
}

// Helper function for platform searches
async function handlePlatformSearch(platform, query, type) {
    // Log the search request for debugging
    console.log('Search Request:', { platform, query, type });
    
    switch(platform) {
        case 'google':
            try {
                let searchResults;
                
                // Handle different types of searches
                switch(type) {
                    case 'places':
                        searchResults = await makeSerpApiRequest(query, 'places', {
                            engine: 'google_maps'
                        });
                        break;
                        
                    case 'geocode':
                        searchResults = await makeSerpApiRequest(query, 'geocode', {
                            engine: 'google_maps'
                        });
                        break;
                        
                    default:
                        // Default web search
                        searchResults = await makeSerpApiRequest(query);
                        if (!searchResults) {
                            throw new Error('No results returned from SERP API');
                        }
                        return {
                            found: true,
                            data: searchResults,
                            url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
                            description: `Google search results for ${query}`
                        };
                }
                
                if (!searchResults) {
                    throw new Error('No results returned from SERP API');
                }
                
                // Add URL for maps searches
                const url = type === 'places' || type === 'geocode' 
                    ? `https://www.google.com/maps/search/${encodeURIComponent(query)}`
                    : `https://www.google.com/search?q=${encodeURIComponent(query)}`;
                
                return {
                    found: true,
                    data: searchResults,
                    url: url,
                    description: `Google ${type} results for ${query}`
                };
            } catch (error) {
                console.error('SERP API error:', error);
                return {
                    found: false,
                    error: 'SERP API request failed',
                    description: error.message,
                    details: error.toString(),
                    url: `https://www.google.com/search?q=${encodeURIComponent(query)}`
                };
            }
            
        case 'facebook':
            return {
                found: true,
                url: `https://www.facebook.com/search/top?q=${encodeURIComponent(query)}`,
                description: `Facebook search results for ${query}`,
                status: 'found'
            };
            
        case 'twitter':
            return {
                found: true,
                url: `https://twitter.com/search?q=${encodeURIComponent(query)}`,
                description: `Twitter search results for ${query}`,
                status: 'found'
            };
            
        case 'instagram':
            const instagramUrl = type === 'username' 
                ? `https://www.instagram.com/${encodeURIComponent(query)}/`
                : `https://www.instagram.com/explore/tags/${encodeURIComponent(query)}/`;
            return {
                found: true,
                url: instagramUrl,
                description: `Instagram ${type === 'username' ? 'profile' : 'search'} for ${query}`,
                status: 'found'
            };
            
        case 'hunter':
            try {
                const hunterApiKey = process.env.HUNTER_API_KEY;
                if (!hunterApiKey) {
                    throw new Error('Hunter.io API key not configured');
                }

                let hunterUrl;
                let hunterResponse;

                if (type === 'domain') {
                    hunterUrl = `https://api.hunter.io/v2/domain-search`;
                    hunterResponse = await axios.get(hunterUrl, {
                        params: {
                            domain: query,
                            api_key: hunterApiKey
                        }
                    });
                } else if (type === 'email') {
                    hunterUrl = `https://api.hunter.io/v2/email-verifier`;
                    hunterResponse = await axios.get(hunterUrl, {
                        params: {
                            email: query,
                            api_key: hunterApiKey
                        }
                    });
                }

                return {
                    found: true,
                    data: hunterResponse.data,
                    url: type === 'domain' 
                        ? `https://hunter.io/search/${encodeURIComponent(query)}`
                        : `https://hunter.io/email-verifier/${encodeURIComponent(query)}`,
                    description: `Hunter.io ${type} search results for ${query}`,
                    status: 'found'
                };
            } catch (error) {
                return {
                    found: false,
                    error: error.message,
                    description: `Error searching Hunter.io: ${error.message}`,
                    status: 'error'
                };
            }
            
        case 'github':
            try {
                const githubResponse = await fetch(`https://api.github.com/search/users?q=${encodeURIComponent(query)}`, {
                    headers: process.env.GITHUB_API_KEY ? {
                        'Authorization': `token ${process.env.GITHUB_API_KEY}`,
                        'Accept': 'application/vnd.github.v3+json'
                    } : {}
                });
                const data = await githubResponse.json();
                return {
                    found: true,
                    data: data,
                    url: type === 'username' 
                        ? `https://github.com/${encodeURIComponent(query)}`
                        : `https://github.com/search?q=${encodeURIComponent(query)}&type=users`,
                    description: `GitHub search results for ${query}`,
                    status: 'found'
                };
            } catch (error) {
                return {
                    found: false,
                    error: error.message,
                    url: `https://github.com/search?q=${encodeURIComponent(query)}&type=users`,
                    description: `Error searching GitHub: ${error.message}`,
                    status: 'error'
                };
            }
            
        case 'reddit':
            return {
                found: true,
                url: type === 'username'
                    ? `https://www.reddit.com/user/${encodeURIComponent(query)}`
                    : `https://www.reddit.com/search/?q=${encodeURIComponent(query)}`,
                description: `Reddit ${type === 'username' ? 'user profile' : 'search results'} for ${query}`,
                status: 'found'
            };
            
        case 'youtube':
            return {
                found: true,
                url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
                description: `YouTube search results for ${query}`,
                status: 'found'
            };
            
        default:
            throw new Error(`Platform ${platform} not supported`);
    }
}

// Generic search endpoint for all platforms
app.post('/api/search/:platform', async (req, res) => {
    try {
        const { platform } = req.params;
        const { query, type } = req.body;

        // Log the incoming request for debugging
        console.log('Incoming Request:', {
            platform,
            query,
            type,
            body: req.body
        });

        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        // Make type optional with a default value
        const searchType = type || 'search';

        const result = await handlePlatformSearch(platform, query, searchType);
        
        // Log the result for debugging
        console.log('Search Result:', {
            found: result.found,
            hasData: !!result.data,
            error: result.error
        });
        
        res.json({ ...result, query, type: searchType });
    } catch (error) {
        console.error(`Error in /${req.params.platform} search:`, error);
        res.status(500).json({ 
            error: error.message,
            query: req.body.query,
            type: req.body.type,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Hunter.io API endpoints
app.get('/api/hunter/domain', async (req, res) => {
    try {
        const { domain } = req.query;
        if (!domain) {
            return res.status(400).json({ error: 'Domain parameter is required' });
        }

        const hunterApiKey = process.env.HUNTER_API_KEY;
        if (!hunterApiKey) {
            return res.status(500).json({ error: 'Hunter.io API key not configured' });
        }

        const response = await axios.get(`https://api.hunter.io/v2/domain-search`, {
            params: {
                domain: domain,
                api_key: hunterApiKey
            }
        });

        res.json({
            status: 'found',
            platform: 'hunter',
            content: formatHunterResults(response.data),
            url: `https://hunter.io/search/${domain}`
        });
    } catch (error) {
        console.error('Hunter.io API error:', error);
        res.status(error.response?.status || 500).json({
            status: 'error',
            platform: 'hunter',
            description: 'Failed to fetch data from Hunter.io',
            error: error.message
        });
    }
});

app.get('/api/hunter/email-verify', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) {
            return res.status(400).json({ error: 'Email parameter is required' });
        }

        const hunterApiKey = process.env.HUNTER_API_KEY;
        if (!hunterApiKey) {
            return res.status(500).json({ error: 'Hunter.io API key not configured' });
        }

        const response = await axios.get(`https://api.hunter.io/v2/email-verifier`, {
            params: {
                email: email,
                api_key: hunterApiKey
            }
        });

        res.json({
            status: 'found',
            platform: 'hunter',
            content: formatEmailVerification(response.data),
            url: `https://hunter.io/email-verifier/${email}`
        });
    } catch (error) {
        console.error('Hunter.io API error:', error);
        res.status(error.response?.status || 500).json({
            status: 'error',
            platform: 'hunter',
            description: 'Failed to verify email with Hunter.io',
            error: error.message
        });
    }
});

// Helper function to format Hunter.io domain search results
function formatHunterResults(data) {
    const { domain, emails, pattern } = data.data;
    let html = `
        <div class="hunter-results">
            <h3>Domain: ${domain}</h3>
            ${pattern ? `<p>Email Pattern: ${pattern}</p>` : ''}
            <h4>Found Emails:</h4>
            <ul class="hunter-email-list">
    `;

    emails.forEach(email => {
        html += `
            <li>
                <strong>${email.value}</strong><br>
                ${email.first_name} ${email.last_name}
                ${email.position ? `<br>Position: ${email.position}` : ''}
                ${email.department ? `<br>Department: ${email.department}` : ''}
            </li>
        `;
    });

    html += `
            </ul>
        </div>
    `;
    return html;
}

// Helper function to format email verification results
function formatEmailVerification(data) {
    const { result } = data.data;
    return `
        <div class="hunter-verification">
            <h3>Email Verification Results</h3>
            <p><strong>Email:</strong> ${result.email}</p>
            <p><strong>Status:</strong> ${result.status}</p>
            <p><strong>Score:</strong> ${result.score}</p>
            ${result.position ? `<p><strong>Position:</strong> ${result.position}</p>` : ''}
            ${result.company ? `<p><strong>Company:</strong> ${result.company}</p>` : ''}
            ${result.linkedin ? `<p><strong>LinkedIn:</strong> <a href="${result.linkedin}" target="_blank">Profile</a></p>` : ''}
        </div>
    `;
}

// Add Reddit API endpoints
app.get('/api/reddit/user/:username', async (req, res) => {
    try {
        if (!redditClient) {
            throw new Error('Reddit client not initialized');
        }

        const { username } = req.params;
        const user = await redditClient.getUser(username);
        const userData = await Promise.all([
            user.getOverview(),
            user.getSubmissions(),
            user.getComments()
        ]);

        const [overview, submissions, comments] = userData;

        res.json({
            status: 'found',
            platform: 'reddit',
            content: formatRedditResults({
                overview,
                submissions: submissions.slice(0, 10),
                comments: comments.slice(0, 10)
            }),
            url: `https://www.reddit.com/user/${username}`
        });
    } catch (error) {
        console.error('Reddit API error:', error);
        res.status(error.statusCode || 500).json({
            status: 'error',
            platform: 'reddit',
            description: 'Failed to fetch Reddit data',
            error: error.message
        });
    }
});

app.get('/api/reddit/search', async (req, res) => {
    try {
        if (!redditClient) {
            throw new Error('Reddit client not initialized');
        }

        const { query, type } = req.query;
        let searchResults;

        if (type === 'subreddit') {
            searchResults = await redditClient.searchSubreddits({
                query,
                limit: redditConfig.defaultParams.limit
            });
        } else {
            searchResults = await redditClient.search({
                query,
                sort: redditConfig.defaultParams.sort,
                time: redditConfig.defaultParams.time,
                limit: redditConfig.defaultParams.limit
            });
        }

        res.json({
            status: 'found',
            platform: 'reddit',
            content: formatRedditSearchResults(searchResults),
            url: `https://www.reddit.com/search/?q=${encodeURIComponent(query)}`
        });
    } catch (error) {
        console.error('Reddit search error:', error);
        res.status(error.statusCode || 500).json({
            status: 'error',
            platform: 'reddit',
            description: 'Failed to search Reddit',
            error: error.message
        });
    }
});

// Helper function to format Reddit user results
function formatRedditResults(data) {
    const { overview, submissions, comments } = data;
    
    let html = `
        <div class="reddit-results">
            <div class="reddit-overview">
                <h4>User Activity Overview</h4>
                <p>Recent Submissions: ${submissions.length}</p>
                <p>Recent Comments: ${comments.length}</p>
            </div>
            
            <div class="reddit-submissions">
                <h4>Recent Submissions</h4>
                <ul class="reddit-list">
    `;

    submissions.forEach(post => {
        html += `
            <li>
                <a href="https://reddit.com${post.permalink}" target="_blank">
                    ${post.title}
                </a>
                <span class="reddit-meta">
                    in r/${post.subreddit.display_name} • ${post.score} points
                </span>
            </li>
        `;
    });

    html += `
                </ul>
            </div>
            
            <div class="reddit-comments">
                <h4>Recent Comments</h4>
                <ul class="reddit-list">
    `;

    comments.forEach(comment => {
        html += `
            <li>
                <div class="comment-body">${comment.body.substring(0, 200)}${comment.body.length > 200 ? '...' : ''}</div>
                <span class="reddit-meta">
                    in r/${comment.subreddit.display_name} • ${comment.score} points
                </span>
            </li>
        `;
    });

    html += `
                </ul>
            </div>
        </div>
    `;
    
    return html;
}

// Helper function to format Reddit search results
function formatRedditSearchResults(results) {
    let html = `
        <div class="reddit-search-results">
            <ul class="reddit-list">
    `;

    results.forEach(item => {
        if (item.display_name) {
            // Subreddit result
            html += `
                <li>
                    <a href="https://reddit.com/r/${item.display_name}" target="_blank">
                        r/${item.display_name}
                    </a>
                    <span class="reddit-meta">
                        ${item.subscribers.toLocaleString()} subscribers • ${item.public_description}
                    </span>
                </li>
            `;
        } else {
            // Post result
            html += `
                <li>
                    <a href="https://reddit.com${item.permalink}" target="_blank">
                        ${item.title}
                    </a>
                    <span class="reddit-meta">
                        in r/${item.subreddit.display_name} • ${item.score} points • ${item.num_comments} comments
                    </span>
                </li>
            `;
        }
    });

    html += `
            </ul>
        </div>
    `;
    
    return html;
}

// Twitter API endpoints
app.get('/api/twitter/user/:username', async (req, res) => {
    try {
        if (!twitterClient) {
            throw new Error('Twitter client not initialized. Check server logs for initialization errors.');
        }

        const { username } = req.params;
        console.log('Fetching Twitter user:', username);
        
        // Get detailed user data
        const user = await twitterClient.v2.userByUsername(username, {
            'user.fields': [
                'description',
                'profile_image_url',
                'public_metrics',
                'verified',
                'location',
                'url',
                'created_at',
                'protected',
                'pinned_tweet_id'
            ].join(',')
        }).catch(error => {
            console.error('Twitter user lookup failed:', error.message);
            throw new Error(`Failed to find Twitter user: ${error.message}`);
        });

        if (!user.data) {
            throw new Error('User not found on Twitter');
        }

        // Get user's tweets with more details
        const tweets = await twitterClient.v2.userTimeline(user.data.id, {
            max_results: 10,
            'tweet.fields': [
                'created_at',
                'public_metrics',
                'entities',
                'context_annotations',
                'conversation_id',
                'attachments'
            ].join(','),
            'expansions': ['attachments.media_keys', 'referenced_tweets.id'],
            'media.fields': ['url', 'preview_image_url', 'type']
        }).catch(error => {
            console.error('Twitter timeline fetch failed:', error.message);
            return { data: [] };
        });

        // Format the response with precise user information
        const formattedResponse = {
            status: 'found',
            platform: 'twitter',
            content: formatTwitterResults({
                user: {
                    ...user.data,
                    profile_url: `https://twitter.com/${username}`,
                    metrics: {
                        followers: user.data.public_metrics?.followers_count || 0,
                        following: user.data.public_metrics?.following_count || 0,
                        tweets: user.data.public_metrics?.tweet_count || 0
                    },
                    joined_date: new Date(user.data.created_at).toLocaleDateString()
                },
                tweets: tweets.data || []
            }),
            url: `https://twitter.com/${username}`,
            metadata: {
                isProtected: user.data.protected,
                isVerified: user.data.verified,
                joinDate: user.data.created_at,
                location: user.data.location,
                description: user.data.description,
                metrics: user.data.public_metrics
            }
        };

        res.json(formattedResponse);
    } catch (error) {
        console.error('Twitter API error:', error.message);
        res.status(error.code || 500).json({
            status: 'error',
            platform: 'twitter',
            description: error.message || 'Failed to fetch Twitter data',
            error: error.message
        });
    }
});

app.get('/api/twitter/search', async (req, res) => {
    try {
        if (!twitterClient) {
            throw new Error('Twitter client not initialized. Check server logs for initialization errors.');
        }

        const { query, type } = req.query;
        if (!query) {
            throw new Error('Search query is required');
        }

        console.log('Twitter search:', { query, type });
        let searchResults;

        try {
            if (type === 'user') {
                searchResults = await twitterClient.v2.searchUsers(query, {
                    'user.fields': twitterConfig.defaultParams.user.fields.join(','),
                    max_results: twitterConfig.defaultParams.max_results
                });
            } else {
                // Search tweets
                searchResults = await twitterClient.v2.search(query, {
                    'tweet.fields': twitterConfig.defaultParams.tweet.fields.join(','),
                    max_results: twitterConfig.defaultParams.max_results
                });
            }
        } catch (searchError) {
            console.error('Twitter search failed:', searchError.message);
            throw new Error(`Twitter search failed: ${searchError.message}`);
        }

        if (!searchResults.data || searchResults.data.length === 0) {
            return res.json({
                status: 'not-found',
                platform: 'twitter',
                content: `No results found for "${query}"`,
                url: `https://twitter.com/search?q=${encodeURIComponent(query)}`
            });
        }

        res.json({
            status: 'found',
            platform: 'twitter',
            content: formatTwitterSearchResults(searchResults.data, type),
            url: `https://twitter.com/search?q=${encodeURIComponent(query)}`
        });
    } catch (error) {
        console.error('Twitter search error:', error.message);
        res.status(error.code || 500).json({
            status: 'error',
            platform: 'twitter',
            description: error.message || 'Failed to search Twitter',
            error: error.message
        });
    }
});

// Helper function to format Twitter user and tweet results
function formatTwitterResults(data) {
    const { user, tweets } = data;
    
    let html = `
        <div class="twitter-results">
            <div class="twitter-user-info">
                <div class="user-header">
                    ${user.profile_image_url ? 
                        `<img src="${user.profile_image_url}" alt="${user.username}" class="profile-image">` : 
                        ''}
                    <div class="user-names">
                        <h4>${user.name}</h4>
                        <span class="username">@${user.username}</span>
                        ${user.verified ? '<span class="verified-badge" title="Verified Account">✓</span>' : ''}
                        ${user.protected ? '<span class="protected-badge" title="Protected Account">🔒</span>' : ''}
                    </div>
                </div>
                
                <div class="user-bio">
                    <p class="user-description">${user.description || ''}</p>
                    ${user.location ? 
                        `<p class="user-location"><i class="fas fa-map-marker-alt"></i> ${user.location}</p>` : 
                        ''}
                    <p class="user-joined"><i class="far fa-calendar-alt"></i> Joined ${user.joined_date}</p>
                </div>

                <div class="user-metrics">
                    <span><strong>${user.metrics.followers.toLocaleString()}</strong> Followers</span>
                    <span><strong>${user.metrics.following.toLocaleString()}</strong> Following</span>
                    <span><strong>${user.metrics.tweets.toLocaleString()}</strong> Tweets</span>
                </div>

                <div class="user-actions">
                    <a href="${user.profile_url}" target="_blank" class="profile-link">
                        <i class="fab fa-twitter"></i> View Profile
                    </a>
                </div>
            </div>

            <div class="twitter-timeline">
                <h4>Recent Tweets</h4>
                <div class="tweet-list">
    `;

    if (tweets && tweets.length > 0) {
        tweets.forEach(tweet => {
            const metrics = tweet.public_metrics || {};
            const hasMedia = tweet.attachments?.media_keys?.length > 0;
            
            html += `
                <div class="tweet">
                    <p class="tweet-text">${tweet.text}</p>
                    ${hasMedia ? '<div class="tweet-media-indicator"><i class="far fa-image"></i> Media attached</div>' : ''}
                    <div class="tweet-metadata">
                        <span class="tweet-date">
                            ${new Date(tweet.created_at).toLocaleDateString()}
                        </span>
                    </div>
                    <div class="tweet-metrics">
                        <span title="Likes"><i class="far fa-heart"></i> ${metrics.like_count || 0}</span>
                        <span title="Retweets"><i class="fas fa-retweet"></i> ${metrics.retweet_count || 0}</span>
                        <span title="Replies"><i class="far fa-comment"></i> ${metrics.reply_count || 0}</span>
                        <span title="Quote Tweets"><i class="fas fa-quote-right"></i> ${metrics.quote_count || 0}</span>
                    </div>
                    <a href="https://twitter.com/twitter/status/${tweet.id}" target="_blank" class="tweet-link">
                        View Tweet
                    </a>
                </div>
            `;
        });
    } else {
        html += `
            <div class="no-tweets">
                <p>No recent tweets available</p>
            </div>
        `;
    }

    html += `
                </div>
            </div>
        </div>
    `;
    
    return html;
}

// Helper function to format Twitter search results
function formatTwitterSearchResults(results, type) {
    let html = `
        <div class="twitter-search-results">
    `;

    if (type === 'user') {
        html += `<div class="user-results">`;
        results.forEach(user => {
            html += `
                <div class="user-card">
                    ${user.profile_image_url ? 
                        `<img src="${user.profile_image_url}" alt="${user.username}" class="profile-image">` : 
                        ''}
                    <div class="user-info">
                        <h4>${user.name}</h4>
                        <span class="username">@${user.username}</span>
                        ${user.verified ? '<span class="verified-badge">✓</span>' : ''}
                        <p class="user-description">${user.description || ''}</p>
                    </div>
                    <a href="https://twitter.com/${user.username}" target="_blank" class="profile-link">
                        View Profile
                    </a>
                </div>
            `;
        });
        html += `</div>`;
    } else {
        html += `<div class="tweet-results">`;
        results.forEach(tweet => {
            html += `
                <div class="tweet">
                    <p class="tweet-text">${tweet.text}</p>
                    <div class="tweet-metrics">
                        <span><i class="far fa-heart"></i> ${tweet.public_metrics?.like_count || 0}</span>
                        <span><i class="fas fa-retweet"></i> ${tweet.public_metrics?.retweet_count || 0}</span>
                        <span><i class="far fa-comment"></i> ${tweet.public_metrics?.reply_count || 0}</span>
                    </div>
                    <a href="https://twitter.com/twitter/status/${tweet.id}" target="_blank" class="tweet-link">
                        View Tweet
                    </a>
                </div>
            `;
        });
        html += `</div>`;
    }

    html += `</div>`;
    return html;
}

// Helper endpoint to find Twitter users by email or phone
app.get('/api/twitter/find-by-contact', async (req, res) => {
    try {
        if (!twitterClient) {
            throw new Error('Twitter client not initialized. Check server logs for initialization errors.');
        }

        const { email, phone } = req.query;
        
        if (!email && !phone) {
            throw new Error('Either email or phone number is required');
        }

        let searchResults = [];
        let searchQuery = '';

        // Build search query based on available information
        if (email) {
            // Remove @ and domain parts for better matching
            const username = email.split('@')[0];
            searchQuery = username;
        } else if (phone) {
            // Clean phone number format
            const cleanPhone = phone.replace(/[^0-9]/g, '');
            searchQuery = cleanPhone;
        }

        // Search for users with similar usernames or display names
        const users = await twitterClient.v2.searchUsers(searchQuery, {
            'user.fields': [
                'description',
                'profile_image_url',
                'public_metrics',
                'verified',
                'location',
                'url',
                'created_at',
                'protected'
            ].join(','),
            max_results: 10
        });

        if (!users.data || users.data.length === 0) {
            return res.json({
                status: 'not-found',
                platform: 'twitter',
                message: 'No Twitter accounts found that might be associated with the provided contact information.',
                searchTerm: searchQuery
            });
        }

        // Format and score the results
        const scoredResults = users.data.map(user => {
            let score = 0;
            const userData = {
                ...user,
                matchScore: 0,
                matchReason: []
            };

            // Score based on username match
            if (email) {
                const emailUsername = email.split('@')[0].toLowerCase();
                if (user.username.toLowerCase().includes(emailUsername)) {
                    score += 5;
                    userData.matchReason.push('Username matches email pattern');
                }
                if (user.description && user.description.toLowerCase().includes(emailUsername)) {
                    score += 2;
                    userData.matchReason.push('Description contains email pattern');
                }
            }

            if (phone) {
                const cleanPhone = phone.replace(/[^0-9]/g, '');
                if (user.description && user.description.includes(cleanPhone.slice(-4))) {
                    score += 3;
                    userData.matchReason.push('Description contains phone number pattern');
                }
            }

            userData.matchScore = score;
            return userData;
        });

        // Sort by match score
        scoredResults.sort((a, b) => b.matchScore - a.matchScore);

        // Filter out low-confidence matches
        const filteredResults = scoredResults.filter(result => result.matchScore > 0);

        res.json({
            status: 'found',
            platform: 'twitter',
            content: formatContactSearchResults(filteredResults),
            url: `https://twitter.com/search?q=${encodeURIComponent(searchQuery)}`,
            metadata: {
                searchTerm: searchQuery,
                totalResults: filteredResults.length,
                searchType: email ? 'email' : 'phone'
            }
        });

    } catch (error) {
        console.error('Twitter contact search error:', error.message);
        res.status(error.code || 500).json({
            status: 'error',
            platform: 'twitter',
            description: error.message || 'Failed to search Twitter accounts',
            error: error.message
        });
    }
});

// Helper function to format contact search results
function formatContactSearchResults(results) {
    let html = `
        <div class="twitter-contact-search-results">
            <h4>Potential Twitter Accounts Found</h4>
            ${results.length === 0 ? 
                '<p class="no-results">No matching Twitter accounts found.</p>' :
                '<div class="results-list">'
            }
    `;

    results.forEach(user => {
        html += `
            <div class="user-card ${user.matchScore > 5 ? 'high-confidence' : 'medium-confidence'}">
                <div class="user-header">
                    ${user.profile_image_url ? 
                        `<img src="${user.profile_image_url}" alt="${user.username}" class="profile-image">` : 
                        ''}
                    <div class="user-names">
                        <h4>${user.name}</h4>
                        <span class="username">@${user.username}</span>
                        ${user.verified ? '<span class="verified-badge" title="Verified Account">✓</span>' : ''}
                        ${user.protected ? '<span class="protected-badge" title="Protected Account">🔒</span>' : ''}
                    </div>
                </div>
                
                <div class="user-bio">
                    <p class="user-description">${user.description || ''}</p>
                    ${user.location ? 
                        `<p class="user-location"><i class="fas fa-map-marker-alt"></i> ${user.location}</p>` : 
                        ''}
                    <p class="user-joined"><i class="far fa-calendar-alt"></i> Joined ${new Date(user.created_at).toLocaleDateString()}</p>
                </div>

                <div class="match-info">
                    <p class="confidence-score">Match Confidence: ${user.matchScore > 5 ? 'High' : 'Medium'}</p>
                    <ul class="match-reasons">
                        ${user.matchReason.map(reason => `<li>${reason}</li>`).join('')}
                    </ul>
                </div>

                <div class="user-metrics">
                    <span><strong>${user.public_metrics?.followers_count?.toLocaleString() || 0}</strong> Followers</span>
                    <span><strong>${user.public_metrics?.following_count?.toLocaleString() || 0}</strong> Following</span>
                    <span><strong>${user.public_metrics?.tweet_count?.toLocaleString() || 0}</strong> Tweets</span>
                </div>

                <div class="user-actions">
                    <a href="https://twitter.com/${user.username}" target="_blank" class="profile-link">
                        <i class="fab fa-twitter"></i> View Profile
                    </a>
                </div>
            </div>
        `;
    });

    html += results.length > 0 ? '</div>' : '';
    html += `
        <div class="search-disclaimer">
            <p><i class="fas fa-info-circle"></i> Note: These results are based on publicly available information and pattern matching. The actual account ownership cannot be verified through the API.</p>
        </div>
    </div>`;
    
    return html;
}

// Catch-all route to serve index.html for any non-API routes
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, 'index.html'));
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser to use the application`);
    
    // Log configuration on startup
    console.log('SERP API Configuration:', {
        engineType: serpConfig.engine,
        hasApiKey: !!serpConfig.apiKey,
        defaultParams: serpConfig.defaultParams
    });
}); 