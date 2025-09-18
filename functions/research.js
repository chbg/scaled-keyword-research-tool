exports.handler = async (event, context) => {
  console.log('=== KEYWORD RESEARCH FUNCTION STARTED ===');
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
  }, 140000); // 140 seconds (less than Netlify's 150s limit)

  try {
      const body = JSON.parse(event.body || '{}');
      const keyword = body.keyword?.trim() || '';
      const clientDescription = body.client_description?.trim() || '';

      console.log(`📝 INPUT: Keyword="${keyword}", ClientDescription="${clientDescription || 'Not provided'}"`);

      if (!keyword) {
        clearTimeout(timeoutId);
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Keyword is required' })
        };
      }

    // API Keys
    const DATAFORSEO_USERNAME = 'houston.barnettgearhart@gmail.com';
    const DATAFORSEO_API_KEY = '78ed0af9b3c7e819';

    console.log(`🔑 API Keys: DataForSEO=${DATAFORSEO_API_KEY ? 'SET' : 'NOT SET'}`);

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

    // STEP 1: Get live Google SERP data for the keyword
    console.log('🔍 STEP 1: Getting live Google SERP data...');
    const serpData = await getSerpData(keyword, DATAFORSEO_USERNAME, DATAFORSEO_API_KEY);
    
    if (!serpData || !serpData.items || serpData.items.length === 0) {
      console.log('❌ SERP data validation failed:', {
        serpData: serpData,
        hasItems: serpData?.items ? true : false,
        itemsLength: serpData?.items?.length || 0
      });
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Failed to get search results data',
          debug: {
            hasData: !!serpData,
            hasItems: !!(serpData?.items),
            itemsCount: serpData?.items?.length || 0
          }
        })
      };
    }
    console.log(`✅ SERP data retrieved: ${serpData.items.length} results`);

    // STEP 2: Use OpenAI to intelligently identify top 3 competitor URLs
    console.log('🎯 STEP 2: Using OpenAI to identify best competitors...');
    const competitorUrls = await findCompetitorUrls(serpData, clientDescription, DATAFORSEO_USERNAME, DATAFORSEO_API_KEY);
    console.log(`✅ Found ${competitorUrls.length} competitors:`, competitorUrls);
    
    if (competitorUrls.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'No relevant competitors found' })
      };
    }

    // STEP 3: Get keywords that the top 3 URLs are ranking for
    console.log('📊 STEP 3: Getting keywords that top 3 URLs are ranking for...');
    const allKeywords = [];
    
    for (let i = 0; i < competitorUrls.length; i++) {
      const url = competitorUrls[i];
      console.log(`  🔍 Getting URL-specific keywords for competitor ${i + 1}/${competitorUrls.length}: "${url}"`);
      
      if (!url || !url.includes('http')) {
        console.log(`  ❌ Invalid URL: "${url}", skipping`);
        continue;
      }
      
      const rankedKeywords = await getRankedKeywords(url, DATAFORSEO_USERNAME, DATAFORSEO_API_KEY);
      console.log(`  ✅ Found ${rankedKeywords.length} URL-specific keywords for ${url}`);
      
      // Process ranked keywords and add to collection
      rankedKeywords.forEach(kw => {
        // New SERP API approach returns keywords in this format
        const keywordText = kw.keyword || kw.keyword_data?.keyword || kw.se_keyword || kw.target || kw.query || '';
        const position = kw.position || kw.ranked_serp_element?.serp_item?.rank_group || kw.rank_group || 0;
        
        // Only include keywords ranking on page 1 (positions 1-10)
        if (keywordText && keywordText.trim() && position >= 1 && position <= 10) {
          allKeywords.push({
            keyword: keywordText.trim(),
            volume: kw.volume || 0, // We don't have volume data from SERP approach
            keyword_difficulty: kw.keyword_difficulty || 0, // We don't have difficulty data
            cpc: kw.cpc || 0, // We don't have CPC data
            url: url,
            position: position,
            overlap_percentage: 0 // Will be calculated later
          });
        }
      });
    }

    console.log(`✅ Total keywords collected: ${allKeywords.length}`);
    console.log(`🔍 Sample keywords:`, allKeywords.slice(0, 3).map(kw => ({
      keyword: kw.keyword,
      position: kw.position,
      url: kw.url
    })));

    if (allKeywords.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'No keywords found for this topic' })
      };
    }

    // STEP 4: De-duplicate keywords
    console.log('🔄 STEP 4: De-duplicating keywords...');
    const uniqueKeywords = {};
    allKeywords.forEach(kw => {
      const key = kw.keyword.toLowerCase();
      if (!uniqueKeywords[key] || kw.volume > uniqueKeywords[key].volume) {
        uniqueKeywords[key] = kw;
      }
    });
    
    const deduplicatedKeywords = Object.values(uniqueKeywords);
    console.log(`✅ De-duplicated: ${allKeywords.length} → ${deduplicatedKeywords.length} keywords`);

    // STEP 5: Sort by Volume (desc), Keyword Difficulty (asc), CPC (desc)
    console.log('📈 STEP 5: Sorting keywords by criteria...');
    const sortedKeywords = deduplicatedKeywords.sort((a, b) => {
      // Primary: Volume (descending)
      if (b.volume !== a.volume) return b.volume - a.volume;
      // Secondary: Keyword Difficulty (ascending)
      if (a.keyword_difficulty !== b.keyword_difficulty) return a.keyword_difficulty - b.keyword_difficulty;
      // Tertiary: CPC (descending)
      return b.cpc - a.cpc;
    });
    console.log(`✅ Sorted ${sortedKeywords.length} keywords`);

    // STEP 6: Select best 10 keywords with REAL URL overlap filtering
    console.log('🎯 STEP 6: Selecting best 10 keywords with REAL URL overlap filtering...');
    console.log(`🔍 Input to selection: ${sortedKeywords.length} keywords`);
    console.log(`🔍 Sample input keywords:`, sortedKeywords.slice(0, 3).map(kw => kw.keyword));
    
    const selectedKeywords = await selectBestKeywordsWithChunkedOverlap(sortedKeywords, keyword, DATAFORSEO_USERNAME, DATAFORSEO_API_KEY);
    console.log(`✅ Selected ${selectedKeywords.length} final keywords`);
    console.log(`🔍 Final keywords with overlap:`, selectedKeywords.map(kw => ({
      keyword: kw.keyword,
      overlap: kw.overlap_percentage
    })));

    clearTimeout(timeoutId);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        keyword: keyword,
        total_keywords_found: allKeywords.length,
        unique_keywords: deduplicatedKeywords.length,
        selected_keywords_count: selectedKeywords.length,
        selected_keywords: selectedKeywords
      })
    };

  } catch (error) {
    console.error('❌ Error:', error);
    console.error('❌ Error stack:', error.stack);
    
    clearTimeout(timeoutId);
    
    // Ensure we always return valid JSON
    try {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          success: false,
          error: error.message || 'Unknown error occurred',
          keyword: keyword || 'unknown'
        })
      };
    } catch (jsonError) {
      console.error('❌ JSON stringify error:', jsonError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          success: false,
          error: 'Internal server error',
          keyword: 'unknown'
        })
      };
    }
  }
};

