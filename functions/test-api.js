const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  try {
    const DATAFORSEO_USERNAME = process.env.DATAFORSEO_USERNAME;
    const DATAFORSEO_API_KEY = process.env.DATAFORSEO_API_KEY;

    console.log('Testing DataForSEO API...');
    console.log('Username:', DATAFORSEO_USERNAME ? 'Set' : 'Missing');
    console.log('API Key:', DATAFORSEO_API_KEY ? 'Set' : 'Missing');

    if (!DATAFORSEO_USERNAME || !DATAFORSEO_API_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Missing credentials' })
      };
    }

    const auth = Buffer.from(`${DATAFORSEO_USERNAME}:${DATAFORSEO_API_KEY}`).toString('base64');
    
    console.log('Making API call...');
    const startTime = Date.now();
    
    const response = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([{
        keyword: 'programmatic seo',
        location_name: 'United States',
        language_code: 'en',
        depth: 10
      }])
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`API call took ${duration}ms`);
    console.log('Response status:', response.status);
    console.log('Response ok:', response.ok);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('Error response:', errorText);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'API call failed',
          status: response.status,
          statusText: response.statusText,
          duration: duration,
          response: errorText
        })
      };
    }
    
    const data = await response.json();
    console.log('API response received');
    console.log('Status code:', data.status_code);
    console.log('Tasks count:', data.tasks ? data.tasks.length : 0);
    
    if (data.tasks && data.tasks[0]) {
      const task = data.tasks[0];
      console.log('Task status:', task.status_code);
      console.log('Task message:', task.status_message);
      
      if (task.result && task.result[0]) {
        const items = task.result[0].items || [];
        console.log('Items count:', items.length);
        
        const organicItems = items.filter(item => item.type === 'organic');
        console.log('Organic items count:', organicItems.length);
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            duration: duration,
            status_code: data.status_code,
            task_status: task.status_code,
            total_items: items.length,
            organic_items: organicItems.length,
            urls: organicItems.slice(0, 5).map(item => item.url)
          })
        };
      }
    }
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        duration: duration,
        data: data
      })
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Test failed',
        message: error.message,
        stack: error.stack
      })
    };
  }
};