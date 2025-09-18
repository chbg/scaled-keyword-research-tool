exports.handler = async (event, context) => {
  console.log('=== API TEST FUNCTION STARTED ===');
  
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
    // API Keys
    const DATAFORSEO_USERNAME = 'houston.barnettgearhart@gmail.com';
    const DATAFORSEO_API_KEY = '78ed0af9b3c7e819';

    console.log(`🔑 Testing API with credentials: ${DATAFORSEO_USERNAME}`);

    // Test 1: Check user data
    console.log('🧪 Test 1: Checking user data...');
    const userData = await testUserData(DATAFORSEO_USERNAME, DATAFORSEO_API_KEY);
    
    // Test 2: Try a simple SERP request
    console.log('🧪 Test 2: Testing SERP API...');
    const serpTest = await testSerpAPI(DATAFORSEO_USERNAME, DATAFORSEO_API_KEY);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        tests: {
          user_data: userData,
          serp_api: serpTest
        },
        credentials: {
          username: DATAFORSEO_USERNAME,
          api_key_set: !!DATAFORSEO_API_KEY
        }
      })
    };

  } catch (error) {
    console.error('❌ Test error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: error.message,
        success: false
      })
    };
  }
};

async function testUserData(username, apiKey) {
  try {
    const auth = Buffer.from(`${username}:${apiKey}`).toString('base64');
    
    const response = await fetch('https://api.dataforseo.com/v3/appendix/user_data', {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    return {
      success: response.ok,
      status: response.status,
      status_code: data.status_code,
      message: data.status_message,
      data: data
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function testSerpAPI(username, apiKey) {
  try {
    const auth = Buffer.from(`${username}:${apiKey}`).toString('base64');
    
    const requestBody = [{
      keyword: 'test',
      location_code: 2840,
      language_code: 'en'
    }];
    
    const response = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    const data = await response.json();
    
    return {
      success: response.ok,
      status: response.status,
      status_code: data.status_code,
      message: data.status_message,
      has_tasks: !!data.tasks,
      tasks_count: data.tasks ? data.tasks.length : 0,
      has_result: !!(data.tasks && data.tasks[0] && data.tasks[0].result),
      data: data
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
