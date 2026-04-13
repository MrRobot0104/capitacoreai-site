module.exports = async (req, res) => {
  const { applyRateLimit } = require('./_rateLimit');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (applyRateLimit(req, res, 'get-balance', 30, 60000)) return;

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.error('[SECURITY] Auth failure:', req.headers['x-forwarded-for'] || 'unknown');
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const token = authHeader.split(' ')[1];

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnon = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  // Verify user
  const userRes = await fetch(supabaseUrl + '/auth/v1/user', {
    headers: { 'Authorization': 'Bearer ' + token, 'apikey': supabaseAnon },
  });
  if (!userRes.ok) { console.error('[SECURITY] Auth failure:', req.headers['x-forwarded-for'] || 'unknown'); return res.status(401).json({ error: 'Invalid session' }); }
  const user = await userRes.json();

  // Get balance
  const balRes = await fetch(
    supabaseUrl + '/rest/v1/profiles?id=eq.' + user.id + '&select=token_balance',
    {
      headers: {
        'apikey': serviceKey,
        'Authorization': 'Bearer ' + serviceKey,
      },
    }
  );

  const profiles = await balRes.json();
  const balance = profiles[0]?.token_balance || 0;

  res.status(200).json({ balance });
};
