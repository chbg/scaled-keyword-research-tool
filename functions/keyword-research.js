const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  console.log('=== KEYWORD RESEARCH FUNCTION v2.0 STARTED ===');
  console.log('Event:', JSON.stringify(event, null, 2));
  
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

  // Set up timeout handler
  const timeoutId = setTimeout(() => {
    console.error('⏰ Function timeout - this should not happen');
  }, 120000); // 120 seconds (well under Netlify's 150s limit)

  try {
    const body = JSON.parse(event.body || '{}');
    const keyword = body.keyword?.trim() || '';
    const maxSupportingKeywords = body.max_supporting_keywords || 4;

    console.log(`📝 INPUT: Keyword="${keyword}", MaxSupportingKeywords=${maxSupportingKeywords}`);

    if (!keyword) {
      clearTimeout(timeoutId);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Keyword is required' })
      };
    }

    // API Keys from environment variables
    const DATAFORSEO_USERNAME = process.env.DATAFORSEO_USERNAME;
    const DATAFORSEO_API_KEY = process.env.DATAFORSEO_API_KEY;

    console.log(`🔑 API Keys: DataForSEO=${DATAFORSEO_API_KEY ? 'SET' : 'NOT SET'}`);
    
    if (!DATAFORSEO_USERNAME || !DATAFORSEO_API_KEY) {
      clearTimeout(timeoutId);
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

    // Test API credentials first
    console.log('🧪 Testing API credentials...');
    const apiTest = await testDataForSEOAPI(DATAFORSEO_USERNAME, DATAFORSEO_API_KEY);
    if (!apiTest.success) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'API authentication failed',
          debug: apiTest
        })
      };
    }
    console.log('✅ API credentials verified');

    // STEP 1: Get top 10 URLs for the keyword
    console.log('🔍 STEP 1: Getting top 10 URLs for the keyword...');
    const originalTop10Urls = await getSerpUrls(keyword, DATAFORSEO_USERNAME, DATAFORSEO_API_KEY);
    
    if (!originalTop10Urls || originalTop10Urls.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Failed to get search results for keyword',
          debug: { keyword, urlsFound: originalTop10Urls?.length || 0 }
        })
      };
    }
    console.log(`✅ Found ${originalTop10Urls.length} URLs for "${keyword}"`);

    // STEP 2: Get keywords from top 3 URLs
    console.log('📊 STEP 2: Getting keywords from top 3 URLs...');
    const top3Urls = originalTop10Urls.slice(0, 3);
    const allKeywords = [];
    
    for (let i = 0; i < top3Urls.length; i++) {
      const url = top3Urls[i];
      console.log(`  🔍 Getting ranked keywords for URL ${i + 1}/${top3Urls.length}: "${url}"`);
      
      const rankedKeywords = await getRankedKeywords(url, DATAFORSEO_USERNAME, DATAFORSEO_API_KEY);
      console.log(`  ✅ Found ${rankedKeywords.length} keywords for "${url}"`);
      
      allKeywords.push(...rankedKeywords);
    }

    // Remove duplicates and sort by volume (desc) and CPC (desc)
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

    console.log(`✅ Found ${sortedKeywords.length} unique keywords from top 3 URLs`);

    // STEP 3: Find supporting keywords with 40%+ URL overlap
    console.log('🎯 STEP 3: Finding supporting keywords with 40%+ URL overlap...');
    const supportingKeywords = [];
    
    // Limit to top 10 keywords to avoid timeout
    const maxKeywordsToCheck = Math.min(sortedKeywords.length, 10);
    
    for (let i = 0; i < maxKeywordsToCheck && supportingKeywords.length < maxSupportingKeywords; i++) {
      const candidateKeyword = sortedKeywords[i];
      console.log(`  🔍 Checking keyword ${i + 1}/${maxKeywordsToCheck}: "${candidateKeyword.keyword}"`);
      
      try {
        const candidateUrls = await getSerpUrls(candidateKeyword.keyword, DATAFORSEO_USERNAME, DATAFORSEO_API_KEY);
        if (candidateUrls.length === 0) {
          console.log(`    ❌ No URLs found for "${candidateKeyword.keyword}", skipping`);
          continue;
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
          
          supportingKeywords.push(supportingKeyword);
          console.log(`    ✅ Added as supporting keyword (${overlap}% overlap)`);
        } else {
          console.log(`    ❌ Insufficient overlap (${overlap}%)`);
        }
      } catch (error) {
        console.error(`    ❌ Error checking "${candidateKeyword.keyword}":`, error.message);
        continue;
      }
      
      // Reduced rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`✅ Found ${supportingKeywords.length} supporting keywords`);

    clearTimeout(timeoutId);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        input_keyword: keyword,
        original_top_10_urls: originalTop10Urls,
        keywords_from_top_3_urls: sortedKeywords.slice(0, 20),
        supporting_keywords: supportingKeywords,
        total_supporting_keywords_found: supportingKeywords.length,
        processing_time: 'completed',
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('❌ Error:', error);
    console.error('❌ Error stack:', error.stack);
    
    clearTimeout(timeoutId);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false,
        error: error.message || 'Unknown error occurred',
        keyword: keyword || 'unknown'
      })
    };
  }
};

// Helper Functions

async function getSerpUrls(keyword, username, apiKey) {
  try {
    console.log(`    🔍 Getting SERP URLs for: "${keyword}"`);
    
    const auth = Buffer.from(`${username}:${apiKey}`).toString('base64');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
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
    console.error(`    ❌ Error getting SERP URLs for "${keyword}":`, error);
    return [];
  }
}

async function getRankedKeywords(url, username, apiKey) {
  try {
    console.log(`    📊 Getting ranked keywords for: "${url}"`);
    
    const auth = Buffer.from(`${username}:${apiKey}`).toString('base64');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
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
    console.error(`    ❌ Error getting ranked keywords for "${url}":`, error);
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

async function testDataForSEOAPI(username, apiKey) {
  try {
    console.log('    🧪 Testing DataForSEO API credentials...');
    
    const auth = Buffer.from(`${username}:${apiKey}`).toString('base64');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    const response = await fetch('https://api.dataforseo.com/v3/appendix/user_data', {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    const data = await response.json();
    
    if (data.status_code === 20000) {
      console.log('    ✅ API credentials are valid');
      return { success: true, data: data };
    } else {
      console.log('    ❌ API credentials failed:', data);
      return { 
        success: false, 
        error: data.status_message || 'Unknown API error',
        status_code: data.status_code
      };
    }
  } catch (error) {
    console.error('    ❌ API test error:', error);
    return { 
      success: false, 
      error: error.message,
      type: 'network_error'
    };
  }
}
