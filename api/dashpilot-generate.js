const EXTRACT_PROMPT = `You are a data extraction expert. You MUST output ONLY a valid JSON object — no text before or after, no markdown, no explanation.

If the user provides CSV/Excel data, read the DATA SUMMARY and RAW DATA and use the ACTUAL numbers.
If the user describes a dashboard without data, generate realistic sample data that matches their description.
If the user asks to modify the previous dashboard, keep the previous config and apply only the requested changes.

Output this exact JSON structure:
{"title":"Dashboard Title","subtitle":"Description","badges":[{"text":"Q1 2026","color":"blue"}],"kpis":[{"label":"REVENUE","value":"$98.6K","change":"+12%","subtitle":"vs last quarter"}],"charts":[{"title":"Revenue by Month","subtitle":"Last 6 months","type":"bar","labels":["Jan","Feb","Mar"],"datasets":[{"label":"Revenue","data":[45000,52000,61000]}]}],"table":{"title":"Detailed Breakdown","headers":["Product","Revenue","Growth"],"rows":[["Widget A","$45K","+8%"],["Widget B","$32K","+15%"]]}}

Rules:
- Chart types: bar, horizontalBar, line, doughnut, pie
- KPI values: Use pre-computed sums/averages from data. Format as $98.6K, 68.2%, 761 units
- Charts: Put REAL numbers from the data in arrays. Create 2-4 meaningful charts
- Table: Include ALL data rows from the source data
- Badges: Add contextual badges like dates, company names, status (colors: green, blue, amber)
- KPIs: Create 3-5 key metrics. Include change values like "+12%" or "-3%"

CRITICAL: Your entire response must be a single JSON object. Start with { and end with }.`;

const DESIGN_PROMPT = `You create beautiful, production-ready HTML dashboards. Output a COMPLETE, working HTML file. No markdown. No backticks. Start with <!DOCTYPE html>.

REQUIRED IN <head>:
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>

REQUIRED CSS RULES (include these exactly, then add your creative styles on top):
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Inter',system-ui,sans-serif; -webkit-font-smoothing:antialiased; }
.chart-container { position:relative; height:280px; }
table { width:100%; border-collapse:collapse; }
@media(max-width:768px) { .grid-2,.grid-3 { grid-template-columns:1fr !important; } }

STRUCTURE — build the dashboard with these sections in order:
1. HEADER — title, subtitle, optional badges/metadata
2. KPI CARDS — grid of 3-5 metric cards showing key numbers
3. CHARTS — 2-4 Chart.js charts in a responsive grid
4. DATA TABLE — sortable-looking table with all rows
5. FOOTER — "Built with DashPilot by CapitaCoreAI"

CHART.JS — THIS IS CRITICAL, follow exactly:
- Wrap ALL Chart.js code in: window.addEventListener('load', function() { ... });
- Each chart canvas needs a UNIQUE id (chart0, chart1, chart2, etc.)
- Use this exact pattern for each chart:
  new Chart(document.getElementById('chart0'), {
    type: 'bar',
    data: { labels: [...], datasets: [{ label: '...', data: [...], backgroundColor: '...', borderRadius: 8 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
  });
- For line charts: add tension: 0.4, fill: true, pointRadius: 4
- For pie/doughnut: use backgroundColor array matching the number of labels
- NEVER use ctx.createLinearGradient — just use solid hex colors
- NEVER define Chart plugins or custom scales

DESIGN — vary these elements creatively each time:
- Color palette: pick a cohesive 4-5 color palette (not always blue)
- Background: light (#f5f5f5), dark (#0f172a), or gradient
- KPI card style: colored top borders, icon accents, subtle shadows
- Layout: vary between 2-col and 3-col grids for charts
- Typography: vary heading sizes and weights
- Accents: gradient header bars, colored badges, trend arrows on KPIs

DATA RULES:
- Use the EXACT values from the JSON — never zero out or change numbers
- KPI values go directly into the HTML text
- Chart data arrays come directly from the JSON datasets
- Table rows come directly from the JSON table.rows

Keep the HTML compact. Do NOT add comments. Do NOT add JavaScript beyond Chart.js initialization.`;

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
      // Safe JSON parser — handles text error responses from API
      async function safeJson(response, label) {
        const text = await response.text();
        try { return JSON.parse(text); }
        catch (e) {
          console.error(label + ' returned non-JSON:', text.substring(0, 200));
          return null;
        }
      }

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

      const extractData = await safeJson(extractRes, 'Haiku');
      if (!extractData) return res.status(500).json({ error: 'AI service temporarily unavailable. Please try again.' });
      if (!extractRes.ok) {
        console.error('Haiku error:', extractRes.status);
        return res.status(500).json({ error: 'Data extraction failed: ' + (extractData.error?.message || 'AI error') });
      }

      let jsonText = extractData.content[0].text;
      jsonText = jsonText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

      let dashConfig;
      try {
        dashConfig = JSON.parse(jsonText);
      } catch (e) {
        // Try to extract JSON object from surrounding text
        var jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            dashConfig = JSON.parse(jsonMatch[0]);
          } catch (e2) {
            console.error('JSON parse error:', e2.message, 'Raw:', jsonText.substring(0, 500));
            return res.status(500).json({ error: 'Data extraction returned invalid format. Try again.' });
          }
        } else {
          console.error('No JSON found in response. Raw:', jsonText.substring(0, 500));
          return res.status(500).json({ error: 'Data extraction returned invalid format. Try again.' });
        }
      }

      // ========= STEP 2: Generate HTML dashboard with Sonnet =========
      const userRequest = (messages[messages.length - 1]?.content || '').substring(0, 1000);

      const designRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 12000,
          system: DESIGN_PROMPT,
          messages: [{
            role: 'user',
            content: 'Create a dashboard from this data. Output ONLY the HTML file, starting with <!DOCTYPE html>.\n\n' + JSON.stringify(dashConfig, null, 2)
          }],
        }),
      });

      const designData = await safeJson(designRes, 'Sonnet');
      if (!designData) return res.status(500).json({ error: 'AI service temporarily unavailable. Please try again.' });
      if (!designRes.ok) {
        console.error('Sonnet error:', designRes.status, JSON.stringify(designData).substring(0, 300));
        return res.status(500).json({ error: 'Design generation failed: ' + (designData.error?.message || 'AI error') });
      }

      const textBlocks = designData.content.filter(b => b.type === 'text');
      let html = textBlocks.map(b => b.text).join('');
      html = html.replace(/^```(?:html)?\s*\n/i, '').replace(/\n```\s*$/i, '').trim();
      if (!html.includes('</html>')) html += '\n</body></html>';

      // Log usage
      await fetch(supabaseUrl + '/rest/v1/usage_log', {
        method: 'POST',
        headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ user_id: user.id, prompt: userRequest.substring(0, 500) }),
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