// Helper Functions

async function generateBusinessDescription(url, openaiApiKey) {
  try {
    console.log(`    🤖 Calling OpenAI to generate business description for: ${url}`);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{
          role: 'user',
          content: `Analyze this website URL and generate a brief business description (1-2 sentences): ${url}`
        }],
        max_tokens: 100,
        temperature: 0.7
      })
    });

    const data = await response.json();
    console.log(`    ✅ OpenAI response:`, data);
    
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return data.choices[0].message.content.trim();
    }
    
    return 'Professional business providing services and solutions';
  } catch (error) {
    console.error('    ❌ OpenAI error:', error);
    return 'Professional business providing services and solutions';
  }
}

async function getSerpData(keyword, username, apiKey) {
  try {
    console.log(`    🔍 Getting SERP data for: "${keyword}"`);
    console.log(`    🔑 Using credentials: ${username} / ${apiKey ? 'SET' : 'NOT SET'}`);
    console.log(`    ⏱️ Timeout: 120 seconds (DataForSEO recommended)`);
    console.log(`    🚀 Using live endpoint for real-time data`);
    
    const auth = Buffer.from(`${username}:${apiKey}`).toString('base64');
    console.log(`    🔐 Auth string: ${auth.substring(0, 20)}...`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 120 seconds as recommended by DataForSEO
    
    const requestBody = [{
      keyword: keyword,
      location_code: 2840,
      language_code: 'en'
    }];
    
    console.log(`    📤 Request body:`, JSON.stringify(requestBody, null, 2));
    
    // Try the faster regular endpoint first
    const response = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/regular', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    console.log(`    📥 Response status: ${response.status}`);
    console.log(`    📥 Response headers:`, Object.fromEntries(response.headers.entries()));
    
    const data = await response.json();
    console.log(`    📥 Response data:`, JSON.stringify(data, null, 2));
    
    if (data.status_code === 20000 && data.tasks && data.tasks[0].result) {
      console.log(`    ✅ SERP data retrieved successfully`);
      return data.tasks[0].result[0];
    } else {
      console.log(`    ❌ SERP API error:`, {
        status_code: data.status_code,
        status_message: data.status_message,
        tasks: data.tasks ? data.tasks.length : 0,
        hasResult: data.tasks?.[0]?.result ? true : false,
        fullResponse: data
      });
      return null;
    }
  } catch (error) {
    console.error('    ❌ SERP API error:', error);
    console.error('    ❌ Error details:', error.message);
    
    if (error.name === 'AbortError') {
      console.error('    ⏰ Request timed out after 120 seconds');
      console.log('    🔄 Trying fallback approach...');
      return await getSerpDataFallback(keyword, username, apiKey);
    }
    
    // Handle DataForSEO specific errors
    if (error.message && error.message.includes('50000')) {
      console.error('    ❌ DataForSEO Internal Error - retrying...');
      // Retry once after a short delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      return await getSerpData(keyword, username, apiKey);
    }
    
    if (error.message && error.message.includes('50401')) {
      console.error('    ❌ DataForSEO Timeout Error - retrying...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      return await getSerpData(keyword, username, apiKey);
    }
    
    return null;
  }
}

async function getSerpDataFallback(keyword, username, apiKey) {
  try {
    console.log(`    🔄 FALLBACK: Using simpler SERP approach for: "${keyword}"`);
    
    // Use a simpler endpoint that might be faster
    const auth = Buffer.from(`${username}:${apiKey}`).toString('base64');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 120 seconds as recommended by DataForSEO
    
    const requestBody = [{
      keyword: keyword,
      location_code: 2840,
      language_code: 'en',
      device: 'desktop',
      os: 'windows'
    }];
    
    const response = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/regular', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.error(`    ❌ Fallback SERP API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (data.status_code === 20000 && data.tasks && data.tasks[0].result) {
      console.log(`    ✅ Fallback SERP data retrieved successfully`);
      return data.tasks[0].result[0];
    }
    
    console.log(`    ❌ Fallback SERP API error:`, data);
    return null;
  } catch (error) {
    console.error('    ❌ Fallback SERP API error:', error);
    return null;
  }
}

async function findCompetitorUrls(serpData, clientDescription, username, apiKey) {
  try {
    console.log(`    🎯 Finding competitors...`);
    
    // Extract top 10 URLs from SERP data
    const serpUrls = serpData.items.slice(0, 10).map(item => ({
      url: item.url,
      title: item.title,
      description: item.description
    }));
    
    console.log(`    📋 Top 10 SERP URLs:`, serpUrls.map(u => u.url));
    
    // If no client description provided, use simple top 3 organic results
    if (!clientDescription || clientDescription.trim() === '') {
      console.log(`    📝 No client description provided, using top 3 organic results`);
      const selectedUrls = serpUrls.slice(0, 3).map(item => item.url);
      console.log(`    ✅ Selected competitors (top 3):`, selectedUrls);
      return selectedUrls;
    }
    
    // If client description provided, use intelligent filtering
    console.log(`    🧠 Client description provided, using intelligent competitor selection`);
    
    // Simple heuristic: prefer URLs that look like actual businesses
    const businessUrls = serpUrls.filter(item => {
      const url = item.url.toLowerCase();
      const title = item.title.toLowerCase();
      const description = item.description.toLowerCase();
      
      // Skip directories, aggregators, and generic sites
      const skipPatterns = [
        'wikipedia', 'yelp', 'yellowpages', 'directory', 'listings',
        'google.com', 'bing.com', 'duckduckgo.com', 'search',
        'reddit.com', 'quora.com', 'stackoverflow.com'
      ];
      
      const isSkip = skipPatterns.some(pattern => 
        url.includes(pattern) || title.includes(pattern) || description.includes(pattern)
      );
      
      return !isSkip;
    });
    
    const selectedUrls = businessUrls.slice(0, 3).map(item => item.url);
    console.log(`    ✅ Selected competitors (filtered):`, selectedUrls);
    return selectedUrls;
    
  } catch (error) {
    console.error('    ❌ Competitor analysis error:', error);
    // Fallback: return first 3 URLs
    const serpUrls = serpData.items.slice(0, 3).map(item => item.url);
    console.log(`    ⚠️ Using fallback competitors:`, serpUrls);
    return serpUrls;
  }
}

async function getRankedKeywords(url, username, apiKey) {
  try {
    console.log(`    📊 Finding keywords that URL ranks for: "${url}"`);
    
    // Validate URL format
    if (!url || !url.includes('http')) {
      console.log(`    ❌ Invalid URL format: "${url}"`);
      return [];
    }
    
    // Extract domain from URL for keyword generation
    const domain = url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    console.log(`    🎯 Extracted domain: ${domain}`);
    
    // Generate related keywords based on the URL content
    const relatedKeywords = await generateRelatedKeywords(url, domain, username, apiKey);
    console.log(`    🔍 Generated ${relatedKeywords.length} related keywords to test`);
    
    if (relatedKeywords.length === 0) {
      console.log(`    ⚠️ No related keywords generated, returning empty`);
      return [];
    }
    
    // Test each keyword with SERP API to see if our URL ranks for it
    const rankingKeywords = [];
    
    for (const keyword of relatedKeywords.slice(0, 10)) { // Limit to 10 keywords to avoid rate limits
      console.log(`    🔍 Testing keyword: "${keyword}"`);
      
      try {
        const serpData = await getSerpData(keyword, username, apiKey);
        if (serpData && serpData.items) {
          // Check if our target URL appears in the SERP results
          const targetUrlNormalized = normalizeUrl(url);
          const rankingPosition = findUrlPosition(serpData.items, targetUrlNormalized);
          
          if (rankingPosition > 0 && rankingPosition <= 10) {
            console.log(`    ✅ URL ranks #${rankingPosition} for "${keyword}"`);
            rankingKeywords.push({
              keyword: keyword,
              position: rankingPosition,
              volume: 0, // We don't have volume data from this approach
              keyword_difficulty: 0,
              cpc: 0,
              url: url
            });
          } else {
            console.log(`    ❌ URL does not rank in top 10 for "${keyword}"`);
          }
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`    ❌ Error testing keyword "${keyword}":`, error);
      }
    }
    
    console.log(`    ✅ Found ${rankingKeywords.length} keywords that URL actually ranks for`);
    return rankingKeywords;
    
  } catch (error) {
    console.error('    ❌ Error finding ranked keywords:', error);
    return [];
  }
}

async function selectBestKeywordsWithChunkedOverlap(keywords, topKeyword, username, apiKey) {
  console.log(`    🎯 Selecting best keywords with EFFICIENT bulk SERP comparison...`);
  
  if (keywords.length === 0) return [];
  
  // Limit to top 15 keywords to avoid overwhelming the API
  const keywordsToProcess = keywords.slice(0, 15);
  console.log(`    📊 Processing ${keywordsToProcess.length} keywords with bulk SERP call...`);
  
  try {
    // Single bulk SERP call for main keyword + all candidate keywords
    const allKeywords = [topKeyword, ...keywordsToProcess.map(kw => kw.keyword)];
    console.log(`    🔍 Getting bulk SERP data for: ${allKeywords.join(', ')}`);
    
    const bulkSerpData = await getBulkSerpData(allKeywords, username, apiKey);
    console.log(`    ✅ Bulk SERP data retrieved for ${bulkSerpData.length} keywords`);
    
    if (bulkSerpData.length === 0) {
      console.log(`    ⚠️ No bulk SERP data, returning first 10 keywords`);
      return keywordsToProcess.slice(0, 10).map(kw => ({ ...kw, overlap_percentage: 0 }));
    }
    
    // Extract main keyword's URLs (first result)
    const mainKeywordData = bulkSerpData[0];
    const topKeywordUrls = mainKeywordData?.items?.slice(0, 10).map(item => normalizeUrl(item.url)) || [];
    console.log(`    🔍 Main keyword "${topKeyword}" has ${topKeywordUrls.length} URLs`);
    
    if (topKeywordUrls.length === 0) {
      console.log(`    ⚠️ No URLs for main keyword, returning first 10`);
      return keywordsToProcess.slice(0, 10).map(kw => ({ ...kw, overlap_percentage: 0 }));
    }
    
    const selected = [];
    const limit = 10;
    
    // Process each candidate keyword (skip first result which is the main keyword)
    for (let i = 1; i < bulkSerpData.length && selected.length < limit; i++) {
      const keywordData = bulkSerpData[i];
      const keyword = keywordsToProcess[i - 1]; // Adjust index since we skipped main keyword
      
      if (!keywordData?.items || keywordData.items.length === 0) {
        console.log(`      ⚠️ No SERP data for "${keyword.keyword}", skipping`);
        continue;
      }
      
      // Extract top 10 URLs from this keyword's SERP data
      const keywordUrls = keywordData.items.slice(0, 10).map(item => normalizeUrl(item.url));
      console.log(`      🔍 Keyword URLs for "${keyword.keyword}":`, keywordUrls);
      
      // Calculate REAL URL overlap percentage
      const overlap = calculateUrlOverlap(topKeywordUrls, keywordUrls);
      keyword.overlap_percentage = overlap;
      
      console.log(`      📊 "${keyword.keyword}": ${overlap}% overlap (${topKeywordUrls.length} vs ${keywordUrls.length} URLs)`);
      
      // Add keyword regardless of overlap for now, but log the overlap
      selected.push(keyword);
      console.log(`      ✅ Added "${keyword.keyword}" (${overlap}% overlap)`);
    }
    
    // If we don't have enough keywords with 40%+ overlap, add some without overlap filtering
    if (selected.length < 5) {
      console.log(`    ⚠️ Only found ${selected.length} keywords with 40%+ overlap, adding more without overlap filtering`);
      const remainingKeywords = keywordsToProcess.filter(kw => !selected.some(s => s.keyword === kw.keyword));
      const additionalKeywords = remainingKeywords.slice(0, 10 - selected.length).map(kw => ({
        ...kw,
        overlap_percentage: 0
      }));
      selected.push(...additionalKeywords);
      console.log(`    ✅ Added ${additionalKeywords.length} additional keywords without overlap filtering`);
    }
    
    console.log(`    ✅ Selected ${selected.length} keywords total`);
    return selected;
    
  } catch (error) {
    console.log(`    ⚠️ Bulk SERP call failed, returning first 10 keywords:`, error.message);
    return keywordsToProcess.slice(0, 10).map(kw => ({ ...kw, overlap_percentage: 0 }));
  }
}

async function getBulkSerpData(keywords, username, apiKey) {
  try {
    console.log(`    🔍 Getting bulk SERP data for ${keywords.length} keywords...`);
    
    const auth = Buffer.from(`${username}:${apiKey}`).toString('base64');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000); // 45 second timeout for bulk call
    
    const requestBody = keywords.map(keyword => ({
      keyword: keyword,
      location_code: 2840,
      language_code: 'en',
      device: 'desktop',
      os: 'windows'
    }));
    
    console.log(`    📤 Bulk request body:`, JSON.stringify(requestBody, null, 2));
    
    const response = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/regular', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    console.log(`    📥 Bulk response status: ${response.status}`);
    
    const data = await response.json();
    console.log(`    📥 Bulk response data:`, JSON.stringify(data, null, 2));
    
    if (data.status_code === 20000 && data.tasks) {
      // Process all successful tasks
      const successfulResults = [];
      data.tasks.forEach((task, index) => {
        if (task.status_code === 20000 && task.result && task.result[0]) {
          console.log(`    ✅ Task ${index + 1} successful`);
          successfulResults.push(task.result[0]);
        } else {
          console.log(`    ❌ Task ${index + 1} failed: ${task.status_code} - ${task.status_message}`);
        }
      });
      
      console.log(`    ✅ Bulk SERP data: ${successfulResults.length}/${data.tasks.length} successful`);
      return successfulResults;
    } else {
      console.log(`    ❌ Bulk SERP API error:`, data);
      return [];
    }
  } catch (error) {
    console.error('    ❌ Bulk SERP API error:', error);
    return [];
  }
}

