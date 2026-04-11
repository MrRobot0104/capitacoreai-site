const EXTRACT_PROMPT = `You are a data extraction expert. You MUST output ONLY a valid JSON object — no text before or after, no markdown, no explanation.

If the user provides CSV/Excel data, read the DATA SUMMARY and RAW DATA and use the ACTUAL numbers.
If the user describes a dashboard without data, generate realistic sample data that matches their description.

Output this exact JSON structure:
{"title":"Dashboard Title","subtitle":"Description","kpis":[{"label":"METRIC","value":"$98.6K","change":"+12%"}],"charts":[{"title":"Chart","subtitle":"","type":"bar","labels":["A","B"],"datasets":[{"label":"Series","data":[100,200]}]}],"table":{"title":"Details","headers":["Col1","Col2"],"rows":[["val1","val2"]]}}

Chart types: bar, horizontalBar, line, doughnut, pie.
KPI values: Use pre-computed sums/averages from data. Format as $98.6K, 68.2%, 761 units.
Charts: Put REAL numbers from the data in arrays.
Table: Include ALL data rows.

CRITICAL: Your entire response must be a single JSON object. Do NOT include any text, explanation, or markdown. Start with { and end with }.`;

const DESIGN_PROMPT = `You are an elite dashboard designer and data storyteller. You receive JSON data and create STUNNING, UNIQUE, executive-grade HTML dashboards.

The JSON below contains ALL the data — KPIs, chart configs, and table data. Your job is to make it UNFORGETTABLE.

You also have web search — use it to enrich the dashboard with real company info, product details, industry context, and relevant facts that would impress a CFO.

OUTPUT: A single complete HTML file. No markdown. No backticks. Start with <!DOCTYPE html>.

Load in <head>:
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>

THINK DEEPLY about the best way to present this data. Consider:
- What story does this data tell?
- What would a CFO care about most?
- What insights are hidden in the numbers?
- What context from the web makes this more compelling?

DESIGN — be creative and UNIQUE every time:
- Each dashboard should have its own visual personality
- Use creative layouts: hero sections, split panels, sidebar stats, full-bleed charts
- Rich color palettes, gradient accents, glass-morphism, dark/light sections
- Animated number counters, progress rings, sparklines, trend arrows
- Custom SVG icons, creative section dividers
- Chart.js with gradient fills, custom tooltips, annotations
- If the user mentions a company or product, include real facts from your web search
- Add an "insights" section with AI-generated observations about the data

CHART.JS: ALL code inside window.addEventListener('load', function() { ... })
Use the EXACT values from the JSON. borderRadius on bars, tension on lines.

DATA: The KPI values, chart data, and table rows from JSON go directly into the HTML. DO NOT change or zero-out any values.

Make this look like a McKinsey deliverable meets a Silicon Valley product.`;

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

      // ========= STEP 2: Generate unique HTML with Sonnet + thinking + web search =========
      const userRequest = (messages[messages.length - 1]?.content || '').substring(0, 1000);

      const designRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 16000,
          thinking: {
            type: 'enabled',
            budget_tokens: 5000
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
        console.error('Sonnet error:', designRes.status);
        return res.status(500).json({ error: 'Design generation failed: ' + (designData.error?.message || 'AI error') });
      }

      // Extract text blocks only (skip thinking and tool_result blocks)
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
