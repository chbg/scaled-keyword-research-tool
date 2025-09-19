const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  console.log('=== NETWORK TEST ===');
  
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
    // Test 1: Basic HTTP request to a simple service
    console.log('🧪 Test 1: Basic HTTP request to httpbin.org...');
    
    const controller1 = new AbortController();
    const timeoutId1 = setTimeout(() => controller1.abort(), 5000);
    
    try {
      const response1 = await fetch('https://httpbin.org/get', {
        method: 'GET',
        signal: controller1.signal
      });
      
      clearTimeout(timeoutId1);
      const data1 = await response1.json();
      
      console.log('✅ Test 1 passed:', response1.status);
      
      // Test 2: Try DataForSEO API with minimal request
      console.log('🧪 Test 2: DataForSEO API with minimal request...');
      
      const DATAFORSEO_USERNAME = process.env.DATAFORSEO_USERNAME;
      const DATAFORSEO_API_KEY = process.env.DATAFORSEO_API_KEY;
      
      if (!DATAFORSEO_USERNAME || !DATAFORSEO_API_KEY) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Missing API credentials',
            test1: 'PASSED',
            test2: 'FAILED - No credentials'
          })
        };
      }
      
      const auth = Buffer.from(`${DATAFORSEO_USERNAME}:${DATAFORSEO_API_KEY}`).toString('base64');
      const controller2 = new AbortController();
      const timeoutId2 = setTimeout(() => {
        console.log('⏰ DataForSEO API timeout after 5 seconds');
        controller2.abort();
      }, 5000);
      
      const startTime = Date.now();
      
      try {
        const response2 = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify([{
            keyword: 'test',
            location_name: 'United States',
            language_code: 'en',
            depth: 1  // Minimal depth
          }]),
          signal: controller2.signal
        });
        
        clearTimeout(timeoutId2);
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        console.log('✅ DataForSEO API responded in', duration, 'ms');
        console.log('📡 Response status:', response2.status);
        
        const responseText = await response2.text();
        console.log('📄 Response length:', responseText.length);
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            test1: 'PASSED - Basic HTTP works',
            test2: 'PASSED - DataForSEO API works',
            duration: duration,
            status: response2.status,
            responseLength: responseText.length
          })
        };
        
      } catch (fetchError) {
        clearTimeout(timeoutId2);
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        console.log('❌ DataForSEO API failed after', duration, 'ms:', fetchError.message);
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: false,
            test1: 'PASSED - Basic HTTP works',
            test2: 'FAILED - DataForSEO API failed',
            duration: duration,
            error: fetchError.message,
            name: fetchError.name
          })
        };
      }
      
    } catch (error1) {
      clearTimeout(timeoutId1);
      console.log('❌ Test 1 failed:', error1.message);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          test1: 'FAILED - Basic HTTP failed',
          test2: 'SKIPPED',
          error: error1.message
        })
      };
    }

  } catch (error) {
    console.error('❌ CRITICAL ERROR:', error);
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
