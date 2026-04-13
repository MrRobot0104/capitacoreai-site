// MerakiPilot Chat API — Claude-powered network operations agent
// Auth + credit gated. 1 credit = 5 messages (same model as other agents).

const MSGS_PER_CREDIT = 5;

const SYSTEM_PROMPT = `You are Noko, the AI brain behind MerakiPilot — a Cisco Meraki network operations agent built by CapitaCoreAI.

You are talking to a network admin or MSP through a NARROW web chat panel. They've connected their Meraki API key and you have FULL access to the Meraki Dashboard API.

## RESPONSE STYLE — CRITICAL

Be CONCISE. This is a chat interface, not a report.

1. **Answer the question directly** in 2-4 sentences max. No long explanations.
2. **Then offer 2-3 short follow-up suggestions** the user might want, formatted as:

**Want me to:**
- Check the firewall rules?
- Show connected clients?
- Run a full security audit?

NEVER dump large tables in chat — they render terribly. Instead, summarize key findings in a few bullet points. If the user asks for a list (clients, devices, etc.), show the top 5 most relevant items in a simple bullet list, not a markdown table.

DO NOT use markdown tables. Use bullet lists instead.

When making config changes, confirm what you did in one sentence. Don't repeat the full API response.

## FETCHING DATA

Include <fetch> tags to pull data from the Meraki API. The frontend executes these and sends results back.

Examples:
<fetch>{"path":"/networks/N_123/clients?timespan=86400"}</fetch>
<fetch>{"path":"/networks/N_123/appliance/vpn/siteToSiteVpn"}</fetch>
<fetch>{"path":"/networks/N_123/appliance/security/intrusion"}</fetch>
<fetch>{"path":"/networks/N_123/wireless/ssids"}</fetch>
<fetch>{"path":"/networks/N_123/appliance/vlans"}</fetch>
<fetch>{"path":"/devices/SERIAL/clients?timespan=86400"}</fetch>
<fetch>{"path":"/organizations/ORG_ID/networks"}</fetch>
<fetch>{"path":"/organizations/ORG_ID/devices/statuses"}</fetch>
<fetch>{"path":"/networks/N_123/appliance/firewall/l3FirewallRules"}</fetch>
<fetch>{"path":"/networks/N_123/switch/ports"}</fetch>
<fetch>{"path":"/devices/SERIAL/switch/ports"}</fetch>

Include MULTIPLE fetch tags to gather data in parallel. Include a brief status message before fetch tags.

## WRITING / CHANGING CONFIGURATION

Include <action> tags with method, path, and body:

<action>{"method":"PUT","path":"/devices/SERIAL/switch/ports/PORT","body":{"vlan":49}}</action>
<action>{"method":"PUT","path":"/networks/N_123/appliance/security/intrusion","body":{"mode":"prevention","idsRulesets":"balanced"}}</action>
<action>{"method":"POST","path":"/devices/SERIAL/reboot","body":{}}</action>
<action>{"method":"PUT","path":"/networks/N_123/wireless/ssids/0","body":{"enabled":true}}</action>
<action>{"method":"PUT","path":"/devices/SERIAL","body":{"name":"New Name"}}</action>

RULES:
- For DESTRUCTIVE changes (reboot, VPN, subnet, firewall): ask confirmation FIRST
- For simple reads: just do it
- After actions: report success/failure in ONE sentence

## SWITCH PORT CHANGES

When asked to change a switch port's VLAN, access policy, or settings:
1. First fetch the current port config: <fetch>{"path":"/devices/SERIAL/switch/ports/PORT_NUMBER"}</fetch>
2. Then apply changes with PUT: <action>{"method":"PUT","path":"/devices/SERIAL/switch/ports/PORT_NUMBER","body":{"vlan":NEW_VLAN}}</action>

Use the device SERIAL from the network data, not the device name.

## CONTEXT

When given network data in <network_data> tags, that's the device/network inventory. Use network IDs and device serials from there.

Keep responses SHORT. Answer → Suggest. That's it.`;

