const { applyRateLimit } = require('./_rateLimit');

const AGENT_ID = 'agent_011Ca1nwHde79Cu2d5MGwkcZ';
const ENV_ID = 'env_01XMHEozPMWKn1whmws4czfk';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (applyRateLimit(req, res, 'vibeshieldpilot', 5, 60000)) return;

  var supabaseUrl = process.env.SUPABASE_URL;
  var supabaseAnon = process.env.SUPABASE_ANON_KEY;
  var serviceKey = process.env.SUPABASE_SERVICE_KEY;
  var apiKey = process.env.ANTHROPIC_API_KEY;

  // ── Auth ──────────────────────────────────────────────
  var authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  var token = authHeader.split(' ')[1];
  var userRes = await fetch(supabaseUrl + '/auth/v1/user', {
    headers: { 'Authorization': 'Bearer ' + token, 'apikey': supabaseAnon },
  });
  if (!userRes.ok) return res.status(401).json({ error: 'Invalid session' });
  var user = await userRes.json();

  var adminCheck = await fetch(
    supabaseUrl + '/rest/v1/profiles?id=eq.' + user.id + '&select=is_admin,token_balance',
    { headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey } }
  );
  var adminData = await adminCheck.json();
  var isAdmin = adminData[0]?.is_admin === true;

  var body = req.body || {};
  var action = body.action;

  // ── Credit deduction ──────────────────────────────────
  if (action === 'start_conversation') {
    if (isAdmin) return res.status(200).json({ ok: true, remaining: 9999, cost: 2 });
    var deductRes = await fetch(supabaseUrl + '/rest/v1/rpc/deduct_credits', {
      method: 'POST',
      headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_uuid: user.id, amount: 2 }),
    });
    if (!deductRes.ok) {
      var fallbackRes = await fetch(supabaseUrl + '/rest/v1/rpc/deduct_token', {
        method: 'POST',
        headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_uuid: user.id }),
      });
      if (!fallbackRes.ok) return res.status(500).json({ error: 'Failed to check credits' });
      var fb = await fallbackRes.json();
      if (fb === -1) return res.status(402).json({ error: 'No credits remaining.' });
      return res.status(200).json({ ok: true, remaining: fb, cost: 1 });
    }
    var newBalance = await deductRes.json();
    if (newBalance === -1) return res.status(402).json({ error: 'Not enough credits.' });
    return res.status(200).json({ ok: true, remaining: newBalance, cost: 2 });
  }

  // ── Start scan — create session, send kickoff, return session ID ──
  if (action === 'scan') {
    var repoUrl = body.repoUrl;
    if (!repoUrl || typeof repoUrl !== 'string') {
      return res.status(400).json({ error: 'Missing repository URL.' });
    }

    var cleanUrl = repoUrl.trim().replace(/\/+$/, '').split('?')[0].split('#')[0];
    if (!/^https:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(cleanUrl)) {
      return res.status(400).json({ error: 'Invalid URL. Must be a public GitHub repo.' });
    }

    var agentHeaders = {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'managed-agents-2026-04-01',
      'content-type': 'application/json',
    };

    try {
      var repoName = cleanUrl.split('/').slice(-2).join('/');

      // Create session
      var sessionRes = await fetch('https://api.anthropic.com/v1/sessions', {
        method: 'POST',
        headers: agentHeaders,
        body: JSON.stringify({ agent: AGENT_ID, environment_id: ENV_ID }),
      });

      if (!sessionRes.ok) {
        var sessionErr = await sessionRes.text();
        var errDetail = '';
        try { errDetail = ': ' + JSON.parse(sessionErr).error.message; } catch(e) {}
        return res.status(500).json({ error: 'Session creation failed' + errDetail });
      }

      var session = await sessionRes.json();

      // Send kickoff message
      var kickoffRes = await fetch('https://api.anthropic.com/v1/sessions/' + session.id + '/events', {
        method: 'POST',
        headers: agentHeaders,
        body: JSON.stringify({
          events: [{
            type: 'user.message',
            content: [{ type: 'text', text: 'Clone this repo: git clone ' + cleanUrl + ' /workspace/repo\n\nThen perform a full security audit of /workspace/repo (' + repoName + '). Follow your 3-phase process. Be thorough.' }],
          }],
        }),
      });

      if (!kickoffRes.ok) {
        return res.status(500).json({ error: 'Failed to send scan command.' });
      }

      // Log usage
      fetch(supabaseUrl + '/rest/v1/usage_log', {
        method: 'POST',
        headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ user_id: user.id, prompt: 'VibeShieldPilot: ' + cleanUrl.substring(0, 200) }),
      }).catch(function() {});

      // Return session ID — frontend polls for events
      return res.status(200).json({ sessionId: session.id, repo: repoName });

    } catch (err) {
      return res.status(500).json({ error: 'Scan failed: ' + err.message });
    }
  }

  // ── Poll events — lightweight endpoint for client-side polling ──
  if (action === 'poll') {
    var sessionId = body.sessionId;
    if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });

    var agHeaders = {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'managed-agents-2026-04-01',
      'content-type': 'application/json',
    };

    try {
      var pollRes = await fetch('https://api.anthropic.com/v1/sessions/' + sessionId + '/events?limit=100&order=asc', {
        method: 'GET',
        headers: agHeaders,
      });

      if (!pollRes.ok) {
        var pollErr = await pollRes.text().catch(function() { return ''; });
        return res.status(pollRes.status).json({ error: 'Poll failed: ' + pollErr.substring(0, 200) });
      }

      var eventsData = await pollRes.json();
      return res.status(200).json(eventsData);

    } catch (err) {
      return res.status(500).json({ error: 'Poll error: ' + err.message });
    }
  }

  return res.status(400).json({ error: 'Invalid action.' });
};
