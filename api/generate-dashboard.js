const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a dashboard generator for CapitaCoreAI. Given a user's idea or business need, generate a complete, self-contained HTML page with inline CSS that creates a beautiful, modern dashboard.

Rules:
- Output ONLY the raw HTML code. No markdown, no backticks, no explanation.
- Use inline <style> in the <head>. No external stylesheets or libraries.
- Use a clean, modern design: white background, subtle borders (#e5e7eb), dark text (#0a1628), accent color (#2563eb).
- Include realistic sample data that matches the user's idea.
- Use cards with stats, tables, progress bars, and simple visual indicators.
- Make it responsive with CSS grid/flexbox.
- Keep it under 4000 characters total.
- Use system fonts: font-family: 'Inter', system-ui, sans-serif;
- The dashboard should look professional and immediately useful.`;

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
      model: "claude-sonnet-4-6",
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
    console.error("Claude API error:", err);
    res.status(500).json({ error: "Failed to generate dashboard. Please try again." });
  }
};
