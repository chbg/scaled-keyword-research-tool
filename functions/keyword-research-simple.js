const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  console.log('=== SIMPLE KEYWORD RESEARCH FUNCTION ===');
  
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
    const keyword = body.keyword?.trim() || '';
    const maxSupportingKeywords = body.max_supporting_keywords || 4;

    console.log(`Input: ${keyword}, Max: ${maxSupportingKeywords}`);

    if (!keyword) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Keyword is required' })
      };
    }

    // Get environment variables
    const DATAFORSEO_USERNAME = process.env.DATAFORSEO_USERNAME;
    const DATAFORSEO_API_KEY = process.env.DATAFORSEO_API_KEY;

    console.log(`Username: ${DATAFORSEO_USERNAME ? 'Set' : 'Missing'}`);
    console.log(`API Key: ${DATAFORSEO_API_KEY ? 'Set' : 'Missing'}`);

    if (!DATAFORSEO_USERNAME || !DATAFORSEO_API_KEY) {
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

    // Simple test - just return the input for now
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Function is working!',
        input_keyword: keyword,
        max_supporting_keywords: maxSupportingKeywords,
        environment_check: {
          DATAFORSEO_USERNAME: DATAFORSEO_USERNAME ? 'Set' : 'Missing',
          DATAFORSEO_API_KEY: DATAFORSEO_API_KEY ? 'Set' : 'Missing'
        },
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};