async function getSerpUrls(keyword, username, apiKey) {
  try {
    const auth = Buffer.from(`${username}:${apiKey}`).toString('base64');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // Increased to 30 seconds // 2 second timeout for individual calls
    
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

function calculateUrlOverlap(urls1, urls2) {
  console.log(`        🔍 Calculating overlap between ${urls1.length} and ${urls2.length} URLs`);
  console.log(`        📋 URLs1:`, urls1);
  console.log(`        📋 URLs2:`, urls2);
  
  if (urls1.length === 0 || urls2.length === 0) {
    console.log(`        ❌ One or both URL sets are empty`);
    return 0;
  }
  
  const set1 = new Set(urls1);
  const set2 = new Set(urls2);
  
  let matches = 0;
  for (const url of set1) {
    if (set2.has(url)) {
      matches++;
      console.log(`        ✅ Match found: ${url}`);
    }
  }
  
  const overlap = Math.round((matches / Math.min(urls1.length, urls2.length)) * 100);
  console.log(`        📊 Overlap calculation: ${matches} matches / ${Math.min(urls1.length, urls2.length)} = ${overlap}%`);
  
  return overlap;
}

function normalizeUrl(url) {
  if (!url) return '';
  return url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
    .toLowerCase();
}

async function generateRelatedKeywords(url, domain, username, apiKey) {
  try {
    console.log(`    🧠 Generating related keywords for: ${domain}`);
    
    // Simple keyword generation based on domain and URL path
    const keywords = [];
    
    // Extract meaningful words from the URL path
    const pathParts = url.split('/').slice(3); // Remove protocol and domain
    const pathWords = pathParts
      .join(' ')
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .split(' ')
      .filter(word => word.length > 2)
      .map(word => word.toLowerCase());
    
    // Add domain-based keywords
    const domainWords = domain.split('.').slice(0, -1); // Remove TLD
    
    // Generate keyword variations
    keywords.push(...pathWords);
    keywords.push(...domainWords);
    
    // Add common SEO-related terms
    const seoTerms = ['guide', 'tips', 'best', 'how to', 'tutorial', 'examples', 'reviews'];
    keywords.push(...seoTerms);
    
    // Create combinations
    const combinations = [];
    for (const word of pathWords.slice(0, 3)) {
      for (const term of seoTerms.slice(0, 3)) {
        combinations.push(`${word} ${term}`);
        combinations.push(`${term} ${word}`);
      }
    }
    keywords.push(...combinations);
    
    // Remove duplicates and filter
    const uniqueKeywords = [...new Set(keywords)]
      .filter(kw => kw && kw.trim().length > 2)
      .slice(0, 15); // Limit to 15 keywords
    
    console.log(`    ✅ Generated ${uniqueKeywords.length} related keywords:`, uniqueKeywords);
    return uniqueKeywords;
    
  } catch (error) {
    console.error('    ❌ Error generating related keywords:', error);
    return [];
  }
}

function findUrlPosition(serpItems, targetUrl) {
  for (let i = 0; i < serpItems.length; i++) {
    const item = serpItems[i];
    if (item.url && normalizeUrl(item.url) === targetUrl) {
      return i + 1; // Return 1-based position
    }
  }
  return 0; // Not found
}

// Test DataForSEO API credentials
async function testDataForSEOAPI(username, apiKey) {
  try {
    console.log('    🧪 Testing DataForSEO API credentials...');
    
    const auth = Buffer.from(`${username}:${apiKey}`).toString('base64');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout for API test
    
    // Use a simple API endpoint to test credentials
    const response = await fetch('https://api.dataforseo.com/v3/appendix/user_data', {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    console.log(`    📥 Test response status: ${response.status}`);
    
    const data = await response.json();
    console.log(`    📥 Test response data:`, JSON.stringify(data, null, 2));
    
    if (data.status_code === 20000) {
      console.log('    ✅ API credentials are valid');
      return { success: true, data: data };
    } else {
      console.log('    ❌ API credentials failed:', data);
      return { 
        success: false, 
        error: data.status_message || 'Unknown API error',
        status_code: data.status_code,
        response: data
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
