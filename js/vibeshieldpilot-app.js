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

  // Deduct credits
  try {
    var creditRes = await fetch('/api/vibeshieldpilot-scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ action: 'start_conversation' }),
    });
    var creditData = await creditRes.json();
    if (!creditRes.ok) {
      alert(creditData.error || 'Failed to deduct credits.');
      scanBtn.disabled = false;
      scanBtn.classList.remove('loading');
      return;
    }
    creditBalance = creditData.remaining;
    $('creditDisplay').textContent = isAdmin ? '\u221E' : creditBalance;
  } catch (e) {
    alert('Network error. Please try again.');
    scanBtn.disabled = false;
    scanBtn.classList.remove('loading');
    return;
  }

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

  addConsoleLine('Connecting to VibeShieldPilot agent...', 'msg');

  try {
    // 1. Start the scan — returns session ID immediately
    var response = await fetch('/api/vibeshieldpilot-scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ action: 'scan', repoUrl: cleanUrl }),
    });

    if (!response.ok) {
      var errData = {};
      try { errData = await response.json(); } catch (e) {}
      addConsoleLine('Error: ' + (errData.error || 'Scan request failed.'), 'err');
      finishScan();
      return;
    }

    var scanData = await response.json();
    var sessionId = scanData.sessionId;

    handleEvent({ type: 'session_created', sessionId: sessionId, repo: scanData.repo });
    handleEvent({ type: 'scan_started' });

    // 2. Poll for events from the client side
    var seenIds = {};
    var pollDone = false;
    var pollCount = 0;
    var maxPolls = 150; // ~6 minutes at 2.5s intervals

    while (!pollDone && pollCount < maxPolls) {
      pollCount++;
      await new Promise(function(r) { setTimeout(r, 2500); });

      try {
        var pollRes = await fetch('/api/vibeshieldpilot-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
          body: JSON.stringify({ action: 'poll', sessionId: sessionId }),
        });

        if (!pollRes.ok) {
          addConsoleLine('Poll error: ' + pollRes.status, 'err');
          continue;
        }

        var eventsData = await pollRes.json();
        var events = eventsData.data || [];

        for (var i = 0; i < events.length; i++) {
          var evt = events[i];
          if (!evt.id || seenIds[evt.id]) continue;
          seenIds[evt.id] = true;

          if (evt.type === 'agent.message') {
            var content = '';
            if (Array.isArray(evt.content)) {
              content = evt.content.filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text || ''; }).join('');
            }
            if (content) handleEvent({ type: 'message', content: content });
          } else if (evt.type === 'agent.tool_use') {
            var toolName = evt.name || '';
            var toolInput = evt.input || {};
            var summary = {};
            if (toolInput.command) summary.command = String(toolInput.command).substring(0, 300);
            else if (toolInput.path || toolInput.file_path) summary.path = toolInput.path || toolInput.file_path;
            else if (toolInput.pattern) summary.pattern = toolInput.pattern;
            handleEvent({ type: 'tool_use', tool: toolName, input: summary });
          } else if (evt.type === 'session.status_idle') {
            handleEvent({ type: 'scan_complete' });
            pollDone = true;
            break;
          } else if (evt.type === 'session.status_terminated') {
            handleEvent({ type: 'terminated', message: 'Session ended.' });
            pollDone = true;
            break;
          }
        }
      } catch (pollErr) {
        addConsoleLine('Poll error: ' + pollErr.message, 'err');
      }
    }

    if (!pollDone) {
      addConsoleLine('Scan timed out.', 'warn');
    }

    handleEvent({ type: 'done' });
    finishScan();

  } catch (err) {
    addConsoleLine('Error: ' + err.message, 'err');
    finishScan();
  }
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
