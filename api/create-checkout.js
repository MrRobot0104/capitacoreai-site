const PACKAGES = {
  starter:    { name: 'CapitaCoreAI — Starter (10 Credits)',     tokens: 10,  price: 1999 },
  growth:     { name: 'CapitaCoreAI — Growth (30 Credits)',      tokens: 30,  price: 4999 },
  pro:        { name: 'CapitaCoreAI — Pro (75 Credits)',         tokens: 75,  price: 9999 },
  enterprise: { name: 'CapitaCoreAI — Enterprise (200 Credits)', tokens: 200, price: 24999 },
};

module.exports = async (req, res) => {
  const { applyRateLimit } = require('./_rateLimit');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (applyRateLimit(req, res, 'checkout', 10, 60000)) return;

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const token = authHeader.split(' ')[1];

    // Verify user via Supabase
    const userRes = await fetch(process.env.SUPABASE_URL + '/auth/v1/user', {
      headers: {
        'Authorization': 'Bearer ' + token,
        'apikey': process.env.SUPABASE_ANON_KEY,
      },
    });
    if (!userRes.ok) return res.status(401).json({ error: 'Invalid session. Please log out and log back in.' });
    const user = await userRes.json();

    const { package: pkg } = req.body;
    const plan = PACKAGES[pkg];
    if (!plan) return res.status(400).json({ error: 'Invalid package' });

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) return res.status(500).json({ error: 'Stripe not configured' });

    const params = new URLSearchParams();
    params.append('payment_method_types[]', 'card');
    params.append('mode', 'payment');
    params.append('client_reference_id', user.id);
    params.append('customer_email', user.email);
    params.append('metadata[package]', pkg);
    params.append('metadata[tokens]', plan.tokens.toString());
    params.append('metadata[user_id]', user.id);
    params.append('line_items[0][price_data][currency]', 'usd');
    params.append('line_items[0][price_data][product_data][name]', plan.name);
    params.append('line_items[0][price_data][unit_amount]', plan.price.toString());
    params.append('line_items[0][quantity]', '1');
    params.append('success_url', (req.headers.origin || 'https://capitacoreai.io') + '/pricing.html?payment=success');
    params.append('cancel_url', (req.headers.origin || 'https://capitacoreai.io') + '/pricing.html?payment=cancelled');

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(stripeKey + ':').toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const session = await stripeRes.json();
    if (!stripeRes.ok) {
      console.error('Stripe error:', JSON.stringify(session));
      return res.status(500).json({ error: 'Failed to create checkout: ' + (session.error?.message || 'Unknown') });
    }

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err.message);
    res.status(500).json({ error: 'Checkout failed: ' + err.message });
  }
};
