// ── State ────────────────────────────────────────────────
var CREDIT_COST = 2;
var currentUser = null;
var creditBalance = 0;
var isAdmin = false;
var scanPhase = 'idle'; // idle, connecting, phase1, phase2, phase3, complete
var reportHtml = null;
var abortController = null;

// Category definitions — order matches the agent's system prompt
var CATEGORIES = [
  { id: 'secrets', name: 'Secrets & Exposure', keywords: ['secret', 'hardcoded', 'api key', 'credential', 'exposure', 'leaked', '.env'] },
  { id: 'auth', name: 'Authentication', keywords: ['authentication', 'jwt', 'login', 'password', 'brute-force', 'session token'] },
  { id: 'authz', name: 'Authorization (IDOR)', keywords: ['authorization', 'idor', 'access control', 'privilege', 'rls', 'ownership'] },
  { id: 'injection', name: 'Injection Attacks', keywords: ['injection', 'sql injection', 'command injection', 'nosql', 'ldap', 'xxe', 'template injection'] },
  { id: 'xss', name: 'Cross-Site Scripting', keywords: ['xss', 'innerhtml', 'cross-site scripting', 'dangerouslysetinnerhtml', 'v-html', 'document.write'] },
  { id: 'api', name: 'API Security', keywords: ['api security', 'rate limit', 'cors', 'ssrf', 'mass assignment', 'graphql'] },
  { id: 'data', name: 'Data Protection', keywords: ['data protection', 'encryption', 'pii', 'sensitive data', 'cookie', 'localstorage'] },
  { id: 'csrf', name: 'CSRF', keywords: ['csrf', 'cross-site request forgery', 'samesite'] },
  { id: 'upload', name: 'File Upload & Handling', keywords: ['file upload', 'file type', 'file size', 'imagetragick'] },
  { id: 'deps', name: 'Dependencies & Supply Chain', keywords: ['dependencies', 'cve', 'outdated', 'vulnerable package', 'supply chain', 'lockfile'] },
  { id: 'config', name: 'Infrastructure & Config', keywords: ['infrastructure', 'configuration', 'debug mode', 'security headers', 'default credential', 'hsts'] },
  { id: 'logic', name: 'Business Logic Flaws', keywords: ['business logic', 'race condition', 'price manipulation', 'coupon', 'enumeration'] },
  { id: 'dos', name: 'Denial of Service', keywords: ['denial of service', 'redos', 'unbound loop', 'pagination'] },
  { id: 'logging', name: 'Logging & Monitoring', keywords: ['logging', 'monitoring', 'audit trail', 'alerting'] },
];

var categoryStatuses = {}; // { id: 'pending'|'scanning'|'done' }
var currentScanningCategory = null;
var severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };

// ── DOM refs ────────────────────────────────────────────
var $ = function(id) { return document.getElementById(id); };

// ── Helpers ─────────────────────────────────────────────
function escapeHtml(t) { var d = document.createElement('div'); d.textContent = t || ''; return d.innerHTML; }

function refreshCredits() {
  if (!currentUser) return;
  sb.from('profiles').select('token_balance, is_admin').eq('id', currentUser.id).single().then(function(r) {
    if (r.data) {
      creditBalance = r.data.token_balance || 0;
      isAdmin = r.data.is_admin === true;
      $('creditDisplay').textContent = isAdmin ? '\u221E' : creditBalance;
    }
  });
}

// ── Auth ─────────────────────────────────────────────────
(function initAuth() {
  var initDone = false;
  sb.auth.getSession().then(function(result) {
    var session = result.data.session;
    if (!session) {
      setTimeout(function() {
        sb.auth.getSession().then(function(r2) {
          if (!r2.data.session) window.location.href = 'account.html';
          else { currentUser = r2.data.session.user; refreshCredits(); initDone = true; }
        });
      }, 1000);
    } else {
      currentUser = session.user;
      refreshCredits();
      initDone = true;
    }
  });

  sb.auth.onAuthStateChange(function(event, session) {
    if (event === 'SIGNED_IN' && session && !initDone) {
      currentUser = session.user;
      refreshCredits();
      initDone = true;
    } else if (event === 'SIGNED_OUT') {
      window.location.href = 'account.html';
    }
  });
})();

