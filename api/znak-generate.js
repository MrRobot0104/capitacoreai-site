const SYSTEM_PROMPT = `You are znak — an elite data visualization AI. Your #1 priority is DATA ACCURACY. Your #2 priority is stunning design.

STEP 1 — READ THE DATA FIRST:
Before writing ANY HTML, carefully read the user's data. The message will contain:
- A DATA SUMMARY section with pre-computed sums, averages, min, max for each numeric column
- Raw JSON data rows
USE THESE EXACT NUMBERS. Copy them directly into your KPIs, chart data arrays, and tables. NEVER use 0, placeholder, or made-up values.

STEP 2 — OUTPUT:
A single complete HTML file. No markdown. No backticks. No explanation. Start with <!DOCTYPE html>.

Load in <head>:
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>

DESIGN:
- Executive-grade, like a McKinsey or Bain deliverable
- Font: Inter. Background: #f8f9fb. Cards: white with subtle shadow
- Colors: #2563eb (blue), #0891b2 (teal), #7c3aed (purple), #059669 (green), #dc2626 (red)
- Rounded cards (14px), gradient accent bars on KPIs, smooth animations

STRUCTURE:
1. HEADER with title + metadata
2. KPI CARDS (3-5) — the pre-computed sum/avg values go HERE. Large bold numbers. Include change indicators.
3. CHARTS (2-4) — Chart.js with REAL DATA from the dataset:
   - ALL chart code MUST be inside: window.addEventListener('load', function() { ... })
   - data arrays MUST contain actual numbers like: data: [23500, 1800, 950, 4200]
   - NEVER: data: [] or data: [0, 0, 0]
   - Bar charts for comparisons, horizontal bars for rankings, doughnut for proportions, line for trends
   - borderRadius: 6 on bars, tension: 0.4 on lines
4. DATA TABLE with ALL rows from the dataset. Bold monetary values. Colored percentage badges.
5. FOOTER: "Built with znak by CapitaCoreAI"

ANIMATIONS: fadeUp on cards (staggered), Chart.js easing, hover lift+shadow on cards.

WHEN USER ASKS FOR EDITS:
Regenerate the ENTIRE HTML page with changes applied. Always output a complete file.`;

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
          max_tokens: 8000,
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

      let html = data.content[0].text;
      html = html.replace(/^```(?:html)?\s*\n/i, '').replace(/\n```\s*$/i, '').trim();
      if (!html.includes('</html>')) html += '\n</body></html>';

      // Log usage
      await fetch(supabaseUrl + '/rest/v1/usage_log', {
        method: 'POST',
        headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ user_id: user.id, prompt: (messages[messages.length - 1]?.content || '').substring(0, 500) }),
      });

      res.status(200).json({ html });
    } catch (err) {
      console.error('Generate error:', err.message);
      res.status(500).json({ error: 'Generation failed: ' + err.message });
    }
    return;
  }

  res.status(400).json({ error: 'Invalid action' });
};
