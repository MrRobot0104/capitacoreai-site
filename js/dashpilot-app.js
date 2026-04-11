var GENS_PER_CREDIT = 5;
var currentUser = null;
var conversationHistory = [];
var genCount = 0;
var genLimit = GENS_PER_CREDIT;
var lastDashboardHtml = '';
var uploadedFileData = null;
var uploadedFileName = '';
var creditBalance = 0;
var conversationStarted = false;

// AUTH
var initDone = false;
async function init() {
  var result = await sb.auth.getSession();
  var session = result.data.session;
  if (!session) {
    setTimeout(async function() {
      var retry = await sb.auth.getSession();
      var retrySession = retry.data.session;
      if (!retrySession) { window.location.href = 'account.html'; }
      else { currentUser = retrySession.user; await refreshCredits(); initDone = true; }
    }, 1000);
    return;
  }
  currentUser = session.user;
  await refreshCredits();
  initDone = true;
}
init();
sb.auth.onAuthStateChange(function(event, session) {
  if (event === 'SIGNED_IN' && session && !initDone) {
    currentUser = session.user;
    refreshCredits();
    initDone = true;
  }
  if (event === 'SIGNED_OUT') { window.location.href = 'account.html'; }
});

var isAdmin = false;

async function refreshCredits() {
  var result = await sb.from('profiles').select('token_balance, is_admin').eq('id', currentUser.id).single();
  var data = result.data;
  isAdmin = data && data.is_admin === true;
  creditBalance = isAdmin ? 9999 : (data ? data.token_balance : 0);
  document.getElementById('creditDisplay').textContent = isAdmin ? '\u221E' : creditBalance;
  if (creditBalance <= 0 && !conversationStarted) {
    addBotMessage("You don't have any credits. Purchase some to start building dashboards.");
    disableInput();
  }
}

async function logout() { await sb.auth.signOut(); localStorage.clear(); window.location.href = '/'; }

// FILE HANDLING
function handleFile(e) {
  var file = e.target.files[0];
  if (!file) return;
  if (file.size > 750 * 1024) {
    addBotMessage('File too large. Maximum size is 750KB.');
    e.target.value = '';
    return;
  }
  var ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv') {
    Papa.parse(file, {
      header: true,
      preview: 100,
      complete: function(results) {
        uploadedFileData = results.data;
        uploadedFileName = file.name;
        showFilePreview(file.name);
      }
    });
  } else if (['xlsx', 'xls'].indexOf(ext) !== -1) {
    var reader = new FileReader();
    reader.onload = function(ev) {
      var wb = XLSX.read(ev.target.result, { type: 'array' });
      var ws = wb.Sheets[wb.SheetNames[0]];
      var json = XLSX.utils.sheet_to_json(ws, { defval: '' });
      uploadedFileData = json.slice(0, 100);
      uploadedFileName = file.name;
      showFilePreview(file.name);
    };
    reader.readAsArrayBuffer(file);
  }
  e.target.value = '';
}

function showFilePreview(name) {
  document.getElementById('fileChipName').textContent = name;
  document.getElementById('filePreview').classList.add('active');
}

function removeFile() {
  uploadedFileData = null;
  uploadedFileName = '';
  document.getElementById('filePreview').classList.remove('active');
}

// TEXTAREA AUTO-RESIZE
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}
function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

