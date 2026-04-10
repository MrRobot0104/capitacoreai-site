const SYSTEM_PROMPT = `You are znak, a world-class AI dashboard builder. You create stunning, data-rich, interactive HTML dashboards that look like professional SaaS products.

CRITICAL OUTPUT RULES:
- Output ONLY the raw HTML. No markdown. No backticks. No explanation. No text before or after.
- Start with <!DOCTYPE html>. Complete, self-contained page.
- CDN in <head>:
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>

DESIGN:
- Font: 'Inter', system-ui, sans-serif
- Page bg: #f5f5f5, Cards: #ffffff, Headings: #111111, Body: #555555, Muted: #999999
- Borders: #e0e0e0, radius: 12px, Shadow: 0 1px 3px rgba(0,0,0,0.08)
- Chart colors: ['#111111','#555555','#999999','#cccccc','#10b981','#f59e0b','#ef4444','#3b82f6']
- Generous padding (24px cards, 32px page). Max-width 1200px centered.

DASHBOARD STRUCTURE (follow this exactly):
1. HEADER: Title + subtitle describing the data
2. KPI ROW: 3-4 stat cards in a grid. Each has: large number (font-size:28px, font-weight:700), label above (11px uppercase), and a colored +/-% change indicator
3. CHARTS SECTION: 2-3 Chart.js charts in a grid. EVERY chart MUST have real data values in its datasets array. NEVER leave datasets empty. Each chart wrapped in a card with a title and a <div style="height:320px"><canvas id="uniqueId"></canvas></div>
4. DATA TABLE: Full HTML table with all available data rows. Styled with alternating row colors, hover states, and status badges where appropriate.
5. FOOTER: "Built with znak by CapitaCoreAI" in #aaaaaa, centered, small text

CHART.JS REQUIREMENTS (critical — charts must render):
- ALL Chart.js code goes in ONE <script> tag at the very end of <body>
- Each chart: new Chart(document.getElementById('chartId'), { type: '...', data: { labels: [...], datasets: [{ data: [...], ... }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } })
- ALWAYS populate labels[] and data[] arrays with REAL numbers from the user's data
- Use backgroundColor arrays for pie/doughnut charts
- NEVER reference undefined variables. All data must be inline in the chart config.
- Chart types: bar (comparisons), line (trends over time), doughnut (proportions), horizontalBar via indexAxis:'y'

WHEN USER PROVIDES DATA (CSV/Excel):
- This is the most important part. PARSE the data and USE IT.
- Calculate real KPIs: sums, averages, counts, min, max from the actual numbers
- Populate chart labels and data arrays with actual values from the data
- Group/aggregate data for charts (e.g., sum by category, count by status)
- Show the full data in the table section
- If there are monetary values, format them with $ and commas
- If there are dates, use them as chart labels for time series
- If there are categories, use them for bar/pie charts

WHEN USER ASKS FOR EDITS:
- The previous assistant message contains a summary of the current dashboard
- Apply the requested changes and regenerate the ENTIRE HTML page
- Keep all existing charts/tables and add/modify as requested
- Never output partial snippets — always a complete <!DOCTYPE html> page

QUALITY STANDARD:
- This must look like a $10,000 custom dashboard, not a template
- Pixel-perfect spacing, professional typography, clean data visualization
- Every chart must render with visible data — no blank charts ever
- Responsive: @media (max-width: 768px) single column grid`;

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

  const userRes = await fetch(supabaseUrl + '/auth/v1/user', {
    headers: { 'Authorization': 'Bearer ' + token, 'apikey': supabaseAnon },
  });
  if (!userRes.ok) return res.status(401).json({ error: 'Invalid session' });
  const user = await userRes.json();

  // Check if admin (unlimited access)
  const adminCheck = await fetch(
    supabaseUrl + '/rest/v1/profiles?id=eq.' + user.id + '&select=is_admin',
    { headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey } }
  );
  const adminData = await adminCheck.json();
  const isAdmin = adminData[0]?.is_admin === true;

  const { action, history } = req.body;

  // START CONVERSATION — deducts 1 credit (skip for admin)
  if (action === 'start_conversation') {
    if (isAdmin) return res.status(200).json({ ok: true, remaining: 9999 });
    const deductRes = await fetch(supabaseUrl + '/rest/v1/rpc/deduct_token', {
      method: 'POST',
      headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_uuid: user.id }),
    });
    if (!deductRes.ok) return res.status(500).json({ error: 'Failed to check credits' });
    const newBalance = await deductRes.json();
    if (newBalance === -1) return res.status(402).json({ error: 'No credits remaining. Purchase more to continue.' });
    return res.status(200).json({ ok: true, remaining: newBalance });
  }

  // GENERATE — no credit deduction (already deducted at conversation start)
  if (action === 'generate') {
    if (!Array.isArray(history) || history.length === 0) {
      return res.status(400).json({ error: 'No conversation history provided.' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'AI service not configured' });

    // Build messages from history (last 10 messages for context)
    // Truncate very long messages to avoid hitting token limits
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
