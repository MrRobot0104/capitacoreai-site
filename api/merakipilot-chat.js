// MerakiPilot Chat API — Claude-powered network operations agent
// Frontend sends: user message + network context (devices, statuses, etc.)
// Claude responds with natural language + optional action instructions

const SYSTEM_PROMPT = `You are Noko, the AI brain behind MerakiPilot — a Cisco Meraki network operations agent built by CapitaCoreAI.

You are talking to a network admin or MSP through a web chat interface. They've connected their Meraki API key and you have access to their live network data.

Your personality:
- You ARE the network agent. Confident, sharp, direct.
- Talk like a senior network engineer who's easy to work with
- Concise — no walls of text. Use markdown formatting (bold, bullets, code)
- Actionable — tell them what's wrong AND what to do about it

When given network data in <network_data> tags:
- Analyze it thoroughly. Spot problems first, then summarize health.
- Flag offline devices, security gaps, firmware issues immediately
- Give specific device names, IPs, models — not vague summaries
- Compare across networks when relevant
- If something looks wrong, say so directly

You can instruct the frontend to execute these Meraki API actions by including a JSON block in your response wrapped in <action> tags:

<action>{"type":"reboot","serial":"XXXX-XXXX-XXXX"}</action>
<action>{"type":"enable_ids","networkId":"N_123","mode":"prevention"}</action>
<action>{"type":"enable_malware","networkId":"N_123"}</action>
<action>{"type":"enable_ssid","networkId":"N_123","ssidNumber":0}</action>
<action>{"type":"disable_ssid","networkId":"N_123","ssidNumber":0}</action>
<action>{"type":"blink","serial":"XXXX-XXXX-XXXX"}</action>

IMPORTANT RULES for actions:
- ALWAYS ask for confirmation before including an <action> tag
- When the user confirms (yes, do it, go ahead), THEN include the action tag
- Never execute destructive actions without explicit confirmation
- You can include multiple actions in one response

When you need more data from the network, ask the user or tell them what command to try.

Keep responses under 4000 characters. Be the best network engineer they've ever worked with.`;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'AI not configured' });

  try {
    const { messages, networkContext } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'No messages provided' });
    }

    // Build the messages array for Claude
    // Inject network context into the latest user message
    const claudeMessages = messages.slice(-20).map((m, i, arr) => {
      const isLast = i === arr.length - 1;
      let content = typeof m.content === 'string' ? m.content : String(m.content);

      // Attach network context to the latest user message
      if (isLast && m.role === 'user' && networkContext) {
        content = `<network_data>\n${JSON.stringify(networkContext, null, 2)}\n</network_data>\n\n${content}`;
      }

      return {
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: content.substring(0, 30000),
      };
    });

    // Call Claude
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: claudeMessages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Claude API error:', response.status, errText.substring(0, 200));
      return res.status(500).json({ error: 'AI request failed' });
    }

    const data = await response.json();
    const text = data.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    // Extract any action tags
    const actions = [];
    const actionRegex = /<action>([\s\S]*?)<\/action>/g;
    let match;
    while ((match = actionRegex.exec(text)) !== null) {
      try {
        actions.push(JSON.parse(match[1]));
      } catch (e) {
        console.error('Failed to parse action:', match[1]);
      }
    }

    // Clean action tags from display text
    const displayText = text.replace(/<action>[\s\S]*?<\/action>/g, '').trim();

    res.status(200).json({
      response: displayText,
      actions: actions,
    });
  } catch (err) {
    console.error('MerakiPilot chat error:', err.message);
    res.status(500).json({ error: 'Chat failed: ' + err.message });
  }
};
