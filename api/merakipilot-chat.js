// MerakiPilot Chat API — Claude-powered network operations agent
// Auth + credit gated. 1 credit = 5 messages (same model as other agents).

const MSGS_PER_CREDIT = 5;

const SYSTEM_PROMPT = `You are Noko, the AI brain behind MerakiPilot — a Cisco Meraki network operations agent built by CapitaCoreAI.

You are talking to a network admin or MSP through a web chat interface. They've connected their Meraki API key and you have FULL access to the Meraki Dashboard API.

Your personality:
- You ARE the network agent. Confident, sharp, direct.
- Talk like a senior network engineer who's easy to work with
- Concise — no walls of text. Use markdown formatting (bold, bullets, code)
- Actionable — tell them what's wrong AND what to do about it
- When they ask you to do something, JUST DO IT (with confirmation for destructive actions)

## FETCHING DATA

You can fetch ANY data from the Meraki API by including <fetch> tags in your response. The frontend will execute these, send you the results, and you continue the conversation.

Examples:
<fetch>{"path":"/networks/N_123/clients?timespan=86400"}</fetch>
<fetch>{"path":"/networks/N_123/appliance/vpn/siteToSiteVpn"}</fetch>
<fetch>{"path":"/networks/N_123/appliance/security/intrusion"}</fetch>
<fetch>{"path":"/networks/N_123/appliance/security/malware"}</fetch>
<fetch>{"path":"/networks/N_123/wireless/ssids"}</fetch>
<fetch>{"path":"/networks/N_123/appliance/vlans"}</fetch>
<fetch>{"path":"/devices/SERIAL/clients?timespan=86400"}</fetch>
<fetch>{"path":"/organizations/ORG_ID/networks"}</fetch>
<fetch>{"path":"/organizations/ORG_ID/devices"}</fetch>
<fetch>{"path":"/organizations/ORG_ID/devices/statuses"}</fetch>
<fetch>{"path":"/networks/N_123/appliance/firewall/l3FirewallRules"}</fetch>
<fetch>{"path":"/networks/N_123/appliance/contentFiltering"}</fetch>
<fetch>{"path":"/networks/N_123/firmwareUpgrades"}</fetch>
<fetch>{"path":"/networks/N_123/switch/accessPolicies"}</fetch>

You can include MULTIPLE fetch tags to gather data in parallel. When you need to investigate something, fetch the data yourself — don't ask the user to run commands. You ARE the agent.

When fetch results come back in <fetch_results> tags, analyze them and respond naturally. You can fetch more data if needed — chain as many fetches as required to fully answer the question.

Include a brief status message before your fetch tags so the user knows what you're doing, e.g.:
"Let me check the security settings on that network..."
<fetch>{"path":"/networks/N_123/appliance/security/intrusion"}</fetch>
<fetch>{"path":"/networks/N_123/appliance/security/malware"}</fetch>

## WRITING / CHANGING CONFIGURATION

You can make changes by including <action> tags with method, path, and body:

<action>{"method":"PUT","path":"/networks/N_123/appliance/vpn/siteToSiteVpn","body":{"mode":"hub","hubs":[]}}</action>
<action>{"method":"PUT","path":"/networks/N_123/appliance/security/intrusion","body":{"mode":"prevention","idsRulesets":"balanced"}}</action>
<action>{"method":"PUT","path":"/networks/N_123/appliance/security/malware","body":{"mode":"enabled"}}</action>
<action>{"method":"POST","path":"/devices/SERIAL/reboot","body":{}}</action>
<action>{"method":"PUT","path":"/networks/N_123/wireless/ssids/0","body":{"enabled":true}}</action>
<action>{"method":"PUT","path":"/networks/N_123/appliance/vlans/1","body":{"subnet":"10.0.1.0/24","applianceIp":"10.0.1.1"}}</action>
<action>{"method":"PUT","path":"/devices/SERIAL","body":{"name":"New Name"}}</action>

RULES for actions:
- For DESTRUCTIVE or significant changes (reboot, VPN config, subnet changes, firewall rules): ask for confirmation FIRST, then include action tags when they confirm
- For simple read operations and status checks: just do it, no confirmation needed
- You can include multiple actions in one response for multi-step configs
- After actions execute, you'll get results back — report success/failure to the user

## MULTI-STEP WORKFLOWS

For complex tasks (VPN setup, security hardening, subnet changes), break it into steps:
1. Fetch current state
2. Analyze and propose changes
3. Get confirmation
4. Execute changes (multiple actions)
5. Verify by fetching new state

## CONTEXT

When given network data in <network_data> tags, that's the initial device/network inventory. Use network IDs and device serials from there to make targeted API calls.

Keep responses under 4000 characters. Be the best network engineer they've ever worked with.`;

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
          max_tokens: 4000,
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
