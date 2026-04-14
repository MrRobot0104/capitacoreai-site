const { applyRateLimit } = require('./_rateLimit');

module.exports = async function handler(req, res) {
  var allowedOrigins = ['https://capitacoreai.io', 'https://www.capitacoreai.io'];
  var origin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', allowedOrigins.includes(origin) ? origin : 'https://capitacoreai.io');
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

  // ── Scan ──────────────────────────────────────────────
  if (action === 'scan') {
    var repoUrl = body.repoUrl;
    if (!repoUrl || typeof repoUrl !== 'string') {
      return res.status(400).json({ error: 'Missing repository URL.' });
    }

    var cleanUrl = repoUrl.trim().replace(/\/+$/, '').split('?')[0].split('#')[0];
    if (!/^https:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(cleanUrl)) {
      return res.status(400).json({ error: 'Invalid URL. Must be a public GitHub repo.' });
    }

    // VibeShieldPilot is free — no credit check needed
    // Auth is still required (user must be logged in)

    try {
      var parts = cleanUrl.replace('https://github.com/', '').split('/');
      var owner = parts[0];
      var repo = parts[1];

      // ── 1. Fetch repo tree from GitHub API ──────────────
      // Try HEAD first, then main, then master
      var treeRes = null;
      var refs = ['HEAD', 'main', 'master'];
      for (var ri = 0; ri < refs.length; ri++) {
        treeRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/git/trees/' + refs[ri] + '?recursive=1', {
          headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'VibeShieldPilot' },
        });
        if (treeRes.ok) break;
      }

      if (!treeRes || !treeRes.ok) {
        return res.status(400).json({ error: 'Could not access repository. It may be private, not exist, or GitHub may be rate-limiting. Try again in a minute.' });
      }

      var treeData = await treeRes.json();
      var files = (treeData.tree || []).filter(function(f) { return f.type === 'blob'; });

      // Filter to code files only — skip images, fonts, lockfiles, minified bundles
      var codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.rb', '.go', '.rs', '.java', '.php', '.cs', '.swift', '.kt', '.vue', '.svelte', '.html', '.css', '.scss', '.json', '.yaml', '.yml', '.toml', '.env', '.sql', '.sh', '.bash', '.zsh', '.dockerfile', '.tf', '.hcl', '.xml', '.graphql', '.prisma', '.sol'];
      var skipPatterns = ['node_modules/', 'vendor/', 'dist/', 'build/', 'dashboards/', '.min.js', '.min.css', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'leaflet.js', 'leaflet.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.mp3', '.zip', '.tar', '.gz', '.pdf', '.DS_Store'];

      var codeFiles = files.filter(function(f) {
        var path = f.path.toLowerCase();
        if (skipPatterns.some(function(p) { return path.includes(p); })) return false;
        if (f.size > 50000) return false; // Skip files > 50KB
        return codeExtensions.some(function(ext) { return path.endsWith(ext); }) ||
               path === '.env' || path === '.env.example' || path === 'dockerfile' ||
               path.endsWith('.config.js') || path.endsWith('.config.ts');
      });

      // Prioritize: API/backend files first, then JS, then config, then HTML last
      codeFiles.sort(function(a, b) {
        var priority = function(p) {
          if (p.startsWith('api/')) return 0;
          if (p.endsWith('.sql')) return 1;
          if (p.endsWith('.env') || p.includes('.env.')) return 2;
          if (p.endsWith('.json') || p.endsWith('.yml') || p.endsWith('.yaml')) return 3;
          if (p.startsWith('js/') || p.endsWith('.js') || p.endsWith('.ts')) return 4;
          if (p.endsWith('.html')) return 8;
          if (p.endsWith('.css')) return 9;
          return 5;
        };
        return priority(a.path.toLowerCase()) - priority(b.path.toLowerCase());
      });

      // Limit to 40 files — prioritized order ensures API/JS scanned first
      if (codeFiles.length > 40) codeFiles = codeFiles.slice(0, 40);

      // ── 2. Fetch file contents in parallel ──────────────
      var fileContents = [];
      var totalChars = 0;
      var maxTotalChars = 80000; // ~20K tokens — leaves room for Claude's response

      var batches = [];
      for (var b = 0; b < codeFiles.length; b += 10) {
        batches.push(codeFiles.slice(b, b + 10));
      }

      for (var bi = 0; bi < batches.length; bi++) {
        if (totalChars >= maxTotalChars) break;
        var batchResults = await Promise.all(batches[bi].map(function(f) {
          return fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + f.path, {
            headers: { 'Accept': 'application/vnd.github.v3.raw', 'User-Agent': 'VibeShieldPilot' },
          }).then(function(r) {
            if (!r.ok) return { path: f.path, content: '(failed to fetch)', size: 0 };
            return r.text().then(function(text) {
              return { path: f.path, content: text, size: text.length };
            });
          }).catch(function() {
            return { path: f.path, content: '(failed to fetch)', size: 0 };
          });
        }));

        for (var ri = 0; ri < batchResults.length; ri++) {
          var file = batchResults[ri];
          if (totalChars + file.size > maxTotalChars) {
            file.content = file.content.substring(0, maxTotalChars - totalChars) + '\n...(truncated)';
            fileContents.push(file);
            totalChars = maxTotalChars;
            break;
          }
          fileContents.push(file);
          totalChars += file.size;
        }
      }

      // ── 3. Build the codebase document ──────────────────
      var fileTree = files.map(function(f) { return f.path; }).join('\n');
      var codeDoc = fileContents.map(function(f) {
        return '=== FILE: ' + f.path + ' ===\n' + f.content;
      }).join('\n\n');

      // ── 4. Call Claude for security audit ───────────────
      var systemPrompt = `You are VibeShieldPilot, an elite cybersecurity auditor built by CapitaCoreAI. You analyze codebases and produce security scorecards.

You will receive a complete codebase (file tree + file contents). Analyze EVERY file for vulnerabilities.

## OUTPUT FORMAT — You MUST respond with valid JSON only. No markdown, no text before or after.

{
  "grade": "A|B|C|D|F",
  "summary": "2-3 sentence executive summary",
  "stats": { "total": 0, "critical": 0, "high": 0, "medium": 0, "low": 0 },
  "techStack": ["React", "Node.js", "Supabase"],
  "categories": [
    {
      "name": "Secrets & Exposure",
      "status": "pass|warn|fail",
      "findings": [
        { "severity": "CRITICAL|HIGH|MEDIUM|LOW", "file": "path/to/file.js", "line": 42, "title": "Short title", "description": "What's wrong", "fix": "How to fix it with code example" }
      ]
    }
  ],
  "topFixes": [
    { "priority": 1, "title": "Fix this first", "description": "Why and how" }
  ]
}

## CATEGORIES TO CHECK (all 14):
1. Secrets & Exposure — hardcoded keys, .env committed, service keys in client code
2. Authentication — missing auth on endpoints, weak JWT, no brute-force protection
3. Authorization (IDOR) — user A accessing user B data, missing ownership checks, broken RLS
4. Injection — SQL/NoSQL/command injection, template injection, path traversal
5. Cross-Site Scripting — innerHTML with user input, unescaped AI output, DOM XSS
6. API Security — no rate limiting, CORS *, SSRF, mass assignment, verbose errors
7. Data Protection — PII in plaintext, missing encryption, insecure cookies
8. CSRF — missing tokens, SameSite issues
9. File Upload — no type validation, no size limits, path traversal in filenames
10. Dependencies — known CVEs, outdated packages, missing lockfile
11. Infrastructure & Config — debug mode in prod, missing security headers, default creds
12. Business Logic — race conditions, price manipulation, account enumeration
13. Denial of Service — ReDoS, unbound loops, missing pagination
14. Logging & Monitoring — no audit trail, secrets in logs

## GRADING:
A = 0 critical, 0 high, ≤2 medium
B = 0 critical, ≤2 high, ≤5 medium
C = 0 critical, ≤5 high
D = 1-2 critical OR >5 high
F = 3+ critical

Be thorough. Show exact file paths and line numbers. Think like a bug bounty hunter.`;

      var userMessage = 'Scan this repository: ' + owner + '/' + repo + '\n\n## FILE TREE\n' + fileTree + '\n\n## FILE CONTENTS\n' + codeDoc;

      var claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 8000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        }),
      });

      if (!claudeRes.ok) {
        var claudeErr = await claudeRes.text();
        console.error('Claude API error:', claudeRes.status, claudeErr.substring(0, 200));
        return res.status(500).json({ error: 'AI analysis failed. Try again.' });
      }

      var claudeData = await claudeRes.json();
      var responseText = claudeData.content
        .filter(function(b) { return b.type === 'text'; })
        .map(function(b) { return b.text; })
        .join('');

      // Parse JSON from response — handle markdown fences, preamble text, etc.
      var scanResult;
      // Strip markdown code fences
      var jsonStr = responseText.replace(/^```(?:json)?\s*\n?/gm, '').replace(/\n?```\s*$/gm, '').trim();

      // Try parsing the cleaned string directly
      try {
        scanResult = JSON.parse(jsonStr);
      } catch (e) {
        // Try extracting the outermost JSON object
        var startIdx = jsonStr.indexOf('{');
        var endIdx = jsonStr.lastIndexOf('}');
        if (startIdx !== -1 && endIdx > startIdx) {
          try {
            scanResult = JSON.parse(jsonStr.substring(startIdx, endIdx + 1));
          } catch (e2) {
            console.error('JSON parse failed:', e2.message, 'Raw:', responseText.substring(0, 300));
            return res.status(500).json({ error: 'Failed to parse scan results. The AI response may have been too large. Try a smaller repo.' });
          }
        } else {
          console.error('No JSON found in response. Raw:', responseText.substring(0, 300));
          return res.status(500).json({ error: 'Failed to parse scan results.' });
        }
      }

      // Add metadata
      scanResult.repo = owner + '/' + repo;
      scanResult.filesScanned = fileContents.length;
      scanResult.totalFiles = files.length;
      scanResult.scannedAt = new Date().toISOString();

      // Log usage
      fetch(supabaseUrl + '/rest/v1/usage_log', {
        method: 'POST',
        headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ user_id: user.id, prompt: 'VibeShieldPilot: ' + cleanUrl.substring(0, 200) }),
      }).catch(function() {});

      return res.status(200).json(scanResult);

    } catch (err) {
      console.error('VibeShieldPilot error:', err.message);
      return res.status(500).json({ error: 'Scan failed. Please try again.' });
    }
  }

  return res.status(400).json({ error: 'Invalid action.' });
};
