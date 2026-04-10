const { renderDashboard } = require('../dashboard-template.js');

const SYSTEM_PROMPT = `You are a data analyst. You receive data and output a JSON dashboard config. Output ONLY valid JSON.

CRITICAL: The user's message contains a DATA SUMMARY with pre-computed sums, averages, etc. USE THOSE EXACT NUMBERS in the KPI values. DO NOT output zeros or placeholders.

JSON SCHEMA:
{
  "title": "Dashboard Title",
  "subtitle": "Quote #123 · Deal ID 456 · Date",
  "badges": [{"text": "Status: Approved", "color": "green"}, {"text": "Currency: USD", "color": "blue"}],
  "kpis": [
    {"label": "TOTAL LIST PRICE", "value": "$98,622", "change": "+15% vs benchmark", "subtitle": "Sum of all line items"}
  ],
  "charts": [
    {
      "title": "Chart Title",
      "subtitle": "What this shows",
      "type": "bar",
      "labels": ["Item A", "Item B"],
      "datasets": [{"label": "Series", "data": [23500, 7050]}]
    }
  ],
  "table": {
    "title": "Line Items Detail",
    "headers": ["SKU", "Description", "Qty", "List Price", "Net Price", "Discount"],
    "rows": [["C9350-48HX", "Catalyst Switch", "48", "$23,500", "$7,050", "70%"]]
  }
}

RULES:
1. KPI values: Use the pre-computed sums/averages from DATA SUMMARY. Format nicely ($98.6K, 68.2%, 761 units).
2. Charts: ALWAYS put real numbers in data arrays. Get them from the DATA SUMMARY and RAW DATA.
   - "bar": comparisons (e.g. list vs net price per SKU — use 2 datasets)
   - "horizontalBar": rankings (e.g. discount rate by SKU)
   - "doughnut": proportions (e.g. spend by category)
   - "line": trends over time
3. Table: Include ALL data rows from the raw data. Format $ values and percentages.
4. 3-5 KPIs, 2-3 charts, full table.
5. Output ONLY the JSON object. No markdown. No backticks. No explanation.`;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated' });
  const token = authHeader.split(' ')[1];
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnon = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  const userRes = await fetch(supabaseUrl + '/auth/v1/user', {
    headers: { 'Authorization': 'Bearer ' + token, 'apikey': supabaseAnon },
  });
  if (!userRes.ok) return res.status(401).json({ error: 'Invalid session' });
  const user = await userRes.json();

  const adminCheck = await fetch(
    supabaseUrl + '/rest/v1/profiles?id=eq.' + user.id + '&select=is_admin',
    { headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey } }
  );
  const adminData = await adminCheck.json();
  const isAdmin = adminData[0]?.is_admin === true;

  const { action, history } = req.body;

  if (action === 'start_conversation') {
    if (isAdmin) return res.status(200).json({ ok: true, remaining: 9999 });
    const deductRes = await fetch(supabaseUrl + '/rest/v1/rpc/deduct_token', {
      method: 'POST',
      headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_uuid: user.id }),
    });
    if (!deductRes.ok) return res.status(500).json({ error: 'Failed to check credits' });
    const newBalance = await deductRes.json();
    if (newBalance === -1) return res.status(402).json({ error: 'No credits remaining.' });
    return res.status(200).json({ ok: true, remaining: newBalance });
  }

  if (action === 'generate') {
    if (!Array.isArray(history) || history.length === 0) return res.status(400).json({ error: 'No conversation history.' });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'AI not configured' });

    const messages = history.slice(-10).map(h => ({
      role: h.role === 'assistant' ? 'assistant' : 'user',
      content: typeof h.content === 'string' ? h.content.substring(0, 20000) : String(h.content).substring(0, 20000)
    }));

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 6000,
          system: SYSTEM_PROMPT,
          messages: messages,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        console.error('Claude API error:', response.status, JSON.stringify(data));
        return res.status(500).json({ error: 'Generation failed: ' + (data.error?.message || 'AI error') });
      }

      let jsonText = data.content[0].text;
      jsonText = jsonText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

      let dashConfig;
      try {
        dashConfig = JSON.parse(jsonText);
      } catch (e) {
        console.error('JSON parse error:', e.message, 'Raw:', jsonText.substring(0, 500));
        return res.status(500).json({ error: 'Failed to parse dashboard config. Trying again may help.' });
      }

      const html = renderDashboard(dashConfig);

      await fetch(supabaseUrl + '/rest/v1/usage_log', {
        method: 'POST',
        headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ user_id: user.id, prompt: (messages[messages.length - 1]?.content || '').substring(0, 500) }),
      });

      res.status(200).json({ html, config: dashConfig });
    } catch (err) {
      console.error('Generate error:', err.message);
      res.status(500).json({ error: 'Generation failed: ' + err.message });
    }
    return;
  }

  res.status(400).json({ error: 'Invalid action' });
};
