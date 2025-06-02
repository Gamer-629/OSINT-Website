// OSINT Search Engine - Main search logic
class OSINTEngine {
    constructor() {
        this.results = [];
        this.searchProgress = 0;
        this.totalPlatforms = 0;
        this.completedSearches = 0;
        this.API_KEYS = {
            TRUECALLER: 'YOUR_TRUECALLER_API_KEY',
            TWITTER: 'YOUR_TWITTER_API_KEY',
            FACEBOOK: 'YOUR_FACEBOOK_API_KEY',
            INSTAGRAM: 'YOUR_INSTAGRAM_API_KEY',
            GITHUB: 'YOUR_GITHUB_API_KEY'
        };
    }

    // Update progress bar and text
    updateProgress(message, percent) {
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        
        if (progressFill && progressText) {
            progressFill.style.width = `${percent}%`;
            progressText.textContent = message;
        }
    }

    // Main search method
    async performSearch(query, type, selectedPlatforms) {
        this.results = [];
        this.searchProgress = 0;
        this.completedSearches = 0;
        this.totalPlatforms = selectedPlatforms.length;

        // Basic input validation
        if (!query || query.trim() === '') {
            throw new Error('Search query cannot be empty');
        }

        if (!type || !['email', 'phone', 'username', 'name'].includes(type)) {
            throw new Error('Invalid search type');
        }

        // Update initial progress
        this.updateProgress('Initializing search...', 0);

        // Search each platform
        for (const platform of selectedPlatforms) {
            try {
                this.updateProgress(`Searching ${platform}...`, (this.completedSearches / this.totalPlatforms) * 100);
                await this.searchPlatform(platform, query, type);
                
                this.completedSearches++;
                const progress = (this.completedSearches / this.totalPlatforms) * 100;
                this.updateProgress(`Searched ${this.completedSearches}/${this.totalPlatforms} platforms`, progress);
                
                // Add delay between searches to respect rate limits
                await this.delay(1000);
            } catch (error) {
                console.error(`Error searching ${platform}:`, error);
                this.results.push({
                    platform: platform,
                    status: 'error',
                    url: null,
                    description: `Error: ${error.message}`,
                    timestamp: new Date().toISOString()
                });
            }
        }

        this.updateProgress('Search completed!', 100);
        return this.results;
    }

    // Helper method for delay
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Get search statistics
    getSearchStats() {
        const found = this.results.filter(r => r.status === 'found').length;
        return {
            total: this.totalPlatforms,
            found: found,
            completed: this.completedSearches
        };
    }

    // Validate input based on type
    validateInput(query, type) {
        switch(type) {
            case 'email':
                return Utils.isValidEmail(query);
            case 'phone':
                return Utils.isValidPhone(query);
            case 'username':
                return Utils.isValidUsername(query);
            case 'name':
                return query.length >= 2;
            default:
                return false;
        }
    }

