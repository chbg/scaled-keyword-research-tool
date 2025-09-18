exports.handler = async (event, context) => {
  console.log('=== DEBUG RESEARCH FUNCTION STARTED ===');
  
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

  try {
    const body = JSON.parse(event.body || '{}');
    const keyword = body.keyword?.trim() || 'test';

    console.log(`📝 INPUT: Keyword="${keyword}"`);

    // API Keys
    const DATAFORSEO_USERNAME = 'houston.barnettgearhart@gmail.com';
    const DATAFORSEO_API_KEY = '78ed0af9b3c7e819';

    // Test SERP data retrieval
    console.log('🔍 Testing SERP data retrieval...');
    const serpData = await getSerpData(keyword, DATAFORSEO_USERNAME, DATAFORSEO_API_KEY);
    
    console.log('📊 SERP Data Analysis:');
    console.log('- Has data:', !!serpData);
    console.log('- Has items:', !!(serpData?.items));
    console.log('- Items count:', serpData?.items?.length || 0);
    console.log('- Items type:', typeof serpData?.items);
    console.log('- First item:', serpData?.items?.[0]);
    
    if (serpData?.items && serpData.items.length > 0) {
      console.log('✅ SERP data looks good!');
      
      // Test organic results filtering
      const organicResults = serpData.items.filter(item => item.type === 'organic' && item.url);
      console.log(`- Organic results: ${organicResults.length}`);
      console.log('- First organic result:', organicResults[0]);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          keyword: keyword,
          serp_data: {
            has_data: !!serpData,
            has_items: !!(serpData?.items),
            items_count: serpData?.items?.length || 0,
            organic_count: organicResults.length,
            first_organic: organicResults[0] || null
          },
          raw_serp_data: serpData
        })
      };
    } else {
      console.log('❌ SERP data validation failed');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'SERP data validation failed',
          debug: {
            has_data: !!serpData,
            has_items: !!(serpData?.items),
            items_count: serpData?.items?.length || 0,
            serp_data: serpData
          }
        })
      };
    }

  } catch (error) {
    console.error('❌ Debug error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false,
        error: error.message,
        stack: error.stack
      })
    };
  }
};

async function getSerpData(keyword, username, apiKey) {
  try {
    console.log(`    🔍 Getting SERP data for: "${keyword}"`);
    
    const auth = Buffer.from(`${username}:${apiKey}`).toString('base64');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const requestBody = [{
      keyword: keyword,
      location_code: 2840,
      language_code: 'en'
    }];
    
    console.log(`    📤 Request body:`, JSON.stringify(requestBody, null, 2));
    
    const response = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
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
    
    const data = await response.json();
    console.log(`    📥 Response data keys:`, Object.keys(data));
    console.log(`    📥 Status code:`, data.status_code);
    console.log(`    📥 Tasks count:`, data.tasks?.length || 0);
    
    if (data.status_code === 20000 && data.tasks && data.tasks[0].result) {
      console.log(`    ✅ SERP data retrieved successfully`);
      const result = data.tasks[0].result[0];
      console.log(`    📊 Result keys:`, Object.keys(result));
      console.log(`    📊 Items count:`, result.items?.length || 0);
      return result;
    } else {
      console.log(`    ❌ SERP API error:`, {
        status_code: data.status_code,
        status_message: data.status_message,
        tasks: data.tasks ? data.tasks.length : 0,
        hasResult: data.tasks?.[0]?.result ? true : false
      });
      return null;
    }
  } catch (error) {
    console.error('    ❌ SERP API error:', error);
    return null;
  }
}
