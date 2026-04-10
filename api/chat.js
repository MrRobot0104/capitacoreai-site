const SYSTEM_PROMPT = `You are a friendly, helpful AI assistant for CapitaCoreAI — an AI consulting and intelligence software company.

About CapitaCoreAI:
- We build specialized AI solutions and digital products for businesses
- Services: AI Consulting, Custom AI Products, Data & Analytics
- Products: AI agents like "znak" (an AI-powered dashboard builder)
- Contact email: capitacoreai@gmail.com
- Website: capitacoreai.io

Your role:
- Answer questions about CapitaCoreAI, our services, and products
- Help visitors understand what we offer
- Be conversational, concise, and helpful
- If someone asks about pricing, direct them to our agents page (agents.html)
- If someone needs custom work or wants to talk to a human, direct them to contact us at capitacoreai@gmail.com or use the contact form
- Keep responses short (2-3 sentences max) and friendly
- Do NOT generate code, dashboards, or long technical content
- If asked something unrelated to CapitaCoreAI, briefly answer but steer back to how we can help them`;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { message, history } = req.body;

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return res.status(400).json({ error: "Message is required" });
  }

  if (message.length > 500) {
    return res.status(400).json({ error: "Message too long" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "AI not configured" });

  // Build conversation with up to last 6 messages for context
  const messages = [];
  if (Array.isArray(history)) {
    history.slice(-6).forEach(h => {
      messages.push({ role: h.role, content: h.content });
    });
  }
  messages.push({ role: "user", content: message.trim() });

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
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: messages,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      const detail = data.error ? data.error.message : "AI error";
      return res.status(500).json({ error: detail });
    }

    let reply = data.content[0].text;
    reply = reply.replace(/^```(?:html)?\s*\n/i, '').replace(/\n```\s*$/i, '').trim();

    res.status(200).json({ reply });
  } catch (err) {
    console.error("Chat error:", err.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
};