// ── Build category list UI ──────────────────────────────
function buildCategoryList() {
  var html = '';
  for (var i = 0; i < CATEGORIES.length; i++) {
    var cat = CATEGORIES[i];
    categoryStatuses[cat.id] = 'pending';
    html += '<div class="category-row" id="cat-' + cat.id + '">' +
      '<div class="cat-status-dot"></div>' +
      '<span class="cat-name">' + escapeHtml(cat.name) + '</span>' +
      '<span class="cat-status-text">Pending</span>' +
      '<span class="cat-findings"></span>' +
      '</div>';
  }
  $('categoryList').innerHTML = html;
}
buildCategoryList();

// ── Phase management ────────────────────────────────────
function setPhase(phase) {
  scanPhase = phase;

  // Phase progress dots
  var phases = ['phase1', 'phase2', 'phase3'];
  var phaseIndex = phases.indexOf(phase);
  if (phase === 'complete') phaseIndex = 3;

  for (var i = 1; i <= 3; i++) {
    var step = $('phaseStep' + i);
    var dot = $('phaseDot' + i);
    step.className = 'phase-step';
    dot.className = 'phase-dot';
    if (i - 1 < phaseIndex) { step.classList.add('done'); dot.classList.add('done'); dot.innerHTML = '\u2713'; }
    else if (i - 1 === phaseIndex && phase !== 'complete') { step.classList.add('active'); dot.classList.add('active'); }
  }
  for (var j = 1; j <= 2; j++) {
    $('phaseLine' + j).className = 'phase-line' + (j <= phaseIndex ? ' done' : '');
  }

  // Phase cards
  var cards = ['phase1Card', 'phase2Card', 'phase3Card'];
  for (var k = 0; k < cards.length; k++) {
    var card = $(cards[k]);
    card.className = 'phase-card';
    if (k < phaseIndex) card.classList.add('done');
    else if (k === phaseIndex && phase !== 'complete') card.classList.add('active');
    if (phase === 'complete') card.classList.add('done');
  }

  // Badges
  $('phase1Badge').textContent = phaseIndex > 0 ? 'Complete' : (phaseIndex === 0 ? 'Scanning...' : '');
  $('phase1Badge').className = 'phase-badge' + (phaseIndex > 0 ? ' complete' : (phaseIndex === 0 ? ' scanning' : ''));
  $('phase2Badge').textContent = phaseIndex > 1 ? 'Complete' : (phaseIndex === 1 ? 'Scanning...' : '');
  $('phase2Badge').className = 'phase-badge' + (phaseIndex > 1 ? ' complete' : (phaseIndex === 1 ? ' scanning' : ''));
  $('phase3Badge').textContent = phase === 'complete' ? 'Complete' : (phaseIndex === 2 ? 'Generating...' : '');
  $('phase3Badge').className = 'phase-badge' + (phase === 'complete' ? ' complete' : (phaseIndex === 2 ? ' scanning' : ''));
}

function updateCategory(id, status) {
  var row = document.getElementById('cat-' + id);
  if (!row) return;
  categoryStatuses[id] = status;
  row.className = 'category-row' + (status === 'scanning' ? ' scanning' : '') + (status === 'done' ? ' done' : '');
  var statusText = row.querySelector('.cat-status-text');
  if (status === 'scanning') statusText.textContent = 'Scanning...';
  else if (status === 'done') statusText.textContent = 'Complete';
}

function setCategoryScanning(id) {
  // Mark previous scanning category as done
  if (currentScanningCategory && currentScanningCategory !== id) {
    updateCategory(currentScanningCategory, 'done');
  }
  currentScanningCategory = id;
  updateCategory(id, 'scanning');
}

