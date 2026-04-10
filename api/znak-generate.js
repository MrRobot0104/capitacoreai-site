const SYSTEM_PROMPT = `You are a premium dashboard generator for CapitaCoreAI. Given a user's idea, generate a stunning, production-ready HTML dashboard.

CRITICAL RULES:
- Output ONLY raw HTML. No markdown, no backticks, no explanation text.
- Start with <!DOCTYPE html> and include a complete, self-contained page.
- Load Inter font via: <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
- All styles must be inline in a <style> tag. No other external dependencies.

DESIGN SYSTEM:
- Font: 'Inter', system-ui, sans-serif
- Background: #f8fafc (page), #ffffff (cards)
- Text: #0a1628 (headings), #374151 (body), #6b7280 (secondary)
- Accent: #2563eb (primary blue), #10b981 (green/positive), #f59e0b (amber/warning), #ef4444 (red/negative)
- Borders: #e5e7eb, border-radius: 12px for cards
- Shadows: box-shadow: 0 1px 3px rgba(0,0,0,0.08)
- Spacing: generous padding (24px cards, 32px page margins)
- Max width: 1100px centered container

LAYOUT:
- Header bar with dashboard title and subtitle
- KPI row: 3-4 stat cards with large numbers, labels, +/- change indicators
- Main content: tables, lists, or grids with realistic sample data
- Colored status badges (pills with border-radius: 999px)
- Progress bars where relevant (8px height, rounded)
- Responsive (single column on mobile via @media max-width: 768px)
- Minimum 5 data rows in any table

QUALITY:
- Must look like a real SaaS product
- Realistic, contextual sample data
- Add "Built with znak by CapitaCoreAI" footer in #9ca3af`;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verify auth
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
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
  if (!userRes.ok) return res.status(401).json({ error: 'Invalid session' });
  const user = await userRes.json();

  // Deduct token (atomic)
  const deductRes = await fetch(supabaseUrl + '/rest/v1/rpc/deduct_token', {
    method: 'POST',
    headers: {
      'apikey': serviceKey,
      'Authorization': 'Bearer ' + serviceKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ user_uuid: user.id }),
  });

  if (!deductRes.ok) {
    return res.status(500).json({ error: 'Failed to check credits' });
  }

  const newBalance = await deductRes.json();
  if (newBalance === -1) {
    return res.status(402).json({ error: 'No dashboard credits remaining. Purchase more at /znak.html' });
  }

  // Generate dashboard
  const { prompt } = req.body;
  if (!prompt || prompt.trim().length < 10) {
    return res.status(400).json({ error: 'Please provide a dashboard description.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'AI service not configured' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: 'Build a dashboard for: ' + prompt.trim() }],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      const detail = data.error ? data.error.message : 'AI error';
      return res.status(500).json({ error: 'Generation failed: ' + detail });
    }

    let html = data.content[0].text;
    html = html.replace(/^```(?:html)?\s*\n/i, '').replace(/\n```\s*$/i, '').trim();
    if (!html.includes('</html>')) html += '\n</body></html>';

    // Log usage
    await fetch(supabaseUrl + '/rest/v1/usage_log', {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': 'Bearer ' + serviceKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ user_id: user.id, prompt: prompt.trim().substring(0, 500) }),
    });

    res.status(200).json({ html, remaining: newBalance });
  } catch (err) {
    console.error('Generate error:', err.message);
    res.status(500).json({ error: 'Generation failed: ' + err.message });
  }
};