    // Search individual platform with real API integration
    async searchPlatform(platformKey, query, type) {
        try {
            const response = await fetch(`/api/search/${platformKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    query, 
                    type,
                    countryCode: 'IN' // You can make this configurable if needed
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            // Format and add the result
            const result = this.formatSearchResult(platformKey, data, query, type);
            this.results.push(result);
            
            return result;
        } catch (error) {
            console.error(`Error searching ${platformKey}:`, error);
            const errorResult = {
                platform: platformKey,
                status: 'error',
                url: null,
                description: `Error: ${error.message}`,
                timestamp: new Date().toISOString()
            };
            this.results.push(errorResult);
            return errorResult;
        }
    }

    // Format search results
    formatSearchResult(platformKey, data, query, type) {
        switch(platformKey) {
            case 'truecaller':
                return this.formatTruecallerResult(data);
            case 'twitter':
                return this.formatTwitterResult(data);
            case 'github':
                return this.formatGithubResult(data);
            case 'whatsapp':
                return this.formatWhatsAppResult(data);
            case 'upi':
                return this.formatUPIResult(data);
            default:
                return this.formatDefaultResult(platformKey, data, query, type);
        }
    }

    // Add error handling for rate limits
    handleRateLimit(response) {
        if (response.status === 429) { // Too Many Requests
            const retryAfter = response.headers.get('Retry-After') || 60;
            throw new Error(`Rate limit exceeded. Please try again after ${retryAfter} seconds.`);
        }
    }

    // Add validation for input types
    validateSearchInput(query, type) {
        switch(type) {
            case 'email':
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(query)) {
                    throw new Error('Invalid email format');
                }
                break;
            case 'phone':
                const phoneRegex = /^\+?[\d\s-]{10,}$/;
                if (!phoneRegex.test(query)) {
                    throw new Error('Invalid phone number format');
                }
                break;
            case 'username':
                if (query.length < 3) {
                    throw new Error('Username must be at least 3 characters long');
                }
                break;
            case 'name':
                if (query.length < 2) {
                    throw new Error('Name must be at least 2 characters long');
                }
                break;
        }
        return true;
    }

    // TrueCaller API Integration
    async searchTruecaller(query, type) {
        if (type !== 'phone') return null;
        
        try {
            const response = await fetch('https://api4.truecaller.com/v1/search', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.API_KEYS.TRUECALLER}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    phone: query,
                    countryCode: 'IN' // Adjust based on your needs
                })
            });

            const data = await response.json();
            return this.formatTruecallerResult(data);
        } catch (error) {
            throw new Error(`TrueCaller API error: ${error.message}`);
        }
    }

    // Twitter API Integration (v2)
    async searchTwitter(query, type) {
        try {
            const endpoint = type === 'email' 
                ? `https://api.twitter.com/2/users/by/email/${query}`
                : `https://api.twitter.com/2/users/by/username/${query}`;

            const response = await fetch(endpoint, {
                headers: {
                    'Authorization': `Bearer ${this.API_KEYS.TWITTER}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();
            return this.formatTwitterResult(data);
        } catch (error) {
            throw new Error(`Twitter API error: ${error.message}`);
        }
    }

    // GitHub API Integration
    async searchGithub(query, type) {
        try {
            const response = await fetch(`https://api.github.com/search/users?q=${query}`, {
                headers: {
                    'Authorization': `token ${this.API_KEYS.GITHUB}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            const data = await response.json();
            return this.formatGithubResult(data);
        } catch (error) {
            throw new Error(`GitHub API error: ${error.message}`);
        }
    }

    // WhatsApp Business API Integration
    async searchWhatsApp(query, type) {
        if (type !== 'phone') return null;
        
        try {
            // Using WhatsApp Business API to check number
            const response = await fetch('https://graph.facebook.com/v17.0/WHATSAPP_BUSINESS_ACCOUNT_ID/messages', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.API_KEYS.FACEBOOK}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messaging_product: "whatsapp",
                    recipient_type: "individual",
                    to: query,
                    type: "template",
                    template: { name: "hello_world", language: { code: "en" } }
                })
            });

            const data = await response.json();
            return this.formatWhatsAppResult(data);
        } catch (error) {
            throw new Error(`WhatsApp API error: ${error.message}`);
        }
    }

    // UPI Handle Lookup (using appropriate payment system APIs)
    async searchUPI(query, type) {
        try {
            // Implementation will depend on the specific UPI payment system API you have access to
            const response = await fetch('https://api.upi.system/v1/handle/verify', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.API_KEYS.UPI}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    upiHandle: query
                })
            });

            const data = await response.json();
            return this.formatUPIResult(data);
        } catch (error) {
            throw new Error(`UPI API error: ${error.message}`);
        }
    }

    // Result Formatters
    formatTruecallerResult(data) {
        return {
            platform: 'TrueCaller',
            status: data.name ? 'found' : 'not-found',
            url: null,
            description: data.name ? `Name: ${data.name}, Spam: ${data.spamScore}` : 'No information found',
            content: this.generateFoundContent('TrueCaller', data, data.query, data.type),
            timestamp: new Date().toISOString()
        };
    }

    formatTwitterResult(data) {
        return {
            platform: 'Twitter',
            status: data.data ? 'found' : 'not-found',
            url: data.data ? `https://twitter.com/${data.data.username}` : null,
            description: data.data ? `Twitter user found: @${data.data.username}` : 'No Twitter account found',
            content: this.generateFoundContent('Twitter', data, data.query, data.type),
            timestamp: new Date().toISOString()
        };
    }

    formatGithubResult(data) {
        return {
            platform: 'GitHub',
            status: data.total_count > 0 ? 'found' : 'not-found',
            url: data.items?.[0]?.html_url || null,
            description: data.total_count > 0 ? `GitHub user found: ${data.items[0].login}` : 'No GitHub account found',
            content: this.generateFoundContent('GitHub', data, data.query, data.type),
            timestamp: new Date().toISOString()
        };
    }

    // Generate content for found results
    generateFoundContent(platform, data, query, type) {
        const templates = {
            'Google': `<div class="found-content">
                <h4>Search Results</h4>
                <p>Multiple results found for ${type}: ${query}</p>
            </div>`,
            'Facebook': `<div class="found-content">
                <h4>Profile Found</h4>
                <p>Facebook profile found for ${type}: ${query}</p>
            </div>`,
            'Twitter': `<div class="found-content">
                <h4>Account Located</h4>
                <p>Twitter account found matching ${type}: ${query}</p>
            </div>`,
            'Instagram': `<div class="found-content">
                <h4>Instagram Profile</h4>
                <p>Instagram account found for ${type}: ${query}</p>
            </div>`,
            'LinkedIn': `<div class="found-content">
                <h4>Professional Profile</h4>
                <p>LinkedIn profile found for ${type}: ${query}</p>
            </div>`,
            'GitHub': `<div class="found-content">
                <h4>Developer Profile</h4>
                <p>GitHub account found for ${type}: ${query}</p>
            </div>`,
            'Reddit': `<div class="found-content">
                <h4>Reddit User</h4>
                <p>Reddit account found for ${type}: ${query}</p>
            </div>`,
            'YouTube': `<div class="found-content">
                <h4>YouTube Channel</h4>
                <p>YouTube channel found for ${type}: ${query}</p>
            </div>`
        };

        return templates[platform] || `<div class="found-content">
            <h4>Results Found</h4>
            <p>Information found on ${platform} for ${type}: ${query}</p>
        </div>`;
    }

    // Weighted random choice
    weightedRandomChoice(choices, weights) {
        const random = Math.random();
        let weightSum = 0;
        
        for (let i = 0; i < choices.length; i++) {
            weightSum += weights[i];
            if (random <= weightSum) {
                return choices[i];
            }
        }
        
        return choices[choices.length - 1];
    }

    // Format results for different platforms
    formatDefaultResult(platform, data, query, type) {
        return {
            platform: platform,
            status: data.found ? 'found' : 'not-found',
            url: data.url || null,
            description: data.description || `Search completed on ${platform}`,
            content: this.generateFoundContent(platform, data, query, type),
            timestamp: new Date().toISOString()
        };
    }

    formatWhatsAppResult(data) {
        return {
            platform: 'WhatsApp',
            status: data.contacts ? 'found' : 'not-found',
            url: null,
            description: data.contacts ? 'WhatsApp account exists' : 'No WhatsApp account found',
            content: this.generateFoundContent('WhatsApp', data, data.query, data.type),
            timestamp: new Date().toISOString()
        };
    }

    formatUPIResult(data) {
        return {
            platform: 'UPI',
            status: data.valid ? 'found' : 'not-found',
            url: null,
            description: data.valid ? `Valid UPI ID: ${data.vpa}` : 'Invalid UPI handle',
            content: this.generateFoundContent('UPI', data, data.query, data.type),
            timestamp: new Date().toISOString()
        };
    }
}