// ── Console ─────────────────────────────────────────────
function addConsoleLine(text, cls) {
  var inner = $('consoleInner');
  var line = document.createElement('div');
  line.className = 'console-line';
  line.innerHTML = '<span class="' + (cls || 'msg') + '">' + escapeHtml(text) + '</span>';
  inner.appendChild(line);
  inner.scrollTop = inner.scrollHeight;
}

// ── Event handling ──────────────────────────────────────
function detectPhase(text) {
  var lower = text.toLowerCase();
  if (lower.indexOf('phase 1') !== -1 || lower.indexOf('reconnaissance') !== -1) return 'phase1';
  if (lower.indexOf('phase 2') !== -1 || lower.indexOf('threat') !== -1) return 'phase2';
  if (lower.indexOf('phase 3') !== -1 || lower.indexOf('scorecard') !== -1) return 'phase3';
  return null;
}

function detectCategory(text) {
  var lower = text.toLowerCase();
  for (var i = 0; i < CATEGORIES.length; i++) {
    var cat = CATEGORIES[i];
    for (var j = 0; j < cat.keywords.length; j++) {
      if (lower.indexOf(cat.keywords[j]) !== -1) return cat.id;
    }
  }
  return null;
}

function detectGrade(text) {
  var m = text.match(/(?:overall|grade|security)[:\s]*([A-F])\b/i);
  if (m) return m[1].toUpperCase();
  // Also look for standalone grade patterns
  m = text.match(/\bgrade[:\s]+([A-F])\b/i);
  if (m) return m[1].toUpperCase();
  return null;
}

function extractNumbers(text) {
  // Try to find severity counts in text
  var lower = text.toLowerCase();
  var m;
  m = lower.match(/(\d+)\s*critical/);
  if (m) severityCounts.critical = Math.max(severityCounts.critical, parseInt(m[1]));
  m = lower.match(/(\d+)\s*high/);
  if (m) severityCounts.high = Math.max(severityCounts.high, parseInt(m[1]));
  m = lower.match(/(\d+)\s*medium/);
  if (m) severityCounts.medium = Math.max(severityCounts.medium, parseInt(m[1]));
  m = lower.match(/(\d+)\s*low/);
  if (m) severityCounts.low = Math.max(severityCounts.low, parseInt(m[1]));
}

function extractReconStats(text) {
  var lower = text.toLowerCase();
  var m;
  m = text.match(/(\d+)\s*(?:files?|source files?)/i);
  if (m && $('reconFiles').textContent === '--') $('reconFiles').textContent = m[1];
  m = text.match(/(\d+)\s*(?:api )?endpoints?/i);
  if (m && $('reconEndpoints').textContent === '--') $('reconEndpoints').textContent = m[1];
  m = text.match(/(\d+)\s*auth(?:entication)?\s*flows?/i);
  if (m && $('reconAuthFlows').textContent === '--') $('reconAuthFlows').textContent = m[1];

  // Tech stack detection
  var stacks = [];
  var stackKeywords = ['react', 'next.js', 'nextjs', 'vue', 'angular', 'svelte', 'node', 'express', 'fastify', 'django', 'flask', 'rails', 'laravel', 'supabase', 'firebase', 'mongodb', 'postgresql', 'mysql', 'redis', 'vercel', 'netlify', 'aws', 'docker', 'tailwind', 'typescript'];
  for (var i = 0; i < stackKeywords.length; i++) {
    if (lower.indexOf(stackKeywords[i]) !== -1) stacks.push(stackKeywords[i]);
  }
  if (stacks.length > 0) {
    var details = $('reconDetails');
    if (!details.querySelector('.recon-row')) {
      var row = document.createElement('div');
      row.className = 'recon-row';
      row.innerHTML = '<span class="label">Tech Stack</span><span class="value">' + escapeHtml(stacks.join(', ')) + '</span>';
      details.appendChild(row);
    }
  }
}

