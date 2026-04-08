const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic();

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

  if (prompt.length > 500) {
    return res.status(400).json({ error: "Prompt too long (max 500 characters)" });
  }

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-5-20241022",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Build a dashboard for: ${prompt.trim()}`,
        },
      ],
    });

    const html = message.content[0].text;
    res.status(200).json({ html });
  } catch (err) {
    console.error("Claude API error:", err.status, err.message);
    res.status(500).json({ error: "Failed to generate dashboard. Please try again." });
  }
};
