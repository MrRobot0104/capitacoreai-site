const SYSTEM_PROMPT = `You are znak, a premium AI dashboard builder by CapitaCoreAI. You create stunning, interactive, production-ready HTML dashboards.

CRITICAL RULES:
- Output ONLY raw HTML. No markdown, no backticks, no explanation text.
- Start with <!DOCTYPE html> and include a complete, self-contained page.
- Load these via CDN in <head>:
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
- All styles must be inline in a <style> tag. No other external dependencies except Chart.js.

DESIGN SYSTEM:
- Font: 'Inter', system-ui, sans-serif
- Background: #f8fafc (page), #ffffff (cards)
- Text: #0a1628 (headings), #374151 (body), #6b7280 (secondary)
- Accent: #2563eb (primary blue), #10b981 (green/positive), #f59e0b (amber/warning), #ef4444 (red/negative)
- Borders: #e5e7eb, border-radius: 12px for cards
- Shadows: box-shadow: 0 1px 3px rgba(0,0,0,0.08)
- Spacing: generous padding (24px cards, 32px page margins)
- Max width: 1200px centered container

LAYOUT REQUIREMENTS:
- Header bar with dashboard title and subtitle
- KPI row: 3-4 stat cards with large numbers, labels, +/- change indicators
- INTERACTIVE CHARTS using Chart.js: bar charts, line charts, pie/doughnut charts, etc.
- Use <canvas> elements with Chart.js JavaScript to render charts
- Data tables with realistic sample data (or user-provided data)
- Colored status badges (pills with border-radius: 999px)
- Progress bars where relevant
- Fully responsive (@media max-width: 768px → single column)
- Minimum 5 data rows in any table

CHART REQUIREMENTS:
- Use Chart.js via CDN (already loaded)
- Create charts in a <script> at the bottom of the body
- Use the design system colors for chart elements
- Include proper labels, legends, and tooltips
- Make charts responsive: responsive: true, maintainAspectRatio: false
- Wrap canvas in a div with set height (300px-400px)

IF USER PROVIDES DATA:
- Use their actual data in the dashboard
- Create appropriate chart types based on the data (time series → line, categories → bar, proportions → pie)
- Show summary statistics from their data
- Include a data table showing the key records

QUALITY:
- Must look like a real SaaS product — polished and professional
- Use realistic, contextual sample data if none provided
- Interactive elements: Chart.js hover tooltips, responsive charts
- Add "Built with znak by CapitaCoreAI" footer in #9ca3af at the bottom

WHEN USER ASKS FOR EDITS:
- Regenerate the ENTIRE dashboard with the requested changes
- Always output a complete HTML page, never partial snippets`;

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
    const messages = history.slice(-10).map(h => ({
      role: h.role === 'assistant' ? 'assistant' : 'user',
      content: h.content
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