function handleEvent(data) {
  if (data.type === 'session_created') {
    addConsoleLine('Session created for ' + (data.repo || 'repository'), 'ok');
  } else if (data.type === 'scan_started') {
    addConsoleLine('Scan initiated — agent is working...', 'ok');
    setPhase('phase1');
  } else if (data.type === 'message') {
    var content = data.content || '';
    addConsoleLine(content.substring(0, 150), 'msg');

    // Phase detection
    var phase = detectPhase(content);
    if (phase && scanPhase !== phase) setPhase(phase);

    // Category detection (Phase 2)
    if (scanPhase === 'phase2') {
      var cat = detectCategory(content);
      if (cat) setCategoryScanning(cat);
    }

    // Recon stats (Phase 1)
    if (scanPhase === 'phase1') extractReconStats(content);

    // Grade & severity counts (Phase 3)
    if (scanPhase === 'phase3' || scanPhase === 'phase2') {
      var grade = detectGrade(content);
      if (grade) showGrade(grade);
      extractNumbers(content);
      updateSeverityDisplay();
    }
  } else if (data.type === 'tool_use') {
    var toolText = '$ ' + (data.tool || 'tool');
    if (data.input && data.input.command) toolText += ': ' + data.input.command;
    else if (data.input && data.input.path) toolText += ': ' + data.input.path;
    else if (data.input && data.input.pattern) toolText += ': ' + data.input.pattern;
    addConsoleLine(toolText, 'cmd');
  } else if (data.type === 'scan_complete') {
    addConsoleLine('Scan complete.', 'ok');
    // Mark all remaining categories as done
    if (currentScanningCategory) updateCategory(currentScanningCategory, 'done');
    for (var id in categoryStatuses) {
      if (categoryStatuses[id] !== 'done') updateCategory(id, 'done');
    }
    setPhase('complete');
  } else if (data.type === 'report') {
    reportHtml = data.html;
    addConsoleLine('Security scorecard report received.', 'ok');
    $('viewReportBtn').style.display = 'inline-flex';
    $('downloadReportBtn').style.display = 'inline-flex';
    $('downloadBtn').style.display = 'inline-flex';
  } else if (data.type === 'terminated') {
    addConsoleLine('Session terminated: ' + (data.message || 'unknown'), 'err');
    finishScan();
  } else if (data.type === 'error') {
    addConsoleLine('Error: ' + (data.message || 'unknown'), 'err');
  } else if (data.type === 'done') {
    addConsoleLine('Done.', 'ok');
    finishScan();
  }
}

function showGrade(grade) {
  var el = $('gradeReveal');
  el.textContent = grade;
  el.className = 'grade-reveal grade-' + grade + ' visible';
}

function updateSeverityDisplay() {
  $('sevCritical').textContent = severityCounts.critical + ' Critical';
  $('sevHigh').textContent = severityCounts.high + ' High';
  $('sevMedium').textContent = severityCounts.medium + ' Medium';
  $('sevLow').textContent = severityCounts.low + ' Low';
}

function finishScan() {
  var scanBtn = $('scanBtn');
  scanBtn.classList.remove('loading');
  scanBtn.disabled = false;
  $('newScanBtn').style.display = 'inline-flex';
  if (scanPhase !== 'complete') setPhase('complete');
  refreshCredits();
}

