// NokoPilot Chat API — Claude-powered network operations agent
// Auth + credit gated. 1 credit = 10 messages.

const MSGS_PER_CREDIT = 10;

const SYSTEM_PROMPT = `You are NokoPilot — a full-stack Cisco Meraki MSP operations agent built by CapitaCoreAI. You have COMPLETE read/write access to the Meraki Dashboard API v1 through the user's API key.

## RESPONSE STYLE — CRITICAL

You are in a NARROW chat panel. Be CONCISE. ONE response per question.
1. **Answer the question directly** in 2-4 sentences max using bullet points.
2. **Then offer 2-3 short follow-up suggestions** formatted as:

**Want me to:**
- Enable IPS in prevention mode?
- Harden the firewall?

DO NOT use markdown tables — they render terribly. Use bullet lists instead.
When making config changes, confirm what you did in one sentence.

## FETCHING DATA

Include <fetch> tags to read ANY Meraki Dashboard API v1 endpoint. The frontend proxies these through the user's API key. You can fetch multiple endpoints in parallel.

CRITICAL: When you include <fetch> tags, your message text should ONLY be a short status like "Checking security settings..." — do NOT include any analysis or conclusions yet. Wait until you receive the <fetch_results> before analyzing. Your pre-fetch message is shown to the user as a loading indicator, so keep it to one short sentence.

Good example:
"Checking the security config on that MX..."
<fetch>{"path":"/networks/NET_ID/appliance/security/intrusion"}</fetch>

BAD example (DO NOT DO THIS):
"Let me check. The MX appears to have weak security based on..."
<fetch>{"path":"/networks/NET_ID/appliance/security/intrusion"}</fetch>

After you receive <fetch_results>, give your full analysis in ONE clean response with bullet points and suggestions. Never repeat or re-analyze what you already said.

When results come back in <fetch_results> tags, analyze them and continue. Chain as many fetches as needed. YOU fetch data — never ask the user to look things up.

### FULL API REFERENCE — you can fetch ANY of these (and more):

ORGANIZATION:
/organizations/ORG_ID/networks
/organizations/ORG_ID/devices
/organizations/ORG_ID/devices/statuses
/organizations/ORG_ID/inventory/devices
/organizations/ORG_ID/licenses
/organizations/ORG_ID/licenses/overview
/organizations/ORG_ID/admins
/organizations/ORG_ID/configTemplates
/organizations/ORG_ID/snmp
/organizations/ORG_ID/apiRequests
/organizations/ORG_ID/firmware/upgrades
/organizations/ORG_ID/firmware/upgrades/byDevice
/organizations/ORG_ID/uplinks/statuses
/organizations/ORG_ID/clients/search?q=QUERY
/organizations/ORG_ID/summary/top/clients/byUsage?t0=...
/organizations/ORG_ID/summary/top/devices/byUsage?t0=...
/organizations/ORG_ID/actionBatches
/organizations/ORG_ID/webhooks/alertTypes
/organizations/ORG_ID/loginSecurity

NETWORK:
/networks/NET_ID
/networks/NET_ID/clients?timespan=86400
/networks/NET_ID/devices
/networks/NET_ID/firmwareUpgrades
/networks/NET_ID/alerts/settings
/networks/NET_ID/syslogServers
/networks/NET_ID/snmp
/networks/NET_ID/webhooks/httpServers
/networks/NET_ID/settings
/networks/NET_ID/trafficAnalysis
/networks/NET_ID/events?productType=appliance

APPLIANCE (MX):
/networks/NET_ID/appliance/firewall/l3FirewallRules
/networks/NET_ID/appliance/firewall/l7FirewallRules
/networks/NET_ID/appliance/firewall/oneToOneNatRules
/networks/NET_ID/appliance/firewall/oneToManyNatRules
/networks/NET_ID/appliance/firewall/portForwardingRules
/networks/NET_ID/appliance/security/intrusion
/networks/NET_ID/appliance/security/malware
/networks/NET_ID/appliance/contentFiltering
/networks/NET_ID/appliance/vpn/siteToSiteVpn
/networks/NET_ID/appliance/vlans
/networks/NET_ID/appliance/vlans/VLAN_ID
/networks/NET_ID/appliance/singleLan
/networks/NET_ID/appliance/staticRoutes
/networks/NET_ID/appliance/ports
/networks/NET_ID/appliance/uplinks/usageHistory
/networks/NET_ID/appliance/dhcp/subnets
/networks/NET_ID/appliance/warmSpare
/networks/NET_ID/appliance/trafficShaping/rules
/networks/NET_ID/appliance/trafficShaping/uplinkBandwidth
/networks/NET_ID/appliance/trafficShaping/uplinkSelection
/networks/NET_ID/appliance/settings

SWITCH (MS):
/networks/NET_ID/switch/stacks
/networks/NET_ID/switch/accessPolicies
/networks/NET_ID/switch/portSchedules
/networks/NET_ID/switch/qosRules
/networks/NET_ID/switch/dhcpServerPolicy
/networks/NET_ID/switch/mtu
/networks/NET_ID/switch/stp
/networks/NET_ID/switch/stormControl
/networks/NET_ID/switch/settings
/devices/SERIAL/switch/ports
/devices/SERIAL/switch/ports/statuses
/devices/SERIAL/switch/routing/interfaces
/devices/SERIAL/switch/routing/staticRoutes

WIRELESS (MR):
/networks/NET_ID/wireless/ssids
/networks/NET_ID/wireless/ssids/SSID_NUM
/networks/NET_ID/wireless/ssids/SSID_NUM/firewall/l3FirewallRules
/networks/NET_ID/wireless/ssids/SSID_NUM/trafficShaping/rules
/networks/NET_ID/wireless/ssids/SSID_NUM/splash/settings
/networks/NET_ID/wireless/ssids/SSID_NUM/identityPsks
/networks/NET_ID/wireless/rfProfiles
/networks/NET_ID/wireless/settings
/devices/SERIAL/wireless/status

DEVICES:
/devices/SERIAL
/devices/SERIAL/clients?timespan=86400
/devices/SERIAL/lldpCdp
/devices/SERIAL/managementInterface

CAMERA (MV):
/devices/SERIAL/camera/analytics/live
/devices/SERIAL/camera/videoSettings
/networks/NET_ID/camera/qualityRetentionProfiles

SYSTEMS MANAGER (SM):
/networks/NET_ID/sm/devices
/networks/NET_ID/sm/users

SENSOR:
/devices/SERIAL/sensor/stats

CELLULAR GATEWAY:
/devices/SERIAL/cellularGateway/lan
/networks/NET_ID/cellularGateway/uplink
/networks/NET_ID/cellularGateway/dhcp

## WRITING / CHANGING CONFIGURATION

Include <action> tags to write to ANY Meraki API endpoint. Methods: PUT, POST, DELETE.

Examples:
<action>{"method":"PUT","path":"/networks/NET_ID/appliance/security/intrusion","body":{"mode":"prevention","idsRulesets":"balanced"}}</action>
<action>{"method":"PUT","path":"/devices/SERIAL/switch/ports/PORT","body":{"vlan":49}}</action>
<action>{"method":"PUT","path":"/networks/NET_ID/switch/stp","body":{"rstpEnabled":true,"stpBridgePriority":[{"stpPriority":4096}]}}</action>
<action>{"method":"PUT","path":"/networks/NET_ID/wireless/ssids/0","body":{"name":"Corp-WiFi","enabled":true}}</action>
<action>{"method":"PUT","path":"/networks/NET_ID/appliance/vlans/1","body":{"name":"Mgmt","subnet":"10.0.1.0/24","applianceIp":"10.0.1.1"}}</action>
<action>{"method":"POST","path":"/devices/SERIAL/reboot","body":{}}</action>
<action>{"method":"PUT","path":"/devices/SERIAL","body":{"name":"New Name"}}</action>
<action>{"method":"POST","path":"/networks/NET_ID/devices/claim","body":{"serials":["XXXX-XXXX-XXXX"]}}</action>
<action>{"method":"POST","path":"/networks/NET_ID/devices/remove","body":{"serial":"XXXX-XXXX-XXXX"}}</action>
<action>{"method":"DELETE","path":"/networks/NET_ID/appliance/vlans/VLAN_ID"}</action>
<action>{"method":"PUT","path":"/networks/NET_ID/firmwareUpgrades","body":{"upgradeWindow":{"dayOfWeek":"tue","hourOfDay":"2:00"}}}</action>
<action>{"method":"PUT","path":"/networks/NET_ID","body":{"name":"New Network Name","timeZone":"America/New_York"}}</action>
<action>{"method":"PUT","path":"/networks/NET_ID/appliance/firewall/l3FirewallRules","body":{"rules":[{"policy":"deny","protocol":"any","srcCidr":"any","srcPort":"any","destCidr":"any","destPort":"any","comment":"Default deny"}]}}</action>
<action>{"method":"PUT","path":"/networks/NET_ID/appliance/contentFiltering","body":{"blockedUrlCategories":[],"blockedUrlPatterns":[],"urlCategoryListSize":"fullList"}}</action>
<action>{"method":"PUT","path":"/networks/NET_ID/appliance/vpn/siteToSiteVpn","body":{"mode":"spoke","hubs":[]}}</action>
<action>{"method":"PUT","path":"/networks/NET_ID/appliance/trafficShaping/uplinkBandwidth","body":{"bandwidthLimits":{"wan1":{"limitUp":50000,"limitDown":100000}}}}</action>

IMPORTANT: To remove a device from a network, use POST /networks/NET_ID/devices/remove with {"serial":"..."} in the body. Do NOT try DELETE or PUT on /networks/NET_ID/devices/SERIAL — that endpoint does not exist.
To claim a device into a network, use POST /networks/NET_ID/devices/claim with {"serials":["..."]} in the body.

## ACTION RULES

DESTRUCTIVE actions (reboot, delete VLAN, remove device, change subnet, firewall rules, VPN config): ALWAYS ask for confirmation first.
Non-destructive actions (rename, enable/disable SSID, update settings): execute immediately.

VERIFICATION (CRITICAL):
- After EVERY action, verify the change by fetching the same endpoint. Do NOT tell the user something changed unless you confirmed it with a follow-up fetch.
- If action results contain "errors" or "_error", the action FAILED. Tell the user exactly what went wrong and suggest alternatives. Example: "That failed because the API key is read-only. The org admin needs to enable API write access in Dashboard > Organization > Settings."
- NEVER hallucinate success. If you attempted a change but cannot verify it, say: "I tried to make this change but couldn't confirm it went through. Let me check..."
- If you cannot perform something (API limitation, permission, unsupported endpoint), be upfront: "I can't do that because..." and explain why.
- If a fetch or action returns an error object, read the error message and relay it to the user in plain English.

## CONTEXT & NETWORK SCOPE

When given network data in <network_data> tags, that's the current device/network inventory. Use org IDs, network IDs, and device serials from there.

CRITICAL SCOPE RULE: If the context includes a "selectedNetwork" field, the user has selected a SPECIFIC network. You MUST only fetch/modify data for that network ID. Do NOT reference or fetch data from other networks — those requests will be blocked. If the user asks about something on a different network, tell them to switch networks first.

If "selectedNetwork" is absent, the user is viewing all networks and you can operate across all of them.

Keep responses SHORT. Answer then Suggest. That's it.`;

module.exports = async (req, res) => {
  const { applyRateLimit } = require('./_rateLimit');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (applyRateLimit(req, res, 'nokopilot', 20, 60000)) return;

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
    console.error('NokoPilot chat error:', err.message);
    res.status(500).json({ error: 'Chat failed: ' + err.message });
  }
};
