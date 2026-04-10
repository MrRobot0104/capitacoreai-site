const SYSTEM_PROMPT = `You are znak — the world's best dashboard builder. You create STUNNING, executive-grade, interactive data dashboards that make CFOs say "wow."

OUTPUT: A single, complete, self-contained HTML file. No markdown. No backticks. No explanation. Just the HTML starting with <!DOCTYPE html>.

LIBRARIES (load ALL of these in <head>):
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script src="https://cdn.jsdelivr.net/npm/d3@7"></script>

DESIGN PRINCIPLES:
- This must look like a $50,000 custom-built executive dashboard
- Clean, minimal, professional — like a top-tier consulting firm's deliverable
- Lots of whitespace, precise typography, purposeful color
- Color palette: #2563eb (primary blue), #0891b2 (teal), #7c3aed (purple), #059669 (green), #111 (dark), #f8f9fb (bg)
- Font: Inter. Headings: 700-800 weight. Body: 400-500.
- Border radius: 12-16px on cards. Subtle shadows: 0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.04)

REQUIRED STRUCTURE:
1. HEADER — Title, subtitle with metadata (dates, IDs, etc.), maybe a gradient accent line
2. KPI CARDS — 3-5 stat cards with: large number, label, colored change indicator with arrow icon, gradient top border. Animate in with staggered fadeUp.
3. CHARTS — 2-4 interactive charts. Use Chart.js AND/OR custom SVG/D3.js. Pick the best visualization for each dataset:
   - Bar charts with rounded corners, hover effects, gradient fills
   - Horizontal bars for rankings
   - Doughnut/pie with custom center text showing total
   - Line charts with gradient fills, smooth curves, animated drawing
   - Gauges, progress rings, sparklines using SVG/D3 where appropriate
4. DATA TABLE — Sortable-looking, professional. Alternating rows, money values in bold monospace, percentage badges with colored backgrounds, status indicators.
5. FOOTER — "Built with znak by CapitaCoreAI" subtle at bottom

ANIMATION REQUIREMENTS:
- Cards fade up on load with staggered delays (use CSS @keyframes)
- Chart.js charts animate with easing
- Numbers can count up using requestAnimationFrame
- Hover effects on cards (lift + shadow)
- Smooth transitions everywhere

CHART.JS CRITICAL RULES:
- ALL chart initialization code MUST be inside: window.addEventListener('load', function() { ... })
- EVERY dataset must have hardcoded numeric data — NEVER empty arrays
- Use the color palette above for fills and borders
- borderRadius on bar charts, tension on lines, custom tooltips

WHEN USER PROVIDES DATA:
- ACTUALLY CALCULATE real values: sums, averages, percentages, comparisons
- Use EVERY number from the data — don't leave anything out
- Group and aggregate intelligently (by category, by SKU, by date)
- Format money with $ and commas, percentages with % sign
- Include ALL data rows in the table

WHEN USER ASKS FOR EDITS:
- The previous message shows what you generated. Regenerate the complete page with changes applied.

Go above and beyond. Add creative touches: gradient backgrounds on sections, animated counters, custom SVG icons, sparkline mini-charts in the KPI cards, progress rings, heatmap-style table cells. Make it unforgettable.`;

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