// ── Scan ─────────────────────────────────────────────────
async function startScan() {
  var url = $('repoUrlInput').value.trim();
  if (!url) { alert('Please enter a GitHub repository URL.'); return; }

  // Basic client-side validation
  var cleanUrl = url.replace(/\/+$/, '').split('?')[0].split('#')[0];
  if (!/^https:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(cleanUrl)) {
    alert('Invalid URL. Please enter a valid public GitHub URL (https://github.com/owner/repo).');
    return;
  }

  // Get session token
  var sessionResult = await sb.auth.getSession();
  var session = sessionResult.data.session;
  if (!session) { alert('Please log in to continue.'); window.location.href = 'account.html'; return; }

  var scanBtn = $('scanBtn');
  scanBtn.disabled = true;
  scanBtn.classList.add('loading');

  // VibeShieldPilot is free — no credit deduction needed

  // Reset state
  reportHtml = null;
  severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  currentScanningCategory = null;
  buildCategoryList();
  $('reconFiles').textContent = '--';
  $('reconEndpoints').textContent = '--';
  $('reconAuthFlows').textContent = '--';
  $('reconDetails').innerHTML = '';
  $('gradeReveal').className = 'grade-reveal';
  $('gradeReveal').textContent = '?';
  $('viewReportBtn').style.display = 'none';
  $('downloadReportBtn').style.display = 'none';
  $('downloadBtn').style.display = 'none';
  $('newScanBtn').style.display = 'none';
  $('consoleInner').innerHTML = '';
  updateSeverityDisplay();

  // Show UI
  $('emptyState').style.display = 'none';
  $('resultsSection').style.display = 'block';
  $('consoleSection').style.display = 'block';
  setPhase('phase1');

  // Open console by default
  $('consoleToggle').classList.add('open');
  $('consoleBox').classList.add('open');

  addConsoleLine('Fetching repository from GitHub...', 'msg');
  setPhase('phase1');

  try {
    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 180000); // 3 min timeout

    var response = await fetch('/api/vibeshieldpilot-scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ action: 'scan', repoUrl: cleanUrl }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      var errData = {};
      try { errData = await response.json(); } catch (e) {}
      addConsoleLine('Error: ' + (errData.error || 'Scan failed.'), 'err');
      finishScan();
      return;
    }

    addConsoleLine('AI is analyzing the codebase...', 'ok');
    setPhase('phase2');

    var scanResult = await response.json();

    // ── Populate the UI from scan results ──────────────
    addConsoleLine('Scan complete — building scorecard.', 'ok');
    setPhase('phase3');

    // Recon stats
    $('reconFiles').textContent = scanResult.filesScanned || '?';
    $('reconEndpoints').textContent = scanResult.totalFiles || '?';
    $('reconAuthFlows').textContent = (scanResult.techStack || []).length || '?';

    // Tech stack
    if (scanResult.techStack && scanResult.techStack.length > 0) {
      var details = $('reconDetails');
      var row = document.createElement('div');
      row.className = 'recon-row';
      row.innerHTML = '<span class="label">Tech Stack</span><span class="value">' + escapeHtml(scanResult.techStack.join(', ')) + '</span>';
      details.appendChild(row);
    }

    // Categories
    if (scanResult.categories) {
      scanResult.categories.forEach(function(cat) {
        var catId = cat.name.toLowerCase().replace(/[^a-z]/g, '').substring(0, 10);
        // Find matching category in our list
        for (var ci = 0; ci < CATEGORIES.length; ci++) {
          var c = CATEGORIES[ci];
          if (cat.name.toLowerCase().includes(c.keywords[0])) {
            updateCategory(c.id, 'done');
            var row = document.getElementById('cat-' + c.id);
            if (row) {
              var findingsCount = (cat.findings || []).length;
              var hasCritical = (cat.findings || []).some(function(f) { return f.severity === 'CRITICAL'; });
              var hasHigh = (cat.findings || []).some(function(f) { return f.severity === 'HIGH'; });
              if (hasCritical) row.classList.add('has-critical');
              else if (hasHigh) row.classList.add('has-high');
              var findingsEl = row.querySelector('.cat-findings');
              if (findingsEl) findingsEl.textContent = findingsCount > 0 ? findingsCount + ' found' : 'clean';
            }
            break;
          }
        }
      });
    }

    // Mark remaining categories as done
    CATEGORIES.forEach(function(c) {
      if (categoryStatuses[c.id] !== 'done') updateCategory(c.id, 'done');
    });

    // Severity counts
    if (scanResult.stats) {
      severityCounts = {
        critical: scanResult.stats.critical || 0,
        high: scanResult.stats.high || 0,
        medium: scanResult.stats.medium || 0,
        low: scanResult.stats.low || 0,
      };
      updateSeverityDisplay();
    }

    // Grade
    if (scanResult.grade) {
      showGrade(scanResult.grade);
    }

    // Build HTML report for download
    reportHtml = buildReportHtml(scanResult);
    $('viewReportBtn').style.display = 'inline-flex';
    $('downloadReportBtn').style.display = 'inline-flex';
    $('downloadBtn').style.display = 'inline-flex';

    // Console summary
    addConsoleLine('Grade: ' + (scanResult.grade || '?') + ' — ' + (scanResult.stats ? scanResult.stats.total + ' findings' : ''), 'ok');

    setPhase('complete');
    finishScan();

  } catch (err) {
    if (err.name === 'AbortError') {
      addConsoleLine('Scan timed out. Try a smaller repository.', 'err');
    } else {
      addConsoleLine('Error: ' + err.message, 'err');
    }
    finishScan();
  }
}

