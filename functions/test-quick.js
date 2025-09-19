const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  console.log('=== QUICK SERP TEST ===');
  
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
    const DATAFORSEO_USERNAME = process.env.DATAFORSEO_USERNAME;
    const DATAFORSEO_API_KEY = process.env.DATAFORSEO_API_KEY;

    console.log('🔑 API Keys:', {
      username: DATAFORSEO_USERNAME ? 'SET' : 'NOT SET',
      apiKey: DATAFORSEO_API_KEY ? 'SET' : 'NOT SET'
    });

    if (!DATAFORSEO_USERNAME || !DATAFORSEO_API_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Missing API credentials',
          username: DATAFORSEO_USERNAME ? 'SET' : 'NOT SET',
          apiKey: DATAFORSEO_API_KEY ? 'SET' : 'NOT SET'
        })
      };
    }

    // Test with a very short timeout to see if we get any response
    console.log('🧪 Testing DataForSEO SERP API with 3 second timeout...');
    
    const auth = Buffer.from(`${DATAFORSEO_USERNAME}:${DATAFORSEO_API_KEY}`).toString('base64');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log('⏰ Timeout reached, aborting request');
      controller.abort();
    }, 3000); // 3 second timeout
    
    const startTime = Date.now();
    
    try {
      const response = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([{
          keyword: 'seo',
          location_name: 'United States',
          language_code: 'en',
          depth: 10
        }]),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log('📡 Response received in', duration, 'ms');
      console.log('📡 Response status:', response.status);
      
      const responseText = await response.text();
      console.log('📄 Response text length:', responseText.length);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          duration: duration,
          status: response.status,
          responseLength: responseText.length,
          responsePreview: responseText.substring(0, 500)
        })
      };
      
    } catch (fetchError) {
      clearTimeout(timeoutId);
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log('❌ Fetch error after', duration, 'ms:', fetchError.message);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Fetch failed',
          duration: duration,
          message: fetchError.message,
          name: fetchError.name
        })
      };
    }

  } catch (error) {
    console.error('❌ ERROR:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Test failed',
        message: error.message,
        name: error.name
      })
    };
  }
};
