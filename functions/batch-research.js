const fetch = require('node-fetch');
const csv = require('csv-parser');
const { Readable } = require('stream');

exports.handler = async (event, context) => {
  console.log('=== BATCH KEYWORD RESEARCH FUNCTION STARTED ===');
  
  // Handle CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: JSON.stringify({ message: 'CORS preflight' }) };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 200, headers, body: JSON.stringify({ message: 'Use POST method' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const csvData = body.csv_data;
    const maxKeywords = body.max_keywords || 10;

    if (!csvData) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'CSV data is required' })
      };
    }

    console.log(`📝 Processing batch with max ${maxKeywords} keywords`);

    // Parse CSV data
    const keywords = await parseCSV(csvData);
    console.log(`📊 Parsed ${keywords.length} keywords from CSV`);

    if (keywords.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'No keywords found in CSV data' })
      };
    }

    // Process keywords (limit to maxKeywords for performance)
    const keywordsToProcess = keywords.slice(0, maxKeywords);
    const results = [];
    const errors = [];

    for (let i = 0; i < keywordsToProcess.length; i++) {
      const keyword = keywordsToProcess[i];
      console.log(`🔍 Processing ${i + 1}/${keywordsToProcess.length}: "${keyword}"`);
      
      try {
        // Call the single keyword research function
        const researchResult = await processSingleKeyword(keyword);
        results.push({
          row_number: i + 1,
          seed_keyword: keyword,
          research_successful: true,
          error_message: '',
          ...researchResult
        });
        console.log(`✅ Completed "${keyword}": ${researchResult.supporting_keywords?.length || 0} supporting keywords`);
      } catch (error) {
        console.error(`❌ Error processing "${keyword}":`, error);
        errors.push({
          row_number: i + 1,
          seed_keyword: keyword,
          research_successful: false,
          error_message: error.message
        });
      }
      
      // Rate limiting between keywords
      if (i < keywordsToProcess.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log(`✅ Batch processing complete: ${results.length} successful, ${errors.length} failed`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        total_keywords: keywordsToProcess.length,
        successful: results.length,
        failed: errors.length,
        results: results,
        errors: errors,
        processing_time: 'completed',
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('❌ Batch processing error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false,
        error: error.message || 'Unknown error occurred'
      })
    };
  }
};

