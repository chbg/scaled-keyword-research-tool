exports.handler = async (event, context) => {
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      success: true,
      message: 'Simple test function working!',
      timestamp: new Date().toISOString(),
      environment: {
        DATAFORSEO_USERNAME: process.env.DATAFORSEO_USERNAME ? 'Set' : 'Missing',
        DATAFORSEO_API_KEY: process.env.DATAFORSEO_API_KEY ? 'Set' : 'Missing'
      }
    })
  };
};