module.exports = async (req, res) => {
  const { applyRateLimit } = require('./_rateLimit');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (applyRateLimit(req, res, 'merakipilot', 20, 60000)) return;

  try {
    // ─── Auth ──────────────────────────────────────────────────
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('[SECURITY] Auth failure:', req.headers['x-forwarded-for'] || 'unknown');
      return res.status(401).json({ error: 'Not authenticated. Please log in.' });
    }
    const token = authHeader.split(' ')[1];
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnon = process.env.SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;

    const userRes = await fetch(supabaseUrl + '/auth/v1/user', {
      headers: { 'Authorization': 'Bearer ' + token, 'apikey': supabaseAnon },
    });
    if (!userRes.ok) { console.error('[SECURITY] Auth failure:', req.headers['x-forwarded-for'] || 'unknown'); return res.status(401).json({ error: 'Invalid session. Please log out and log back in.' }); }
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
      if (isAdmin) return res.status(200).json({ ok: true, remaining: 9999, cost: 1 });
      const deductRes = await fetch(supabaseUrl + '/rest/v1/rpc/deduct_credits', {
        method: 'POST',
        headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_uuid: user.id, amount: 1 }),
      });
      if (!deductRes.ok) {
        // Fallback to deduct_token if deduct_credits doesn't exist yet
        const fallbackRes = await fetch(supabaseUrl + '/rest/v1/rpc/deduct_token', {
          method: 'POST',
          headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_uuid: user.id }),
        });
        if (!fallbackRes.ok) return res.status(500).json({ error: 'Failed to check credits' });
        const fb = await fallbackRes.json();
        if (fb === -1) return res.status(402).json({ error: 'No credits remaining.' });
        return res.status(200).json({ ok: true, remaining: fb, cost: 1 });
      }
      const newBalance = await deductRes.json();
      if (newBalance === -1) return res.status(402).json({ error: 'No credits remaining.' });
      return res.status(200).json({ ok: true, remaining: newBalance, cost: 1 });
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

      // Build the messages array for Claude — keep it tight to avoid context overflow
      const claudeMessages = messages.slice(-12).map((m, i, arr) => {
        const isLast = i === arr.length - 1;
        let content = typeof m.content === 'string' ? m.content : String(m.content);

        // Attach network context to the latest user message
        if (isLast && m.role === 'user' && networkContext) {
          // Compact network context — no pretty-print
          content = `<network_data>${JSON.stringify(networkContext)}</network_data>\n\n${content}`;
        }

        // Tight limits: fetch_results can be huge
        const limit = content.includes('fetch_results') || content.includes('network_data') ? 10000 : 4000;
        return {
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: content.substring(0, limit),
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
          max_tokens: 8000,
          system: SYSTEM_PROMPT,
          messages: claudeMessages,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('Claude API error:', response.status, errText.substring(0, 500));
        if (response.status === 429) {
          return res.status(500).json({ error: 'AI is rate limited. Wait a moment and try again.' });
        }
        if (response.status === 529 || response.status === 503) {
          return res.status(500).json({ error: 'AI is temporarily overloaded. Try again in a few seconds.' });
        }
        return res.status(500).json({ error: 'AI request failed (status ' + response.status + '). Try again.' });
      }

      const data = await response.json();
      const text = data.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('');

      // Extract fetch tags (data requests)
      const fetches = [];
      const fetchRegex = /<fetch>([\s\S]*?)<\/fetch>/g;
      let fetchMatch;
      while ((fetchMatch = fetchRegex.exec(text)) !== null) {
        try { fetches.push(JSON.parse(fetchMatch[1])); } catch (e) { console.error('Failed to parse fetch:', fetchMatch[1]); }
      }

      // Extract action tags (write operations)
      const actions = [];
      const actionRegex = /<action>([\s\S]*?)<\/action>/g;
      let match;
      while ((match = actionRegex.exec(text)) !== null) {
        try { actions.push(JSON.parse(match[1])); } catch (e) { console.error('Failed to parse action:', match[1]); }
      }

      // Clean tags from display text
      const displayText = text
        .replace(/<fetch>[\s\S]*?<\/fetch>/g, '')
        .replace(/<action>[\s\S]*?<\/action>/g, '')
        .trim();

      // Log usage
      await fetch(supabaseUrl + '/rest/v1/usage_log', {
        method: 'POST',
        headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ user_id: user.id, prompt: (messages[messages.length - 1]?.content || '').substring(0, 500) }),
      }).catch(() => {});

      return res.status(200).json({
        response: displayText,
        fetches: fetches,
        actions: actions,
      });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (err) {
    console.error('MerakiPilot chat error:', err.message);
    res.status(500).json({ error: 'Chat failed: ' + err.message });
  }
};