// ── Build downloadable HTML report from scan results ────────
function buildReportHtml(result) {
  var cats = (result.categories || []).map(function(cat) {
    var findings = (cat.findings || []).map(function(f) {
      var sevColor = f.severity === 'CRITICAL' ? '#ef4444' : f.severity === 'HIGH' ? '#f59e0b' : f.severity === 'MEDIUM' ? '#3b82f6' : '#22c55e';
      return '<div style="margin:12px 0;padding:14px;background:rgba(255,255,255,0.02);border-left:3px solid ' + sevColor + ';border-radius:0 8px 8px 0;">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><strong>' + escapeHtml(f.title || '') + '</strong><span style="color:' + sevColor + ';font-size:12px;font-weight:600;">' + (f.severity || '') + '</span></div>' +
        '<div style="font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:4px;">' + escapeHtml(f.file || '') + (f.line ? ':' + f.line : '') + '</div>' +
        '<div style="font-size:13px;color:rgba(255,255,255,0.7);">' + escapeHtml(f.description || '') + '</div>' +
        (f.fix ? '<div style="margin-top:8px;padding:10px;background:rgba(34,197,94,0.06);border-radius:6px;font-size:12px;color:rgba(255,255,255,0.6);"><strong style="color:#22c55e;">Fix:</strong> ' + escapeHtml(f.fix) + '</div>' : '') +
        '</div>';
    }).join('');
    var statusColor = cat.status === 'pass' ? '#22c55e' : cat.status === 'fail' ? '#ef4444' : '#f59e0b';
    return '<div style="margin-bottom:24px;">' +
      '<h3 style="color:#FF6A00;margin-bottom:8px;display:flex;align-items:center;gap:8px;">' + escapeHtml(cat.name) + ' <span style="font-size:11px;padding:2px 8px;border-radius:4px;background:rgba(255,255,255,0.05);color:' + statusColor + ';">' + (cat.status || '').toUpperCase() + '</span></h3>' +
      (findings || '<div style="color:rgba(255,255,255,0.3);font-size:13px;">No issues found.</div>') +
      '</div>';
  }).join('');

  var topFixes = (result.topFixes || []).map(function(f, i) {
    return '<div style="margin:8px 0;padding:12px;background:rgba(255,106,0,0.04);border:1px solid rgba(255,106,0,0.15);border-radius:8px;">' +
      '<strong style="color:#FF6A00;">#' + (i + 1) + ' ' + escapeHtml(f.title || '') + '</strong>' +
      '<div style="font-size:13px;color:rgba(255,255,255,0.6);margin-top:4px;">' + escapeHtml(f.description || '') + '</div></div>';
  }).join('');

  var gradeColor = result.grade === 'A' ? '#22c55e' : result.grade === 'B' ? '#3b82f6' : result.grade === 'C' ? '#f59e0b' : result.grade === 'D' ? '#FF6A00' : '#ef4444';

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Security Scorecard — ' + escapeHtml(result.repo || '') + '</title>' +
    '<style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:Inter,system-ui,sans-serif;background:#0a0a0a;color:#e0e0e0;padding:48px 40px;max-width:900px;margin:0 auto;line-height:1.6;}</style></head><body>' +
    '<div style="text-align:center;margin-bottom:36px;padding:32px 0;border-bottom:2px solid rgba(255,106,0,0.3);">' +
    '<h1 style="font-size:28px;color:#FF6A00;">VibeShieldPilot Security Scorecard</h1>' +
    '<div style="font-size:15px;color:rgba(255,255,255,0.6);margin-top:8px;">' + escapeHtml(result.repo || '') + '</div>' +
    '<div style="font-size:64px;font-weight:800;color:' + gradeColor + ';margin:20px 0;">' + (result.grade || '?') + '</div>' +
    '<div style="font-size:14px;color:rgba(255,255,255,0.5);">' + escapeHtml(result.summary || '') + '</div>' +
    '<div style="display:flex;justify-content:center;gap:16px;margin-top:16px;">' +
    '<span style="color:#ef4444;">' + (result.stats ? result.stats.critical : 0) + ' Critical</span>' +
    '<span style="color:#f59e0b;">' + (result.stats ? result.stats.high : 0) + ' High</span>' +
    '<span style="color:#3b82f6;">' + (result.stats ? result.stats.medium : 0) + ' Medium</span>' +
    '<span style="color:#22c55e;">' + (result.stats ? result.stats.low : 0) + ' Low</span>' +
    '</div></div>' +
    (topFixes ? '<h2 style="color:#FF6A00;margin-bottom:12px;">Top Priority Fixes</h2>' + topFixes + '<hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:32px 0;">' : '') +
    cats +
    '<div style="text-align:center;margin-top:48px;padding:24px 0;border-top:1px solid rgba(255,255,255,0.06);font-size:11px;color:rgba(255,255,255,0.2);">' +
    '<span style="color:#FF6A00;font-weight:600;">VibeShieldPilot</span> by CapitaCoreAI &middot; ' + (result.filesScanned || '?') + ' files scanned &middot; ' + (result.scannedAt ? new Date(result.scannedAt).toLocaleDateString() : '') +
    '</div></body></html>';
}

