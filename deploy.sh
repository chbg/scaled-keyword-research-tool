#!/bin/bash

echo "🚀 Deploying Keyword Research Tool to Netlify..."

# Check if Netlify CLI is installed
if ! command -v netlify &> /dev/null; then
    echo "❌ Netlify CLI not found. Installing..."
    npm install -g netlify-cli
fi

# Check if logged in
if ! netlify status &> /dev/null; then
    echo "🔐 Please login to Netlify first:"
    netlify login
fi

# Install dependencies
echo "📦 Installing dependencies..."
cd functions
npm install
cd ..

# Deploy to Netlify
echo "🚀 Deploying to Netlify..."
netlify deploy --prod

echo "✅ Deployment complete!"
echo "🌐 Your app should be live at the URL shown above."
