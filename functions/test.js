exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      message: 'Function is working!',
      timestamp: new Date().toISOString(),
      environment: {
        DATAFORSEO_USERNAME: process.env.DATAFORSEO_USERNAME ? 'Set' : 'Missing',
        DATAFORSEO_API_KEY: process.env.DATAFORSEO_API_KEY ? 'Set' : 'Missing',
        OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'Set' : 'Missing'
      }
    })
  };
};
