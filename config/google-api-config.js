// SERP API Configuration
require('dotenv').config();

const serpConfig = {
  // API key should be stored in environment variables
  apiKey: process.env.SERP_API_KEY,
  
  // Search engine settings
  engine: "google",
  
  // Default search parameters
  defaultParams: {
    google_domain: "google.com",
    gl: "us",  // country code for search
    hl: "en",  // language
    location: "United States" // default location
  },
  
  // API timeout in milliseconds
  timeout: 60000
};

// Validate API key is present
if (!serpConfig.apiKey) {
  console.error('SERP API key not found in environment variables');
}

module.exports = serpConfig; 