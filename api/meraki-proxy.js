// Meraki API Proxy — bypasses CORS by proxying requests through Vercel
// The user's Meraki API key is sent in the request body, never stored.

module.exports = async (req, res) => {
  const { applyRateLimit } = require('./_rateLimit');
  var allowedOrigins = ['https://capitacoreai.io', 'https://www.capitacoreai.io'];
  var origin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', allowedOrigins.includes(origin) ? origin : 'https://capitacoreai.io');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (applyRateLimit(req, res, 'meraki-proxy', 30, 60000)) return;

  try {
    // Auth: require logged-in user
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('[SECURITY] Auth failure:', req.headers['x-forwarded-for'] || 'unknown');
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const token = authHeader.split(' ')[1];
    const userRes = await fetch(process.env.SUPABASE_URL + '/auth/v1/user', {
      headers: { 'Authorization': 'Bearer ' + token, 'apikey': process.env.SUPABASE_ANON_KEY },
    });
    if (!userRes.ok) { console.error('[SECURITY] Auth failure:', req.headers['x-forwarded-for'] || 'unknown'); return res.status(401).json({ error: 'Invalid session' }); }

    const { merakiKey, method, path, body } = req.body;

    if (!merakiKey || !path) {
      return res.status(400).json({ error: 'Missing merakiKey or path' });
    }

    // Validate path — use URL parser to prevent traversal
    var cleanPath = path.replace(/\/\//g, '/');
    try {
      var targetUrl = new URL('https://api.meraki.com/api/v1' + cleanPath);
      if (targetUrl.hostname !== 'api.meraki.com') {
        console.error('[SECURITY] meraki-proxy: host mismatch:', targetUrl.hostname);
        return res.status(400).json({ error: 'Invalid API path' });
      }
      // Ensure the resolved path still starts with an allowed prefix
      var resolvedPath = targetUrl.pathname.replace('/api/v1', '');
      var allowedPrefixes = ['/organizations', '/networks', '/devices', '/appliance', '/switch', '/wireless', '/camera', '/insight', '/sm', '/sensor', '/cellularGateway', '/licensing', '/administered'];
      if (!resolvedPath.startsWith('/') || !allowedPrefixes.some(function(p) { return resolvedPath.startsWith(p); })) {
        console.error('[SECURITY] meraki-proxy: blocked path:', resolvedPath);
        return res.status(400).json({ error: 'Invalid API path' });
      }
      cleanPath = resolvedPath.split('?')[0];
    } catch (e) {
      return res.status(400).json({ error: 'Invalid API path' });
    }

    // Only allow safe HTTP methods
    const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE'];
    const safeMethod = (method || 'GET').toUpperCase();
    if (!allowedMethods.includes(safeMethod)) {
      return res.status(400).json({ error: 'Invalid method' });
    }

    const url = 'https://api.meraki.com/api/v1' + cleanPath;
    const fetchOptions = {
      method: safeMethod,
      headers: {
        'X-Cisco-Meraki-API-Key': merakiKey,
        'Content-Type': 'application/json',
      },
    };

    if (body && (safeMethod === 'POST' || safeMethod === 'PUT')) {
      fetchOptions.body = JSON.stringify(body);
    }

    fetchOptions.signal = AbortSignal.timeout(10000);
    const merakiRes = await fetch(url, fetchOptions);
    const responseText = await merakiRes.text();

    // Forward the status code and response
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      data = { _raw: responseText };
    }

    res.status(merakiRes.ok ? 200 : merakiRes.status).json(data);
  } catch (err) {
    console.error('Meraki proxy error:', err.message);
    res.status(500).json({ error: 'Proxy request failed: ' + err.message });
  }
};
