# Keyword Research Tool - Netlify Production

A serverless keyword research tool deployed on Netlify that finds supporting keywords with proven URL overlap using DataForSEO API.

## 🚀 Features

- **Single Keyword Research**: Research one keyword at a time
- **Batch Processing**: Upload CSV files for bulk keyword research
- **URL Overlap Analysis**: Find keywords with 40%+ URL overlap
- **Real-time Data**: Uses DataForSEO's live API endpoints
- **Serverless Architecture**: Runs on Netlify Functions
- **Modern UI**: Clean, responsive interface

## 📁 Project Structure

```
netlify-production/
├── functions/
│   ├── keyword-research.js    # Single keyword research function
│   ├── batch-research.js      # Batch processing function
│   └── package.json           # Node.js dependencies
├── index.html                 # Frontend interface
├── netlify.toml              # Netlify configuration
└── README.md                 # This file
```

## 🔧 Setup & Deployment

### 1. Prerequisites
- Netlify account
- DataForSEO API credentials
- Node.js 18+ (for local development)

### 2. Deploy to Netlify

#### Option A: Deploy from Git
1. Push this code to a Git repository
2. Connect the repository to Netlify
3. Set build command: `cd functions && npm install`
4. Set publish directory: `.`
5. Deploy!

#### Option B: Deploy from Folder
1. Install Netlify CLI: `npm install -g netlify-cli`
2. Navigate to this directory: `cd netlify-production`
3. Login to Netlify: `netlify login`
4. Deploy: `netlify deploy --prod`

### 3. Environment Variables
The API credentials are currently hardcoded in the functions. For production, consider using Netlify's environment variables:

1. Go to Site Settings > Environment Variables
2. Add:
   - `DATAFORSEO_USERNAME`: Your DataForSEO username
   - `DATAFORSEO_API_KEY`: Your DataForSEO API key

Then update the functions to use `process.env.DATAFORSEO_USERNAME` and `process.env.DATAFORSEO_API_KEY`.

## 🎯 How It Works

### Single Keyword Research
1. **Get Top 10 URLs**: Uses DataForSEO SERP API to get top 10 URLs for the keyword
2. **Extract Keywords**: Gets ranked keywords from the top 3 URLs using DataForSEO Labs API
3. **Find Overlaps**: Checks each keyword's SERP results for 40%+ URL overlap
4. **Return Results**: Returns supporting keywords with overlap percentages

### Batch Processing
1. **Parse CSV**: Extracts keywords from uploaded CSV file
2. **Process Each**: Runs single keyword research for each keyword
3. **Rate Limiting**: Adds delays between requests to respect API limits
4. **Aggregate Results**: Returns comprehensive results for all keywords

## 📊 API Endpoints

### Single Keyword Research
- **URL**: `/.netlify/functions/keyword-research`
- **Method**: POST
- **Body**: 
  ```json
  {
    "keyword": "guitar lessons",
    "max_supporting_keywords": 4
  }
  ```

### Batch Processing
- **URL**: `/.netlify/functions/batch-research`
- **Method**: POST
- **Body**:
  ```json
  {
    "csv_data": "keyword\nmusic\nsamples",
    "max_keywords": 10
  }
  ```

## 🔒 Rate Limiting

The functions include built-in rate limiting:
- 1 second delay between keyword checks
- 2 second delay between batch items
- 30 second timeout for individual API calls
- 140 second total function timeout

## 📈 Performance

- **Single Keyword**: ~30-60 seconds per keyword
- **Batch Processing**: ~2-3 minutes per 10 keywords
- **Concurrent Requests**: Limited by Netlify's function limits
- **Caching**: No built-in caching (consider adding Redis for production)

## 🛠️ Local Development

1. Install dependencies:
   ```bash
   cd functions
   npm install
   ```

2. Start Netlify dev server:
   ```bash
   netlify dev
   ```

3. Open http://localhost:8888

## 📝 CSV Format

The batch processing accepts CSV files with keywords in any of these columns:
- `keyword`
- `keywords`
- `term`
- `phrase`
- `Parent Topic`
- `parent_topic`
- `parent topic`
- Or the first column if none of the above are found

## 🚨 Limitations

- **Function Timeout**: 150 seconds max (Netlify limit)
- **Memory**: 1024MB max per function
- **Concurrent**: Limited by Netlify plan
- **API Costs**: DataForSEO charges per request

## 🔧 Customization

### Adding More API Providers
1. Create new functions in `functions/`
2. Update `index.html` to include new options
3. Add corresponding API logic

### Modifying Overlap Threshold
Change the `40` in the overlap check:
```javascript
if (overlap >= 40) { // Change this number
```

### Adding Caching
Consider adding Redis or similar for:
- API response caching
- Keyword result caching
- URL overlap caching

## 📞 Support

For issues or questions:
1. Check the Netlify function logs
2. Verify DataForSEO API credentials
3. Check rate limiting and timeouts
4. Review the browser console for frontend errors

## 📄 License

MIT License - feel free to modify and use for your projects!
