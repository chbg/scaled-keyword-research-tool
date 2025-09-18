# 🚀 GitHub + Netlify Deployment Guide

## Quick Start

### 1. Push to GitHub
```bash
git add .
git commit -m "Initial commit: Keyword Research Tool"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

### 2. Connect to Netlify
1. Go to [Netlify](https://netlify.com)
2. Click "New site from Git"
3. Choose "GitHub" and authorize
4. Select your repository
5. Configure build settings:
   - **Build command**: `cd functions && npm install`
   - **Publish directory**: `.`
   - **Functions directory**: `functions`

### 3. Deploy!
Click "Deploy site" and wait for the build to complete.

## 🔧 Build Configuration

### Netlify Build Settings
- **Build command**: `cd functions && npm install`
- **Publish directory**: `.`
- **Functions directory**: `functions`
- **Node version**: `18.x`

### Environment Variables (Optional)
If you want to use environment variables instead of hardcoded API keys:

1. Go to Site Settings > Environment Variables
2. Add:
   - `DATAFORSEO_USERNAME`: Your DataForSEO username
   - `DATAFORSEO_API_KEY`: Your DataForSEO API key

3. Update the functions to use:
   ```javascript
   const DATAFORSEO_USERNAME = process.env.DATAFORSEO_USERNAME || 'houston.barnettgearhart@gmail.com';
   const DATAFORSEO_API_KEY = process.env.DATAFORSEO_API_KEY || '78ed0af9b3c7e819';
   ```

## 📁 Repository Structure
```
your-repo/
├── functions/
│   ├── keyword-research.js    # Single keyword research
│   ├── batch-research.js      # Batch processing
│   └── package.json           # Dependencies
├── index.html                 # Frontend
├── netlify.toml              # Netlify config
├── .gitignore                # Git ignore rules
└── README.md                 # Documentation
```

## 🔄 Continuous Deployment
Once connected, every push to the `main` branch will automatically trigger a new deployment.

## 🐛 Troubleshooting

### Build Fails
- Check that `functions/package.json` exists
- Verify Node.js version is 18.x
- Check Netlify build logs for specific errors

### Functions Not Working
- Verify API credentials are correct
- Check function logs in Netlify dashboard
- Ensure DataForSEO API has sufficient credits

### Frontend Issues
- Check browser console for JavaScript errors
- Verify all files are committed to Git
- Check Netlify redirects configuration

## 📊 Monitoring
- **Function Logs**: Netlify Dashboard > Functions
- **Build Logs**: Netlify Dashboard > Deploys
- **Site Analytics**: Netlify Dashboard > Analytics

## 🔒 Security Notes
- API keys are currently hardcoded (consider using environment variables)
- Functions have 150-second timeout limit
- Rate limiting is built-in to respect API limits

## 🚀 Custom Domain
1. Go to Site Settings > Domain Management
2. Add your custom domain
3. Configure DNS settings as instructed
4. Enable HTTPS (automatic with Netlify)

## 📈 Scaling
- **Free Plan**: 100GB bandwidth, 300 build minutes
- **Pro Plan**: 1TB bandwidth, 1000 build minutes
- **Enterprise**: Custom limits and features

Your keyword research tool will be live at: `https://your-site-name.netlify.app`
