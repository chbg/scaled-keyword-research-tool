const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  console.log('=== OPTIMIZED KEYWORD RESEARCH FUNCTION ===');
  
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

  let keyword = '';
  let maxSupportingKeywords = 4;

  try {
    const body = JSON.parse(event.body || '{}');
    keyword = (body.keyword && body.keyword.trim()) || '';
    maxSupportingKeywords = body.max_supporting_keywords || 4;

    console.log(`📝 INPUT: Keyword="${keyword}", MaxSupportingKeywords=${maxSupportingKeywords}`);

    if (!keyword) {
      console.error('❌ ERROR: No keyword provided');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Keyword is required' })
      };
    }

    // Get environment variables
    const DATAFORSEO_USERNAME = process.env.DATAFORSEO_USERNAME;
    const DATAFORSEO_API_KEY = process.env.DATAFORSEO_API_KEY;

    console.log(`🔑 API Keys: DataForSEO=${DATAFORSEO_API_KEY ? 'SET' : 'NOT SET'}`);
    
    if (!DATAFORSEO_USERNAME || !DATAFORSEO_API_KEY) {
      console.error('❌ ERROR: Missing API credentials');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Missing API credentials',
          debug: {
            DATAFORSEO_USERNAME: DATAFORSEO_USERNAME ? 'Set' : 'Missing',
            DATAFORSEO_API_KEY: DATAFORSEO_API_KEY ? 'Set' : 'Missing'
          }
        })
      };
    }

    // STEP 1: Get top 10 URLs for the primary keyword
    console.log('🔍 STEP 1: Getting top 10 URLs for the keyword...');
    const originalTop10Urls = await getSerpUrls(keyword, DATAFORSEO_USERNAME, DATAFORSEO_API_KEY, 10);
    
    if (!originalTop10Urls || originalTop10Urls.length === 0) {
      console.error('❌ ERROR: No URLs found for primary keyword');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Failed to get search results for keyword',
          debug: { keyword, urlsFound: (originalTop10Urls && originalTop10Urls.length) || 0 }
        })
      };
    }

    console.log(`✅ Found ${originalTop10Urls.length} URLs for "${keyword}"`);

    // STEP 2: Get keywords from top 3 URLs in parallel
    console.log('📊 STEP 2: Getting keywords from top 3 URLs in parallel...');
    const top3Urls = originalTop10Urls.slice(0, 3);
    
    // Make all 3 API calls in parallel
    const keywordPromises = top3Urls.map(url => 
      getRankedKeywords(url, DATAFORSEO_USERNAME, DATAFORSEO_API_KEY)
    );
    
    const keywordResults = await Promise.all(keywordPromises);
    const allKeywords = keywordResults.flat();
    
    console.log(`✅ Found ${allKeywords.length} total keywords from top 3 URLs`);

    // Remove duplicates and sort by volume and CPC
    const uniqueKeywords = new Map();
    allKeywords.forEach(kw => {
      const key = kw.keyword.toLowerCase();
      if (!uniqueKeywords.has(key) || uniqueKeywords.get(key).search_volume < kw.search_volume) {
        uniqueKeywords.set(key, kw);
      }
    });

    const sortedKeywords = Array.from(uniqueKeywords.values())
      .sort((a, b) => {
        const volumeA = a.search_volume || 0;
        const volumeB = b.search_volume || 0;
        if (volumeB !== volumeA) return volumeB - volumeA;
        const cpcA = a.cpc || 0;
        const cpcB = b.cpc || 0;
        return cpcB - cpcA;
      });

    console.log(`✅ Found ${sortedKeywords.length} unique keywords from top 3 URLs`);

    // STEP 3: Check up to 10 keywords for URL overlap (reduced for speed)
    console.log('🎯 STEP 3: Finding supporting keywords with 40%+ URL overlap...');
    const supportingKeywords = [];
    const maxKeywordsToCheck = Math.min(sortedKeywords.length, 10); // Reduced from 20 to 10
    
    // Process keywords in smaller batches for speed
    const batchSize = 3;
    for (let i = 0; i < maxKeywordsToCheck && supportingKeywords.length < maxSupportingKeywords; i += batchSize) {
      const batch = sortedKeywords.slice(i, i + batchSize);
      console.log(`  🔍 Checking batch ${Math.floor(i/batchSize) + 1}: ${batch.length} keywords`);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (candidateKeyword) => {
        try {
          console.log(`    🔍 Checking: "${candidateKeyword.keyword}"`);
          
          const candidateUrls = await getSerpUrls(candidateKeyword.keyword, DATAFORSEO_USERNAME, DATAFORSEO_API_KEY, 10);
          if (candidateUrls.length === 0) {
            console.log(`    ❌ No URLs found for "${candidateKeyword.keyword}"`);
            return null;
          }
          
          const overlap = calculateUrlOverlap(originalTop10Urls, candidateUrls);
          console.log(`    📊 Overlap: ${overlap}% (${originalTop10Urls.length} vs ${candidateUrls.length} URLs)`);
          
          if (overlap >= 40) {
            const supportingKeyword = {
              keyword: candidateKeyword.keyword,
              search_volume: candidateKeyword.search_volume || 0,
              cpc: candidateKeyword.cpc || 0,
              overlap_percentage: overlap,
              matching_urls: candidateUrls.filter(url => originalTop10Urls.includes(url)),
              total_original_urls: originalTop10Urls.length
            };
            
            console.log(`    ✅ Added as supporting keyword (${overlap}% overlap)`);
            return supportingKeyword;
          } else {
            console.log(`    ❌ Insufficient overlap (${overlap}%)`);
            return null;
          }
        } catch (error) {
          console.error(`    ❌ Error checking "${candidateKeyword.keyword}":`, error.message);
          return null;
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      const validResults = batchResults.filter(result => result !== null);
      supportingKeywords.push(...validResults);
      
      console.log(`  ✅ Batch complete: ${validResults.length} supporting keywords found`);
      
      // If we have enough supporting keywords, break
      if (supportingKeywords.length >= maxSupportingKeywords) {
        break;
      }
    }

    // Limit to requested number
    const finalSupportingKeywords = supportingKeywords.slice(0, maxSupportingKeywords);
    console.log(`✅ Found ${finalSupportingKeywords.length} supporting keywords`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        input_keyword: keyword,
        original_top_10_urls: originalTop10Urls,
        keywords_from_top_3_urls: sortedKeywords.slice(0, 20),
        supporting_keywords: finalSupportingKeywords,
        total_supporting_keywords_found: finalSupportingKeywords.length,
        processing_time: new Date().toISOString(),
        mode: 'OPTIMIZED_FOR_SPEED'
      })
    };

  } catch (error) {
    console.error('❌ CRITICAL ERROR in main function:', error);
    console.error('❌ Error stack:', error.stack);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message,
        keyword: keyword || 'unknown'
      })
    };
  }
};

