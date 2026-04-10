const EXTRACT_PROMPT = `You are a data extraction expert. Given CSV/Excel data, extract it into a structured JSON format. Output ONLY valid JSON.

Read the DATA SUMMARY (pre-computed stats) and RAW DATA carefully. Use the ACTUAL numbers.

{
  "title": "Descriptive Dashboard Title",
  "subtitle": "Metadata like quote IDs, dates, company name",
  "kpis": [
    {"label": "TOTAL LIST PRICE", "value": "$98,622", "change": "Across all line items"}
  ],
  "charts": [
    {
      "title": "Chart Title",
      "subtitle": "Description",
      "type": "bar",
      "labels": ["Item A", "Item B"],
      "datasets": [{"label": "Series", "data": [23500, 7050]}]
    }
  ],
  "table": {
    "title": "Detailed Line Items",
    "headers": ["Col1", "Col2"],
    "rows": [["val1", "val2"]]
  }
}

Chart types: bar, horizontalBar, line, doughnut, pie.
KPI values: Use pre-computed sums/averages. Format as $98.6K, 68.2%, 761 units.
Charts: Put REAL numbers in data arrays from the actual data.
Table: Include ALL rows.
Output ONLY JSON.`;

const DESIGN_PROMPT = `You are an elite dashboard designer. You receive a JSON data config and create a STUNNING, UNIQUE HTML dashboard.

IMPORTANT: The JSON below contains ALL the data — KPIs, chart configs, and table data. Your job is to make it BEAUTIFUL. Every value is already extracted — just embed them in your HTML.

OUTPUT: A single complete HTML file. No markdown. No backticks. Start with <!DOCTYPE html>.

Load in <head>:
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>

DESIGN FREEDOM: Make each dashboard UNIQUE. Be creative with:
- Layout variations (sidebar stats, full-width charts, card grids, split sections)
- Color themes (each dashboard should have its own personality)
- Custom SVG icons, gradient accents, glass-morphism effects
- Animated number counters, progress rings, sparklines
- Creative chart styling (gradient fills, custom tooltips, annotations)
- Professional typography hierarchy
- Creative section dividers, badges, tags

CHART.JS RULES:
- ALL chart code inside: window.addEventListener('load', function() { ... })
- Use the EXACT data values from the JSON config
- borderRadius on bars, tension on lines, custom colors

DATA RULES:
- The KPI values from the JSON go directly into the KPI cards
- The chart labels and datasets from JSON go directly into Chart.js configs
- The table headers and rows from JSON go directly into the HTML table
- DO NOT change, recalculate, or zero-out any values. Use them AS-IS.

Make this look like a $50,000 custom executive dashboard. Each one should be different.`;

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
      // ========= STEP 1: Extract data with Haiku (fast, cheap, accurate) =========
      const extractRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 4000,
          system: EXTRACT_PROMPT,
          messages: messages,
        }),
      });

      const extractData = await extractRes.json();
      if (!extractRes.ok) {
        console.error('Haiku error:', extractRes.status, JSON.stringify(extractData));
        return res.status(500).json({ error: 'Data extraction failed: ' + (extractData.error?.message || 'AI error') });
      }

      let jsonText = extractData.content[0].text;
      jsonText = jsonText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

      let dashConfig;
      try {
        dashConfig = JSON.parse(jsonText);
      } catch (e) {
        console.error('JSON parse error:', e.message, 'Raw:', jsonText.substring(0, 300));
        return res.status(500).json({ error: 'Data extraction returned invalid JSON. Try again.' });
      }

      // ========= STEP 2: Generate unique HTML with Sonnet (creative) =========
      const designRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 8000,
          system: DESIGN_PROMPT,
          messages: [{
            role: 'user',
            content: 'Here is the dashboard data config. Create a stunning, unique HTML dashboard using this exact data:\n\n' + JSON.stringify(dashConfig, null, 2) + '\n\nUser request: ' + (messages[messages.length - 1]?.content || '').substring(0, 500)
          }],
        }),
      });

      const designData = await designRes.json();
      if (!designRes.ok) {
        console.error('Sonnet error:', designRes.status, JSON.stringify(designData));
        return res.status(500).json({ error: 'Design generation failed: ' + (designData.error?.message || 'AI error') });
      }

      let html = designData.content[0].text;
      html = html.replace(/^```(?:html)?\s*\n/i, '').replace(/\n```\s*$/i, '').trim();
      if (!html.includes('</html>')) html += '\n</body></html>';

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
