// MerakiPilot Chat API — Claude-powered network operations agent
// Auth + credit gated. 1 credit = 5 messages (same model as other agents).

const MSGS_PER_CREDIT = 5;

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

  try {
    // ─── Auth ──────────────────────────────────────────────────
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Not authenticated. Please log in.' });
    }
    const token = authHeader.split(' ')[1];
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnon = process.env.SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;

    const userRes = await fetch(supabaseUrl + '/auth/v1/user', {
      headers: { 'Authorization': 'Bearer ' + token, 'apikey': supabaseAnon },
    });
    if (!userRes.ok) return res.status(401).json({ error: 'Invalid session. Please log out and log back in.' });
    const user = await userRes.json();

    const adminCheck = await fetch(
      supabaseUrl + '/rest/v1/profiles?id=eq.' + user.id + '&select=is_admin,token_balance',
      { headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey } }
    );
    const adminData = await adminCheck.json();
    const isAdmin = adminData[0]?.is_admin === true;
    const balance = adminData[0]?.token_balance || 0;

    const { action, messages, networkContext } = req.body;

    // ─── Start Conversation (deduct 1 credit) ─────────────────
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

    // ─── Chat (send message to Claude) ────────────────────────
    if (action === 'chat') {
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'No messages provided' });
      }

      // Server-side credit check: must have credits or be admin
      if (!isAdmin && balance <= 0) {
        return res.status(402).json({ error: 'No credits remaining. Purchase more to continue.' });
      }

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return res.status(500).json({ error: 'AI not configured' });

      // Build the messages array for Claude
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

      // Log usage
      await fetch(supabaseUrl + '/rest/v1/usage_log', {
        method: 'POST',
        headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ user_id: user.id, prompt: (messages[messages.length - 1]?.content || '').substring(0, 500) }),
      }).catch(() => {});

      return res.status(200).json({
        response: displayText,
        actions: actions,
      });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (err) {
    console.error('MerakiPilot chat error:', err.message);
    res.status(500).json({ error: 'Chat failed: ' + err.message });
  }
};
