const fs = require('fs');
const readline = require('readline');
const path = require('path');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const apiInstructions = {
    TRUECALLER: {
        url: 'https://developer.truecaller.com/sign-up',
        instructions: 'Sign up for a Truecaller Developer account and create an API key'
    },
    TWITTER: {
        url: 'https://developer.twitter.com/en/portal/dashboard',
        instructions: 'Create a Twitter Developer account and generate API keys'
    },
    FACEBOOK: {
        url: 'https://developers.facebook.com/',
        instructions: 'Create a Meta Developer account and set up a Facebook app'
    },
    GITHUB: {
        url: 'https://github.com/settings/tokens',
        instructions: 'Generate a GitHub Personal Access Token'
    },
    WHATSAPP: {
        url: 'https://business.whatsapp.com/products/business-platform',
        instructions: 'Set up WhatsApp Business API'
    }
};

async function askQuestion(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer);
        });
    });
}

async function setup() {
    console.log('\n=== OSINT Web App Setup ===\n');
    console.log('This script will help you configure your API keys.\n');

    const envPath = path.join(__dirname, '.env');
    let envContent = `# Server Configuration
PORT=3000
NODE_ENV=development\n\n`;

    // Get API keys
    for (const [api, info] of Object.entries(apiInstructions)) {
        console.log(`\n=== ${api} Setup ===`);
        console.log(`Instructions: ${info.instructions}`);
        console.log(`Visit: ${info.url}\n`);
        
        const apiKey = await askQuestion(`Enter your ${api} API key (press Enter to skip): `);
        envContent += `${api}_API_KEY=${apiKey || 'your_' + api.toLowerCase() + '_api_key_here'}\n`;
    }

    // Additional configuration
    console.log('\n=== Additional Configuration ===');
    const whatsappBusinessId = await askQuestion('Enter your WhatsApp Business Account ID: ');
    const countryCode = await askQuestion('Enter default country code (e.g., IN): ');

    envContent += `\n# API Endpoints
WHATSAPP_API_ENDPOINT=https://graph.facebook.com/v17.0
UPI_API_ENDPOINT=https://api.upi.system/v1\n
# Additional Configuration
WHATSAPP_BUSINESS_ACCOUNT_ID=${whatsappBusinessId || 'your_whatsapp_business_account_id'}
COUNTRY_CODE=${countryCode || 'IN'}\n`;

    // Write to .env file
    fs.writeFileSync(envPath, envContent);

    console.log('\n=== Setup Complete ===');
    console.log('Configuration has been saved to .env file');
    console.log('\nNext steps:');
    console.log('1. Review the .env file and update any missing keys');
    console.log('2. Run "npm install" to install dependencies');
    console.log('3. Run "npm start" to start the server');

    rl.close();
}

setup().catch(console.error); 