// ── Report ──────────────────────────────────────────────
function viewReport() {
  if (!reportHtml) return;
  var iframe = $('reportIframe');
  iframe.srcdoc = reportHtml;
  $('reportOverlay').classList.add('active');
}

function downloadReport() {
  if (!reportHtml) return;
  var blob = new Blob([reportHtml], { type: 'text/html' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'security-scorecard.html';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function newScan() {
  $('emptyState').style.display = 'block';
  $('resultsSection').style.display = 'none';
  $('consoleSection').style.display = 'none';
  $('repoUrlInput').value = '';
  $('repoUrlInput').focus();
  scanPhase = 'idle';
  reportHtml = null;
  $('downloadBtn').style.display = 'none';
  $('newScanBtn').style.display = 'none';
}

// ── Event bindings ──────────────────────────────────────
$('scanBtn').addEventListener('click', startScan);
$('repoUrlInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') startScan();
});
$('newScanBtn').addEventListener('click', newScan);
$('downloadBtn').addEventListener('click', downloadReport);
$('downloadReportBtn').addEventListener('click', downloadReport);
$('viewReportBtn').addEventListener('click', viewReport);
$('reportClose').addEventListener('click', function() {
  $('reportOverlay').classList.remove('active');
  $('reportIframe').srcdoc = '';
});
$('reportOverlay').addEventListener('click', function(e) {
  if (e.target === $('reportOverlay')) {
    $('reportOverlay').classList.remove('active');
    $('reportIframe').srcdoc = '';
  }
});
$('consoleToggle').addEventListener('click', function() {
  this.classList.toggle('open');
  $('consoleBox').classList.toggle('open');
});
$('logoutBtn').addEventListener('click', function() {
  sb.auth.signOut().catch(function() {});
  localStorage.clear();
  sessionStorage.clear();
  window.location.href = '/';
});