// MESSAGES
function addUserMessage(text, fileName) {
  var msgs = document.getElementById('chatMessages');
  var div = document.createElement('div');
  div.className = 'msg user';
  var html = '';
  if (fileName) html += '<div class="file-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' + fileName + '</div>';
  html += '<div class="msg-bubble">' + escapeHtml(text) + '</div>';
  div.innerHTML = html;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function addBotMessage(text) {
  var msgs = document.getElementById('chatMessages');
  var div = document.createElement('div');
  div.className = 'msg bot';
  div.innerHTML = '<div class="msg-bubble">' + escapeHtml(text) + '</div>';
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function addTyping() {
  var msgs = document.getElementById('chatMessages');
  var div = document.createElement('div');
  div.className = 'msg bot';
  div.id = 'typingMsg';
  div.innerHTML = '<div class="msg-bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div>';
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}
function removeTyping() { var el = document.getElementById('typingMsg'); if (el) el.remove(); }

function escapeHtml(t) { var d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

function disableInput() {
  document.getElementById('chatInputArea').style.display = 'none';
}
function enableInput() {
  document.getElementById('chatInputArea').style.display = 'block';
  document.getElementById('limitBar').style.display = 'none';
}

function showLimitBar() {
  document.getElementById('chatInputArea').style.display = 'none';
  var bar = document.getElementById('limitBar');
  bar.style.display = 'block';
  if (creditBalance > 0) {
    document.getElementById('limitMsg').textContent = "You've used all 5 dashboard generations for this credit. Add another credit to keep refining.";
    document.getElementById('continueBtn').style.display = 'inline-block';
  } else {
    document.getElementById('limitMsg').textContent = "No credits remaining. Purchase more to continue building dashboards.";
    document.getElementById('continueBtn').style.display = 'none';
  }
}

function updateGenCounter() {
  var remaining = genLimit - genCount;
  var el = document.getElementById('genCounter');
  if (el) el.textContent = remaining + ' of ' + genLimit + ' generations left';
}

// CONVERSATION CONTROL
async function startNewDashboard() {
  if (creditBalance <= 0) { window.location.href = 'dashpilot.html'; return; }
  var result = await sb.auth.getSession();
  var session = result.data.session;
  var res = await fetch('/api/dashpilot-generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
    body: JSON.stringify({ action: 'start_conversation' })
  });
  if (!res.ok) {
    var err = await res.json().catch(function() { return {}; });
    addBotMessage(err.error || 'Failed to start. Please try again.');
    return;
  }
  conversationHistory = [];
  genCount = 0;
  genLimit = GENS_PER_CREDIT;
  lastDashboardHtml = '';
  conversationStarted = true;
  uploadedFileData = null;
  uploadedFileName = '';
  document.getElementById('filePreview').classList.remove('active');
  document.getElementById('chatMessages').innerHTML = '';
  document.getElementById('previewEmpty').style.display = 'flex';
  document.getElementById('previewFrame').style.display = 'none';
  document.getElementById('expandBtn').style.display = 'none';
  document.getElementById('downloadBtn').style.display = 'none';
  enableInput();
  updateGenCounter();
  addBotMessage("New dashboard started! You have 5 generations. Be as descriptive as possible — tell me the data, metrics, chart types, colors, and style you want. Upload a CSV/Excel file or describe your dashboard to begin.");
  await refreshCredits();
}

async function continueConversation() {
  var result = await sb.auth.getSession();
  var session = result.data.session;
  var res = await fetch('/api/dashpilot-generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
    body: JSON.stringify({ action: 'start_conversation' })
  });
  if (!res.ok) {
    var err = await res.json().catch(function() { return {}; });
    addBotMessage(err.error || 'Failed to add messages.');
    return;
  }
  genLimit += GENS_PER_CREDIT;
  enableInput();
  updateGenCounter();
  addBotMessage("5 more generations added! Keep refining your dashboard.");
  await refreshCredits();
}

// SEND MESSAGE
async function sendMessage() {
  var textarea = document.getElementById('chatTextarea');
  var message = textarea.value.trim();
  if (!message && !uploadedFileData) return;

  if (!conversationStarted) {
    if (creditBalance <= 0) { window.location.href = 'dashpilot.html'; return; }
    var authResult = await sb.auth.getSession();
    var authSession = authResult.data.session;
    var res = await fetch('/api/dashpilot-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authSession.access_token },
      body: JSON.stringify({ action: 'start_conversation' })
    });
    if (!res.ok) {
      var err = await res.json().catch(function() { return {}; });
      addBotMessage(err.error || 'Failed to start.');
      return;
    }
    conversationStarted = true;
    await refreshCredits();
  }

  if (genCount >= genLimit) { showLimitBar(); return; }

  var userContent = message;
  var fileContext = '';
  if (uploadedFileData) {
    var cols = Object.keys(uploadedFileData[0] || {});
    var allRows = uploadedFileData;

    var stats = '\n\nDATA SUMMARY (pre-computed \u2014 use these exact numbers):\n';
    cols.forEach(function(col) {
      var nums = allRows.map(function(r) { return parseFloat(String(r[col]).replace(/[$,]/g, '')); }).filter(function(n) { return !isNaN(n); });
      if (nums.length > 0 && nums.length > allRows.length * 0.3) {
        var sum = nums.reduce(function(a, b) { return a + b; }, 0);
        var avg = sum / nums.length;
        var min = Math.min.apply(null, nums);
        var max = Math.max.apply(null, nums);
        stats += '  ' + col + ': sum=' + sum.toFixed(2) + ', avg=' + avg.toFixed(2) + ', min=' + min + ', max=' + max + ', count=' + nums.length + '\n';
      }
    });

    cols.forEach(function(col) {
      var vals = allRows.map(function(r) { return String(r[col] || ''); }).filter(function(v) { return v; });
      var unique = [];
      vals.forEach(function(v) { if (unique.indexOf(v) === -1) unique.push(v); });
      if (unique.length > 0 && unique.length <= 20 && unique.length < vals.length * 0.5) {
        var counts = {};
        vals.forEach(function(v) { counts[v] = (counts[v] || 0) + 1; });
        var top = Object.entries(counts).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 10);
        stats += '  ' + col + ' (categorical): ' + top.map(function(pair) { return pair[0] + '=' + pair[1]; }).join(', ') + '\n';
      }
    });

    var sampleRows = allRows.slice(0, 60);
    var jsonData = JSON.stringify(sampleRows, null, 1);

    fileContext = '\n\n=== UPLOADED DATA: ' + uploadedFileName + ' ===\n' +
      'Total rows: ' + allRows.length + ', Columns: ' + cols.join(', ') + '\n' +
      stats +
      '\nRAW DATA (first ' + sampleRows.length + ' rows as JSON \u2014 extract values from here):\n' +
      jsonData.substring(0, 14000) +
      '\n\nCRITICAL: The KPIs and charts MUST show the real numbers from the DATA SUMMARY above. Do NOT use zeros or placeholders.';
  }

  addUserMessage(message || 'Build a dashboard from this data', uploadedFileData ? uploadedFileName : null);
  textarea.value = '';
  textarea.style.height = 'auto';
  removeFile();

  var fullPrompt = (message || 'Build an interactive dashboard from this data') + fileContext;
  conversationHistory.push({ role: 'user', content: fullPrompt });

  document.getElementById('sendBtn').disabled = true;
  addBotMessage('Building your dashboard... this may take up to a minute.');
  addTyping();

  try {
    var sessionResult = await sb.auth.getSession();
    var session = sessionResult.data.session;
    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 300000);
    var res = await fetch('/api/dashpilot-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ action: 'generate', history: conversationHistory }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    removeTyping();
    document.getElementById('sendBtn').disabled = false;

    var responseText = await res.text();
    var data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      addBotMessage('Server timed out or returned an error. Please try again.');
      return;
    }

    if (!res.ok) {
      addBotMessage(data.error || 'Something went wrong.');
      return;
    }

    lastDashboardHtml = data.html;
    genCount++;
    updateGenCounter();
    var configStr = data.config ? JSON.stringify(data.config).substring(0, 3000) : '';
    conversationHistory.push({ role: 'assistant', content: 'Current dashboard config: ' + configStr });

    document.getElementById('previewEmpty').style.display = 'none';
    document.getElementById('previewFrame').style.display = 'block';
    document.getElementById('expandBtn').style.display = 'inline-flex';
    document.getElementById('downloadBtn').style.display = 'inline-flex';
    var blob = new Blob([lastDashboardHtml], { type: 'text/html' });
    var blobUrl = URL.createObjectURL(blob);
    document.getElementById('dashboardIframe').src = blobUrl;

    var remaining = genLimit - genCount;
    if (remaining > 0) {
      addBotMessage("Dashboard ready! You have " + remaining + " generation" + (remaining === 1 ? '' : 's') + " left. Tell me what to change or ask any questions.");
    } else {
      addBotMessage("Dashboard ready! That was your last generation for this credit.");
    }

    if (genCount >= genLimit) {
      await refreshCredits();
      showLimitBar();
    }
  } catch (err) {
    removeTyping();
    document.getElementById('sendBtn').disabled = false;
    addBotMessage('Connection error. Please try again.');
  }
}