async function getSerpUrls(keyword, username, apiKey, maxUrls = 10) {
  try {
    console.log(`    🔍 Getting SERP URLs for: "${keyword}"`);
    
    const auth = Buffer.from(`${username}:${apiKey}`).toString('base64');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6 second timeout
    
    const response = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([{
        keyword: keyword,
        location_name: 'United States',
        language_code: 'en',
        depth: 10
      }]),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('    📊 SERP API Response status:', data.status_code);
    
    // Check if the response is successful (matching Python version)
    if (data.status_code !== 20000 || !data.tasks) {
      console.error('    ❌ SERP API Error:', data.status_message || 'Unknown error');
      console.error('    ❌ Status code:', data.status_code);
      return [];
    }
    
    const task = data.tasks[0];
    console.log('    📊 Task status:', task.status_code);
    
    if (task.status_code !== 20000 || !task.result || !task.result[0]) {
      console.error('    ❌ Task failed:', task.status_message || 'No result in task');
      return [];
    }
    
    // Get the result data (matching Python version: data['tasks'][0]['result'][0])
    const serpData = task.result[0];
    console.log('    📊 SERP data keys:', Object.keys(serpData));
    
    const items = serpData.items || [];
    console.log(`    📊 Found ${items.length} total SERP items`);
    
    if (items.length > 0) {
      console.log('    📊 First item structure:', Object.keys(items[0]));
      console.log('    📊 First item type:', items[0].type);
    }
    
    // Extract organic URLs (matching Python version logic)
    const urls = [];
    for (const item of items) {
      if (item.type === 'organic' && urls.length < maxUrls) {
        const url = item.url;
        if (url) {
          urls.push(url);
        }
      }
    }
    
    console.log(`    📊 Found ${urls.length} organic URLs`);
    return urls;
      
  } catch (error) {
    console.error(`    ❌ ERROR getting SERP URLs for "${keyword}":`, error);
    return [];
  }
}

async function getRankedKeywords(url, username, apiKey) {
  try {
    console.log(`    📊 Getting ranked keywords for: "${url}"`);
    
    const auth = Buffer.from(`${username}:${apiKey}`).toString('base64');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6 second timeout
    
    const response = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/ranked_keywords/live', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([{
        target: url,
        location_name: 'United States',
        language_code: 'en',
        limit: 50
      }]),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Check if the response is successful
    if (data.status_code !== 20000 || !data.tasks || !data.tasks[0]) {
      console.error('    ❌ Ranked Keywords API Error:', data.status_message || 'Unknown error');
      return [];
    }
    
    const task = data.tasks[0];
    
    if (task.status_code !== 20000 || !task.result || !task.result[0] || !task.result[0].items) {
      console.error('    ❌ Task Error:', task.status_message || 'No results found');
      return [];
    }
    
    const items = task.result[0].items || [];
    console.log(`    📊 Found ${items.length} ranked keyword items`);
    
    const keywords = items
      .filter(item => item.ranked_serp_element && item.ranked_serp_element.serp_item && item.ranked_serp_element.serp_item.rank_group <= 10)
      .map(item => ({
        keyword: (item.keyword_data && item.keyword_data.keyword) || '',
        search_volume: (item.keyword_data && item.keyword_data.keyword_info && item.keyword_data.keyword_info.search_volume) || 0,
        cpc: (item.keyword_data && item.keyword_data.keyword_info && item.keyword_data.keyword_info.cpc) || 0,
        position: (item.ranked_serp_element && item.ranked_serp_element.serp_item && item.ranked_serp_element.serp_item.rank_group) || 0
      }))
      .filter(kw => kw.keyword && kw.keyword.trim());
    
    console.log(`    📊 Found ${keywords.length} valid keywords`);
    return keywords;
      
  } catch (error) {
    console.error(`    ❌ ERROR getting ranked keywords for "${url}":`, error);
    return [];
  }
}

function calculateUrlOverlap(urls1, urls2) {
  const set1 = new Set(urls1.map(normalizeUrl));
  const set2 = new Set(urls2.map(normalizeUrl));
  
  const intersection = new Set([...set1].filter(url => set2.has(url)));
  const union = new Set([...set1, ...set2]);
  
  return Math.round((intersection.size / union.size) * 100);
}

function normalizeUrl(url) {
  return url
    .toLowerCase()
    .replace(/\/$/, '')
    .replace(/\?.*$/, '')
    .replace(/#.*$/, '');
}