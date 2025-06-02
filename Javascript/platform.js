// Platform configurations for OSINT searches
const PlatformConfig = {
    google: {
        name: 'Google',
        icon: 'fab fa-google',
        searchUrl: (query, type) => {
            const encodedQuery = encodeURIComponent(query);
            switch(type) {
                case 'email':
                    return `https://www.google.com/search?q="${encodedQuery}"`;
                case 'phone':
                    return `https://www.google.com/search?q="${encodedQuery}"`;
                case 'username':
                    return `https://www.google.com/search?q="${encodedQuery}"`;
                case 'name':
                    return `https://www.google.com/search?q="${encodedQuery}"`;
                default:
                    return `https://www.google.com/search?q=${encodedQuery}`;
            }
        },
        checkMethod: 'redirect' // Will redirect to search page
    },

    facebook: {
        name: 'Facebook',
        icon: 'fab fa-facebook',
        searchUrl: (query, type) => {
            const encodedQuery = encodeURIComponent(query);
            return `https://www.facebook.com/search/people/?q=${encodedQuery}`;
        },
        checkMethod: 'redirect'
    },

    twitter: {
        name: 'Twitter',
        icon: 'fab fa-twitter',
        searchUrl: (query, type) => {
            const encodedQuery = encodeURIComponent(query);
            if (type === 'username') {
                return `/api/twitter/user/${encodedQuery}`;
            }
            return `/api/twitter/search?query=${encodedQuery}&type=${type || 'tweet'}`;
        },
        checkMethod: 'api',
        processResponse: async (response) => {
            const data = await response.json();
            return {
                found: data.status === 'found',
                url: data.url,
                content: data.content,
                description: data.description || 'Twitter search results'
            };
        }
    },

    instagram: {
        name: 'Instagram',
        icon: 'fab fa-instagram',
        searchUrl: (query, type) => {
            if (type === 'username') {
                return `https://www.instagram.com/${query}/`;
            }
            const encodedQuery = encodeURIComponent(query);
            return `https://www.instagram.com/explore/tags/${encodedQuery}/`;
        },
        checkMethod: 'redirect'
    },

    hunter: {
        name: 'Hunter.io',
        icon: 'fas fa-search',
        searchUrl: (query, type) => {
            const encodedQuery = encodeURIComponent(query);
            if (type === 'domain') {
                return `https://hunter.io/search/${encodedQuery}`;
            } else if (type === 'email') {
                return `https://hunter.io/email-verifier/${encodedQuery}`;
            }
            return `https://hunter.io/search/${encodedQuery}`;
        },
        checkMethod: 'redirect'
    },

    github: {
        name: 'GitHub',
        icon: 'fab fa-github',
        searchUrl: (query, type) => {
            if (type === 'username') {
                return `https://github.com/${query}`;
            }
            const encodedQuery = encodeURIComponent(query);
            return `https://github.com/search?q=${encodedQuery}&type=users`;
        },
        checkMethod: 'redirect'
    },

    reddit: {
        name: 'Reddit',
        icon: 'fab fa-reddit',
        searchUrl: (query, type) => {
            const encodedQuery = encodeURIComponent(query);
            if (type === 'username') {
                return `/api/reddit/user/${encodedQuery}`;
            }
            return `/api/reddit/search?query=${encodedQuery}&type=${type || 'posts'}`;
        },
        checkMethod: 'api',
        processResponse: async (response) => {
            const data = await response.json();
            return {
                found: data.status === 'found',
                url: data.url,
                content: data.content,
                description: data.description || 'Reddit search results'
            };
        }
    },

    youtube: {
        name: 'YouTube',
        icon: 'fab fa-youtube',
        searchUrl: (query, type) => {
            const encodedQuery = encodeURIComponent(query);
            return `https://www.youtube.com/results?search_query=${encodedQuery}`;
        },
        checkMethod: 'redirect'
    }
};
    