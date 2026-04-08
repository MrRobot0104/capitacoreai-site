const SYSTEM_PROMPT = `You are a premium dashboard generator for CapitaCoreAI. Given a user's idea, generate a stunning, production-ready HTML dashboard.

CRITICAL RULES:
- Output ONLY raw HTML. No markdown, no backticks, no explanation text.
- Start with <!DOCTYPE html> and include a complete, self-contained page.
- Load Inter font via: <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
- All styles must be inline in a <style> tag. No other external dependencies.

DESIGN SYSTEM:
- Font: 'Inter', system-ui, sans-serif
- Background: #f8fafc (page), #ffffff (cards)
- Text: #0a1628 (headings), #374151 (body), #6b7280 (secondary)
- Accent: #2563eb (primary blue), #10b981 (green/positive), #f59e0b (amber/warning), #ef4444 (red/negative)
- Borders: #e5e7eb, border-radius: 12px for cards
- Shadows: box-shadow: 0 1px 3px rgba(0,0,0,0.08)
- Spacing: Use generous padding (24px cards, 32px page margins)
- Max width: 1100px centered container

LAYOUT REQUIREMENTS:
- Include a header bar with dashboard title and a subtitle
- KPI row: 3-4 stat cards at the top with large numbers, labels, and +/- percentage change indicators
- Main content: Use a mix of tables, lists, or grid sections with realistic sample data
- Use colored status badges (green/blue/amber/gray pills with border-radius: 999px)
- Add subtle progress bars where relevant (height: 8px, rounded)
- Make it fully responsive (single column on mobile via @media max-width: 768px)
- Minimum 5 data rows in any table

QUALITY:
- The dashboard must look like a real SaaS product — polished and professional
- Use realistic, contextual sample data that matches the user's request
- Include hover states on interactive-looking elements (cursor: default is fine)
- Add a small "Built with CapitaCoreAI" footer text in #9ca3af at the bottom`;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { prompt } = req.body;

  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  if (prompt.trim().length < 20) {
    return res.status(400).json({ error: "Please describe your dashboard idea in more detail (at least 20 characters)." });
  }

  if (prompt.length > 500) {
    return res.status(400).json({ error: "Prompt too long (max 500 characters)." });
  }

  const dashboardWords = /dashboard|tracker|report|analytics|monitor|chart|metric|stat|sales|finance|budget|pipeline|inventory|hr|employee|project|task|kpi|revenue|customer|order|ticket|lead/i;
  if (!dashboardWords.test(prompt)) {
    return res.status(400).json({ error: "Please describe a dashboard or tracker you'd like to build. For example: \"A sales pipeline tracker with deal stages and revenue metrics.\"" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured. Add ANTHROPIC_API_KEY in Vercel env vars." });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: "Build a dashboard for: " + prompt.trim(),
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Anthropic API error:", response.status, JSON.stringify(data));
      // Return the actual API error so we can debug
      const detail = data.error ? data.error.message : "Unknown API error";
      return res.status(500).json({ error: "API error: " + detail });
    }

    const html = data.content[0].text;
    res.status(200).json({ html });
  } catch (err) {
    console.error("Request error:", err.message);
    res.status(500).json({ error: "Request failed: " + err.message });
  }
};
