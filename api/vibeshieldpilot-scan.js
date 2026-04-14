const { applyRateLimit } = require('./_rateLimit');

const AGENT_ID = 'agent_011Ca1nwHde79Cu2d5MGwkcZ';
const ENV_ID = 'env_011P1s1hA79gF7ec23wTqtNh';

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limit: 5 scans per minute per IP
  if (applyRateLimit(req, res, 'vibeshieldpilot', 5, 60000)) return;

  var supabaseUrl = process.env.SUPABASE_URL;
  var supabaseAnon = process.env.SUPABASE_ANON_KEY;
  var serviceKey = process.env.SUPABASE_SERVICE_KEY;
  var apiKey = process.env.ANTHROPIC_API_KEY;

  // ── Auth ──────────────────────────────────────────────
  var authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.error('[SECURITY] Auth failure:', req.headers['x-forwarded-for'] || 'unknown');
    return res.status(401).json({ error: 'Not authenticated' });
  }
  var token = authHeader.split(' ')[1];

  var userRes = await fetch(supabaseUrl + '/auth/v1/user', {
    headers: { 'Authorization': 'Bearer ' + token, 'apikey': supabaseAnon },
  });
  if (!userRes.ok) {
    console.error('[SECURITY] Auth failure:', req.headers['x-forwarded-for'] || 'unknown');
    return res.status(401).json({ error: 'Invalid session' });
  }
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
    if (newBalance === -1) return res.status(402).json({ error: 'VibeShieldPilot requires 2 credits. You don\'t have enough.' });
    return res.status(200).json({ ok: true, remaining: newBalance, cost: 2 });
  }

  // ── Scan ──────────────────────────────────────────────
  if (action === 'scan') {
    var repoUrl = body.repoUrl;
    if (!repoUrl || typeof repoUrl !== 'string') {
      return res.status(400).json({ error: 'Missing repository URL.' });
    }

    // Strict URL validation — only github.com, prevent SSRF
    var cleanUrl = repoUrl.trim().replace(/\/+$/, '').split('?')[0].split('#')[0];
    var urlPattern = /^https:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
    if (!urlPattern.test(cleanUrl)) {
      return res.status(400).json({ error: 'Invalid URL. Must be a public GitHub repository (https://github.com/owner/repo).' });
    }

    // Balance check before expensive operation
    if (!isAdmin) {
      var balCheck = await fetch(
        supabaseUrl + '/rest/v1/profiles?id=eq.' + user.id + '&select=token_balance',
        { headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey } }
      );
      var balData = await balCheck.json();
      if ((balData[0]?.token_balance || 0) <= 0) {
        return res.status(402).json({ error: 'No credits remaining. Purchase more to continue.' });
      }
    }

    var agentHeaders = {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'managed-agents-2026-04-01',
      'content-type': 'application/json',
    };

    try {
      var repoName = cleanUrl.split('/').slice(-2).join('/');

      // 1. Create session (agent clones the repo itself via git)
      var sessionRes = await fetch('https://api.anthropic.com/v1/sessions', {
        method: 'POST',
        headers: agentHeaders,
        body: JSON.stringify({
          agent: AGENT_ID,
          environment_id: ENV_ID,
        }),
      });

      if (!sessionRes.ok) {
        var sessionErr = await sessionRes.text();
        console.error('Session create failed:', sessionRes.status, sessionErr);
        var errDetail = '';
        try { var parsed = JSON.parse(sessionErr); errDetail = parsed.error && parsed.error.message ? ': ' + parsed.error.message : ''; } catch(e) {}
        return res.status(500).json({ error: 'Failed to create scan session (HTTP ' + sessionRes.status + ')' + errDetail });
      }

      var session = await sessionRes.json();
      var sessionId = session.id;

      // 2. Set SSE headers for streaming to client
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      function sendEvent(data) {
        res.write('data: ' + JSON.stringify(data) + '\n\n');
      }

      sendEvent({ type: 'session_created', sessionId: sessionId, repo: repoName });

      // 3. Send kickoff message
      var kickoffRes = await fetch('https://api.anthropic.com/v1/sessions/' + sessionId + '/events', {
        method: 'POST',
        headers: agentHeaders,
        body: JSON.stringify({
          events: [{
            type: 'user.message',
            content: [{
              type: 'text',
              text: 'First, clone this public GitHub repository: git clone ' + cleanUrl + ' /workspace/repo\n\nThen perform a complete security audit of /workspace/repo (' + repoName + '). Follow your full 3-phase process: PHASE 1 RECONNAISSANCE, then PHASE 2 THREAT ANALYSIS (all 14 categories), then PHASE 3 SECURITY SCORECARD. Clearly label each phase and category as you analyze them. Be thorough — check every file.',
            }],
          }],
        }),
      });

      if (!kickoffRes.ok) {
        sendEvent({ type: 'error', message: 'Failed to start scan.' });
        res.end();
        return;
      }

      sendEvent({ type: 'scan_started' });

      // 4. Stream events from the managed agent session
      var streamRes = await fetch('https://api.anthropic.com/v1/sessions/' + sessionId + '/stream', {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'managed-agents-2026-04-01',
          'Accept': 'text/event-stream',
        },
      });

      if (!streamRes.ok) {
        sendEvent({ type: 'error', message: 'Failed to connect to scan stream.' });
        res.end();
        return;
      }

      var reader = streamRes.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';
      var streamDone = false;

      while (!streamDone) {
        var chunk = await reader.read();
        if (chunk.done) { streamDone = true; break; }

        buffer += decoder.decode(chunk.value, { stream: true });
        var parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (var i = 0; i < parts.length; i++) {
          var part = parts[i].trim();
          if (!part) continue;

          var dataMatch = part.match(/^data:\s*(.+)$/m);
          if (!dataMatch) continue;

          try {
            var evt = JSON.parse(dataMatch[1]);

            if (evt.type === 'agent.message') {
              // Per docs: agent.message has .content[] array of blocks
              var content = '';
              var contentArr = evt.content || (evt.agent_message && evt.agent_message.content);
              if (typeof contentArr === 'string') {
                content = contentArr;
              } else if (Array.isArray(contentArr)) {
                content = contentArr.filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text || ''; }).join('');
              } else if (contentArr) {
                content = JSON.stringify(contentArr);
              }
              if (content) sendEvent({ type: 'message', content: content });
            } else if (evt.type === 'agent.tool_use') {
              // Per docs: agent.tool_use has .name and .input at top level
              var toolName = evt.name || (evt.tool_use && evt.tool_use.name) || '';
              var toolInput = evt.input || (evt.tool_use && evt.tool_use.input) || {};
              var inputSummary = {};
              if (typeof toolInput.command === 'string') inputSummary.command = toolInput.command.substring(0, 300);
              else if (typeof toolInput.path === 'string') inputSummary.path = toolInput.path;
              else if (typeof toolInput.pattern === 'string') inputSummary.pattern = toolInput.pattern;
              else if (typeof toolInput.file_path === 'string') inputSummary.path = toolInput.file_path;
              sendEvent({ type: 'tool_use', tool: toolName, input: inputSummary });
            } else if (evt.type === 'session.status_idle') {
              sendEvent({ type: 'scan_complete' });
              streamDone = true;
              break;
            } else if (evt.type === 'session.status_terminated') {
              sendEvent({ type: 'terminated', message: 'Scan session ended unexpectedly.' });
              streamDone = true;
              break;
            }
          } catch (e) {
            // Parse error — skip
          }
        }
      }

      // 5. Fetch output files (security scorecard HTML)
      try {
        var filesRes = await fetch('https://api.anthropic.com/v1/files?scope=' + sessionId, {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'managed-agents-2026-04-01',
          },
        });

        if (filesRes.ok) {
          var filesData = await filesRes.json();
          if (filesData.data && filesData.data.length > 0) {
            var scorecard = null;
            for (var f = 0; f < filesData.data.length; f++) {
              var file = filesData.data[f];
              var fname = (file.name || '') + (file.path || '');
              if (fname.indexOf('scorecard') !== -1 || fname.indexOf('.html') !== -1) {
                scorecard = file;
                break;
              }
            }
            if (!scorecard) scorecard = filesData.data[0];

            if (scorecard) {
              var contentRes = await fetch('https://api.anthropic.com/v1/files/' + scorecard.id + '/content', {
                headers: {
                  'x-api-key': apiKey,
                  'anthropic-version': '2023-06-01',
                  'anthropic-beta': 'managed-agents-2026-04-01',
                },
              });
              if (contentRes.ok) {
                var reportHtml = await contentRes.text();
                sendEvent({ type: 'report', html: reportHtml });
              }
            }
          }
        }
      } catch (filesErr) {
        console.error('Failed to fetch output files:', filesErr.message);
      }

      // 6. Log usage
      try {
        await fetch(supabaseUrl + '/rest/v1/usage_log', {
          method: 'POST',
          headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify({ user_id: user.id, prompt: 'VibeShieldPilot: ' + cleanUrl.substring(0, 200) }),
        });
      } catch (e) {}

      // 7. Archive session
      try {
        await fetch('https://api.anthropic.com/v1/sessions/' + sessionId + '/archive', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'managed-agents-2026-04-01',
          },
        });
      } catch (e) {}

      sendEvent({ type: 'done' });
      res.end();

    } catch (err) {
      console.error('VibeShieldPilot scan error:', err.message);
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Scan failed: ' + err.message });
      }
      try { res.write('data: ' + JSON.stringify({ type: 'error', message: err.message }) + '\n\n'); } catch (e) {}
      res.end();
    }
    return;
  }

  return res.status(400).json({ error: 'Invalid action. Expected start_conversation or scan.' });
};