async function parseCSV(csvData) {
  return new Promise((resolve, reject) => {
    const keywords = [];
    const stream = Readable.from([csvData]);
    
    stream
      .pipe(csv())
      .on('data', (row) => {
        // Look for keyword in common column names
        const keyword = row.keyword || row.keywords || row.term || row.phrase || 
                       row['Parent Topic'] || row['parent_topic'] || row['parent topic'] ||
                       Object.values(row)[0]; // fallback to first column
        
        if (keyword && keyword.trim()) {
          keywords.push(keyword.trim());
        }
      })
      .on('end', () => {
        resolve(keywords);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

async function processSingleKeyword(keyword) {
  // This would call the keyword-research function internally
  // For now, we'll implement a simplified version
  
  const DATAFORSEO_USERNAME = 'houston.barnettgearhart@gmail.com';
  const DATAFORSEO_API_KEY = '78ed0af9b3c7e819';
  
  // Get top 10 URLs
  const originalTop10Urls = await getSerpUrls(keyword, DATAFORSEO_USERNAME, DATAFORSEO_API_KEY);
  
  if (!originalTop10Urls || originalTop10Urls.length === 0) {
    throw new Error('No search results found for keyword');
  }
  
  // Get keywords from top 3 URLs
  const top3Urls = originalTop10Urls.slice(0, 3);
  const allKeywords = [];
  
  for (const url of top3Urls) {
    const rankedKeywords = await getRankedKeywords(url, DATAFORSEO_USERNAME, DATAFORSEO_API_KEY);
    allKeywords.push(...rankedKeywords);
  }
  
  // Remove duplicates and sort
  const uniqueKeywords = {};
  allKeywords.forEach(kw => {
    const key = kw.keyword.toLowerCase();
    if (!uniqueKeywords[key] || (kw.search_volume || 0) > (uniqueKeywords[key].search_volume || 0)) {
      uniqueKeywords[key] = kw;
    }
  });
  
  const sortedKeywords = Object.values(uniqueKeywords).sort((a, b) => {
    const volumeA = a.search_volume || 0;
    const volumeB = b.search_volume || 0;
    const cpcA = a.cpc || 0;
    const cpcB = b.cpc || 0;
    
    if (volumeB !== volumeA) return volumeB - volumeA;
    return cpcB - cpcA;
  });
  
  // Find supporting keywords with 40%+ overlap
  const supportingKeywords = [];
  
  for (let i = 0; i < Math.min(sortedKeywords.length, 20) && supportingKeywords.length < 4; i++) {
    const candidateKeyword = sortedKeywords[i];
    const candidateUrls = await getSerpUrls(candidateKeyword.keyword, DATAFORSEO_USERNAME, DATAFORSEO_API_KEY);
    
    if (candidateUrls.length > 0) {
      const overlap = calculateUrlOverlap(originalTop10Urls, candidateUrls);
      
      if (overlap >= 40) {
        supportingKeywords.push({
          keyword: candidateKeyword.keyword,
          search_volume: candidateKeyword.search_volume || 0,
          cpc: candidateKeyword.cpc || 0,
          overlap_percentage: overlap,
          matching_urls: candidateUrls.filter(url => originalTop10Urls.includes(url)),
          total_original_urls: originalTop10Urls.length
        });
      }
    }
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return {
    original_top_10_urls_count: originalTop10Urls.length,
    keywords_from_top_3_urls_count: sortedKeywords.length,
    supporting_keywords_found: supportingKeywords.length,
    supporting_keywords: supportingKeywords
  };
}

// Helper functions (same as keyword-research.js)
async function getSerpUrls(keyword, username, apiKey) {
  try {
    const auth = Buffer.from(`${username}:${apiKey}`).toString('base64');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    const response = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([{
        keyword: keyword,
        location_code: 2840,
        language_code: 'en',
        device: 'desktop',
        os: 'windows'
      }]),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    const data = await response.json();
    
    if (data.status_code === 20000 && data.tasks && data.tasks[0].result) {
      const serpData = data.tasks[0].result[0];
      return (serpData.items || []).slice(0, 10).map(item => normalizeUrl(item.url));
    }
    return [];
  } catch (error) {
    console.error(`Error getting SERP URLs for "${keyword}":`, error);
    return [];
  }
}

async function getRankedKeywords(url, username, apiKey) {
  try {
    const auth = Buffer.from(`${username}:${apiKey}`).toString('base64');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    const response = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/ranked_keywords/live', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([{
        target: url,
        location_code: 2840,
        language_code: 'en',
        limit: 100
      }]),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    const data = await response.json();
    
    if (data.status_code === 20000 && data.tasks && data.tasks[0].result) {
      const result = data.tasks[0].result[0];
      if (result && result.items) {
        return result.items
          .filter(item => {
            const position = item.ranked_serp_element?.serp_item?.rank_group || 0;
            return position >= 1 && position <= 10;
          })
          .map(item => ({
            keyword: item.keyword_data?.keyword || '',
            search_volume: item.keyword_data?.keyword_info?.search_volume || 0,
            cpc: item.keyword_data?.keyword_info?.cpc || 0,
            position: item.ranked_serp_element?.serp_item?.rank_group || 0
          }))
          .filter(kw => kw.keyword && kw.keyword.trim());
      }
    }
    return [];
  } catch (error) {
    console.error(`Error getting ranked keywords for "${url}":`, error);
    return [];
  }
}

function calculateUrlOverlap(urls1, urls2) {
  if (urls1.length === 0 || urls2.length === 0) return 0;
  
  const set1 = new Set(urls1);
  const set2 = new Set(urls2);
  
  let matches = 0;
  for (const url of set1) {
    if (set2.has(url)) {
      matches++;
    }
  }
  
  return Math.round((matches / Math.min(urls1.length, urls2.length)) * 100);
}

function normalizeUrl(url) {
  if (!url) return '';
  return url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
    .toLowerCase();
}