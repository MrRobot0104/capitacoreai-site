const crypto = require('crypto');

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifySignature(payload, signature, secret) {
  try {
    const elements = signature.split(',');
    const timestamp = elements.find(e => e.startsWith('t=')).split('=')[1];
    const expectedSig = elements.find(e => e.startsWith('v1=')).split('=')[1];
    const signedPayload = timestamp + '.' + payload.toString('utf8');
    const computed = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expectedSig, 'hex'), Buffer.from(computed, 'hex'));
  } catch (e) {
    return false;
  }
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  // Verify webhook signature if secret is configured
  if (webhookSecret && sig) {
    if (!verifySignature(rawBody, sig, webhookSecret)) {
      console.error('Webhook signature verification failed');
      return res.status(400).json({ error: 'Invalid signature' });
    }
  }

  const event = JSON.parse(rawBody.toString('utf8'));

  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true });
  }

  const session = event.data.object;
  const userId = session.metadata?.user_id || session.client_reference_id;
  const tokens = parseInt(session.metadata?.tokens || '0', 10);
  const pkg = session.metadata?.package || 'unknown';

  if (!userId || tokens <= 0) {
    console.error('Missing user_id or tokens in webhook metadata');
    return res.status(400).json({ error: 'Missing metadata' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('Supabase not configured');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  try {
    // Credit tokens via RPC function
    const creditRes = await fetch(supabaseUrl + '/rest/v1/rpc/credit_tokens', {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': 'Bearer ' + serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_uuid: userId, amount: tokens }),
    });

    if (!creditRes.ok) {
      const err = await creditRes.text();
      console.error('Failed to credit tokens:', err);
      return res.status(500).json({ error: 'Failed to credit tokens' });
    }

    // Log transaction
    await fetch(supabaseUrl + '/rest/v1/transactions', {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': 'Bearer ' + serviceKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        user_id: userId,
        package: pkg,
        tokens_purchased: tokens,
        amount_cents: session.amount_total,
        stripe_session_id: session.id,
      }),
    });

    res.status(200).json({ received: true, tokens_credited: tokens });
  } catch (err) {
    console.error('Webhook processing error:', err.message);
    res.status(500).json({ error: 'Processing failed' });
  }
}

module.exports = handler;

module.exports.config = {
  api: { bodyParser: false },
};