function expandPreview() {
  var win = window.open('', '_blank');
  win.document.write(lastDashboardHtml);
  win.document.close();
}

function downloadDashboard() {
  var blob = new Blob([lastDashboardHtml], { type: 'text/html' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'dashboard.html';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

document.addEventListener('DOMContentLoaded', function() {
  var newDashBtn = document.getElementById('newDashBtn');
  if (newDashBtn) newDashBtn.addEventListener('click', startNewDashboard);

  var logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  var removeFileBtn = document.getElementById('removeFileBtn');
  if (removeFileBtn) removeFileBtn.addEventListener('click', removeFile);

  var chatTextarea = document.getElementById('chatTextarea');
  if (chatTextarea) {
    chatTextarea.addEventListener('keydown', handleKey);
    chatTextarea.addEventListener('input', function() { autoResize(this); });
  }

  var fileInput = document.getElementById('fileInput');
  if (fileInput) fileInput.addEventListener('change', handleFile);

  var uploadBtn = document.getElementById('uploadBtn');
  if (uploadBtn) uploadBtn.addEventListener('click', function() { document.getElementById('fileInput').click(); });

  var sendBtn = document.getElementById('sendBtn');
  if (sendBtn) sendBtn.addEventListener('click', sendMessage);

  var continueBtn = document.getElementById('continueBtn');
  if (continueBtn) continueBtn.addEventListener('click', continueConversation);

  var newDashLimitBtn = document.getElementById('newDashLimitBtn');
  if (newDashLimitBtn) newDashLimitBtn.addEventListener('click', startNewDashboard);

  var expandBtn = document.getElementById('expandBtn');
  if (expandBtn) expandBtn.addEventListener('click', expandPreview);

  var downloadBtn = document.getElementById('downloadBtn');
  if (downloadBtn) downloadBtn.addEventListener('click', downloadDashboard);
});
