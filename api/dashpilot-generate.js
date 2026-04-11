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

const DESIGN_PROMPT = `You are a world-class dashboard engineer and data visualization expert. You receive JSON data and produce STUNNING, PRODUCTION-GRADE HTML dashboards that look like they were built by a senior designer at Linear, Stripe, or Vercel.

The JSON below contains ALL the data — KPIs, chart configs, and table data. Your job: turn it into an UNFORGETTABLE executive dashboard.

OUTPUT: A single complete HTML file. No markdown. No backticks. No explanations. Start with <!DOCTYPE html> and end with </html>.

═══════════════════════════════════════════
CDN LIBRARIES — load ALL of these in <head>
═══════════════════════════════════════════
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/apexcharts"></script>
<script src="https://unpkg.com/lucide@latest"></script>

DO NOT use Chart.js. Use ONLY ApexCharts for all charts.
After all content is rendered, call: lucide.createIcons(); to activate Lucide icons.

═══════════════════════════════════════════
DESIGN SYSTEM — use CSS custom properties
═══════════════════════════════════════════
Define in :root {
  --accent: #6366f1;          /* primary accent — vary per dashboard: indigo, violet, cyan, emerald */
  --accent-2: #8b5cf6;        /* secondary accent for gradients */
  --accent-glow: rgba(99,102,241,0.15);
  --bg: #0a0a0f;              /* deep dark background */
  --bg-card: rgba(255,255,255,0.04);
  --bg-card-hover: rgba(255,255,255,0.07);
  --border: rgba(255,255,255,0.08);
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --text-muted: #475569;
  --positive: #10b981;
  --negative: #f43f5e;
  --radius: 16px;
  --shadow-card: 0 0 0 1px var(--border), 0 4px 24px rgba(0,0,0,0.4);
  --shadow-glow: 0 0 40px var(--accent-glow);
}

DARK MODE ONLY. Deep dark background. Cards are semi-transparent glass with subtle borders. This is premium, not cheap.

BACKGROUND: Gradient mesh on body:
  background: var(--bg);
  background-image: radial-gradient(ellipse 80% 50% at 20% -10%, var(--accent-glow) 0%, transparent 60%),
                    radial-gradient(ellipse 60% 40% at 80% 110%, rgba(139,92,246,0.08) 0%, transparent 60%);
Add a subtle CSS dot-grid pattern overlay for texture.

═══════════════════════════════════════════
LAYOUT & STRUCTURE
═══════════════════════════════════════════
Full-bleed layout, max-width 1400px centered. Sections separated by 40-60px gaps.

1. HEADER — gradient text title (background-clip: text), subtitle in muted color, glass pill badges with colored dots
2. KPI CARDS — glass-morphism cards with:
   - backdrop-filter: blur(20px) saturate(180%)
   - Colored left accent bar using var(--accent)
   - Lucide icon (<i data-lucide="trending-up"></i> — pick relevant: dollar-sign, package, percent, zap, target, bar-chart-2, users, activity)
   - Large bold value (font-weight: 900, gradient text for primary KPI)
   - Change badge: green pill for positive, red pill for negative
   - Staggered entrance animations
3. CHARTS — 2-4 ApexCharts in responsive grid
4. DATA TABLE — glass card, sticky dark header, alternating row opacity, accent hover glow, money columns tabular-nums, percent values as colored pills
5. FOOTER — "Built with DashPilot by CapitaCoreAI"

═══════════════════════════════════════════
APEXCHARTS — CRITICAL RULES
═══════════════════════════════════════════
Initialize ALL charts inside: document.addEventListener('DOMContentLoaded', function() { ... });
Each chart container needs a UNIQUE id (e.g., chart-0, chart-1).
Use this pattern:
  var opts = { chart: { type: 'bar', height: 300, background: 'transparent', toolbar: { show: false }, fontFamily: 'Inter' }, theme: { mode: 'dark' }, ... };
  new ApexCharts(document.getElementById('chart-0'), opts).render();

Chart type mappings:
- bar → type:'bar', plotOptions.bar.borderRadius:6, plotOptions.bar.columnWidth:'60%'
- horizontalBar → type:'bar', plotOptions.bar.horizontal:true, plotOptions.bar.borderRadius:4
- line → type:'area', stroke.curve:'smooth', stroke.width:3, fill.type:'gradient', fill.gradient.opacityFrom:0.4, fill.gradient.opacityTo:0.05
- doughnut → type:'donut', plotOptions.pie.donut.size:'68%'
- pie → type:'pie'

ALL charts must have: theme:{mode:'dark'}, grid:{borderColor:'rgba(255,255,255,0.06)'}, colors array from a cohesive palette.
Tooltip: dark background, rounded corners. Legend: position 'bottom', dark labels.
NEVER use ctx.createLinearGradient. Use ApexCharts built-in gradient fills.

═══════════════════════════════════════════
MICRO-ANIMATIONS
═══════════════════════════════════════════
- Staggered fadeUp CSS animations on cards (opacity 0→1, translateY 20px→0, ease-out 0.6s, stagger 80ms via --delay custom property)
- Number counter animation on KPI values using requestAnimationFrame
- Subtle hover: cards lift 2px with glow shadow transition

═══════════════════════════════════════════
DATA RULES — CRITICAL
═══════════════════════════════════════════
- Use the EXACT values from the JSON for all KPIs, chart series, and table rows
- DO NOT fabricate, round, or zero-out any values
- Chart series data must match the datasets arrays exactly
- Table must include ALL rows from the JSON

Keep the HTML compact. No comments.
Make this look like a McKinsey deck rebuilt by the Stripe design team. Stunning. Professional. Badass.`;

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
          max_tokens: 16000,
          thinking: {
            type: 'enabled',
            budget_tokens: 10000
          },
          tools: [
            { type: 'web_search_20250305', name: 'web_search', max_uses: 3 }
          ],
          system: DESIGN_PROMPT,
          messages: [{
            role: 'user',
            content: 'Dashboard data (use these exact values):\n\n' + JSON.stringify(dashConfig, null, 2) + '\n\nUser request: ' + userRequest
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
