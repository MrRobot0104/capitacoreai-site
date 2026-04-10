const { renderDashboard } = require('../dashboard-template.js');

const SYSTEM_PROMPT = `You are a data analyst. Given user data or a description, output a JSON dashboard configuration. Output ONLY valid JSON — no markdown, no backticks, no explanation.

JSON SCHEMA (follow exactly):
{
  "title": "Dashboard Title",
  "subtitle": "Brief description",
  "kpis": [
    { "label": "METRIC NAME", "value": "$1.2M", "change": "+12% vs prior" }
  ],
  "charts": [
    {
      "title": "Chart Title",
      "subtitle": "What this shows",
      "type": "bar",
      "labels": ["Label1", "Label2", "Label3"],
      "datasets": [
        { "label": "Series Name", "data": [100, 200, 300] }
      ]
    }
  ],
  "table": {
    "title": "Data Table",
    "headers": ["Col1", "Col2", "Col3"],
    "rows": [["val1", "val2", "val3"]]
  }
}

CHART TYPES: "bar", "horizontalBar", "line", "doughnut", "pie"

RULES:
- Output ONLY the JSON object. Nothing else.
- KPIs: 3-4 cards. Format values nicely ($1.2M, 48 units, 70.3%, etc.)
- Charts: 2-3 charts. Pick the best type for the data. ALWAYS include real numbers in data arrays.
- Table: Include ALL available data rows. Format monetary values with $ and commas.
- If user provides CSV/Excel data: CALCULATE real sums, averages, percentages from the data. Use actual values, never placeholder or zero values.
- For comparisons (list vs net price): use grouped bar chart with 2 datasets.
- For proportions (budget allocation): use doughnut chart.
- For rankings (discount by SKU): use horizontalBar chart.
- For trends over time: use line chart.
- Labels should be short (truncate long product names to ~20 chars).

WHEN USER ASKS FOR EDITS:
- The previous message contains the current dashboard JSON.
- Modify it according to the user's request and output the updated JSON.
- Always output the COMPLETE JSON, not a partial update.`;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
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
    if (!Array.isArray(history) || history.length === 0) {
      return res.status(400).json({ error: 'No conversation history.' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'AI not configured' });

    const messages = history.slice(-10).map(h => ({
      role: h.role === 'assistant' ? 'assistant' : 'user',
      content: typeof h.content === 'string' ? h.content.substring(0, 15000) : String(h.content).substring(0, 15000)
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
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: messages,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        const detail = data.error ? data.error.message : 'AI error';
        console.error('Claude API error:', response.status, JSON.stringify(data));
        return res.status(500).json({ error: 'Generation failed: ' + detail });
      }

      let jsonText = data.content[0].text;
      // Strip markdown fences
      jsonText = jsonText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

      let dashConfig;
      try {
        dashConfig = JSON.parse(jsonText);
      } catch (e) {
        console.error('JSON parse error:', e.message, '\nRaw:', jsonText.substring(0, 500));
        return res.status(500).json({ error: 'Failed to parse dashboard data. Please try again.' });
      }

      const html = renderDashboard(dashConfig);

      // Log usage
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
