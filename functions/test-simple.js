const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  console.log('=== SIMPLE SERP TEST ===');
  
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

    // Test with a very simple request
    console.log('🧪 Testing DataForSEO SERP API...');
    
    const auth = Buffer.from(`${DATAFORSEO_USERNAME}:${DATAFORSEO_API_KEY}`).toString('base64');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
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
    
    console.log('📡 Response status:', response.status);
    
    const responseText = await response.text();
    console.log('📄 Response text length:', responseText.length);
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Failed to parse JSON response',
          responseText: responseText.substring(0, 1000),
          status: response.status
        })
      };
    }
    
    console.log('📊 Response status_code:', data.status_code);
    console.log('📊 Has tasks:', !!data.tasks);
    
    if (data.tasks && data.tasks[0]) {
      const task = data.tasks[0];
      console.log('📊 Task status_code:', task.status_code);
      console.log('📊 Has result:', !!task.result);
      
      if (task.result && task.result[0]) {
        const result = task.result[0];
        console.log('📊 Result keys:', Object.keys(result));
        console.log('📊 Has items:', !!result.items);
        console.log('📊 Items count:', result.items ? result.items.length : 0);
        
        if (result.items && result.items.length > 0) {
          const organicItems = result.items.filter(item => item.type === 'organic');
          console.log('📊 Organic items count:', organicItems.length);
          
          if (organicItems.length > 0) {
            console.log('📊 First organic item:', {
              type: organicItems[0].type,
              url: organicItems[0].url,
              title: organicItems[0].title
            });
          }
        }
      }
    }
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        status: response.status,
        data: {
          status_code: data.status_code,
          has_tasks: !!data.tasks,
          task_status: data.tasks && data.tasks[0] ? data.tasks[0].status_code : null,
          has_result: data.tasks && data.tasks[0] && data.tasks[0].result,
          items_count: data.tasks && data.tasks[0] && data.tasks[0].result && data.tasks[0].result[0] ? data.tasks[0].result[0].items.length : 0,
          organic_count: data.tasks && data.tasks[0] && data.tasks[0].result && data.tasks[0].result[0] ? data.tasks[0].result[0].items.filter(item => item.type === 'organic').length : 0
        },
        responseLength: responseText.length
      })
    };

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
