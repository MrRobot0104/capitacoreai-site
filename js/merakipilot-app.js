var MSGS_PER_CREDIT = 5;
var CREDIT_COST = 1;
var connected = false;
var merakiKey = null;
var orgData = null;
var chatHistory = [];
var msgCount = 0;
var msgLimit = 0;
var creditBalance = 0;
var conversationStarted = false;
var currentSession = null;
var allDevices = [];
var allStatuses = {};
var allNetworks = [];
var selectedNetworkId = 'all';

var chatMessages = document.getElementById('chatMessages');
var chatInput = document.getElementById('chatInput');
var sendBtn = document.getElementById('sendBtn');

// ─── Auth Gate ────────────────────────────────────────────────────
(async function() {
  var result = await sb.auth.getSession();
  currentSession = result.data.session;
  if (!currentSession) {
    addMessage('<strong>Please log in to use MerakiPilot.</strong><br><br><a href="account.html" style="color:#111;text-decoration:underline;">Log in or create an account</a> to get started.', 'bot');
    chatInput.disabled = true;
    chatInput.placeholder = 'Log in to continue...';
    sendBtn.disabled = true;
    return;
  }
  await refreshCredits();
  addMessage(
    '<strong>Welcome to MerakiPilot.</strong><br><br>' +
    'I\'m your AI network operations agent. Connect your Meraki API key and I\'ll monitor, troubleshoot, and manage your infrastructure.<br><br>' +
    'To get started, paste your <strong>Meraki API key</strong> below.<br><br>' +
    '<span style="font-size:12px;color:#94a3b8;">Your key is encrypted and never stored in plaintext.</span>',
    'bot'
  );
  // Clear static welcome message
  var firstMsg = chatMessages.querySelector('.msg');
  if (firstMsg && firstMsg !== chatMessages.lastElementChild) firstMsg.remove();
})();

sb.auth.onAuthStateChange(function(event, session) {
  currentSession = session;
});

async function refreshCredits() {
  if (!currentSession) return;
  var result = await sb.from('profiles').select('token_balance, is_admin').eq('id', currentSession.user.id).single();
  var data = result.data;
  var isAdmin = data && data.is_admin === true;
  creditBalance = isAdmin ? 9999 : ((data && data.token_balance) || 0);
  var el = document.getElementById('creditDisplay');
  if (el) { el.style.display = 'flex'; document.getElementById('creditCount').textContent = isAdmin ? '\u221E' : creditBalance; }
}

function showLimitBar() {
  document.getElementById('chatInputArea').style.display = 'none';
  var bar = document.getElementById('limitBar');
  bar.style.display = 'block';
  if (creditBalance > 0) {
    document.getElementById('limitMsg').textContent = 'You\'ve used all ' + MSGS_PER_CREDIT + ' messages. Continue for ' + CREDIT_COST + ' credit.';
    document.getElementById('continueBtn').style.display = creditBalance >= CREDIT_COST ? 'inline-block' : 'none';
  } else {
    document.getElementById('limitMsg').textContent = 'No credits remaining.';
    document.getElementById('continueBtn').style.display = 'none';
  }
}

function enableInput() {
  document.getElementById('chatInputArea').style.display = 'block';
  document.getElementById('limitBar').style.display = 'none';
}

// ─── Chat UI ──────────────────────────────────────────────────────
function cleanResponse(text) {
  // Strip raw fetch_results/action_results blocks — works on both raw and HTML-escaped
  return text
    .replace(/<fetch_results>[\s\S]*?<\/fetch_results>/g, '')
    .replace(/&lt;fetch_results&gt;[\s\S]*?&lt;\/fetch_results&gt;/g, '')
    .replace(/<action_results>[\s\S]*?<\/action_results>/g, '')
    .replace(/&lt;action_results&gt;[\s\S]*?&lt;\/action_results&gt;/g, '')
    .replace(/```json\s*[\[{][\s\S]*?```/g, '')
    .replace(/\{"path":"\/[\s\S]*?"data":[\s\S]*?\}\]/g, '')
    .replace(/\[?\{"path":"\/org[\s\S]{50,}?\}\]?\}?/g, '')
    .trim();
}

function isReport(text) {
  return text.includes('Risk Score') || text.includes('RISK SCORE') || text.includes('Audit Report') || text.includes('AUDIT REPORT') || text.includes('Priority Action') || text.includes('PRIORITY ACTION');
}

function addMessage(text, sender) {
  var div = document.createElement('div');
  div.className = 'msg ' + (sender || 'bot');
  var cleaned = sender === 'bot' ? cleanResponse(text) : text;
  if (!cleaned) return; // Skip empty messages after cleaning
  div.innerHTML = '<div class="msg-bubble">' + cleaned + '</div>';
  // Add export button if this looks like a report
  if (sender === 'bot' && isReport(cleaned)) {
    var exportBtn = document.createElement('button');
    exportBtn.className = 'export-report-btn';
    exportBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Export Report as PDF';
    exportBtn.onclick = function() { exportReportPDF(cleaned); };
    div.appendChild(exportBtn);
  }
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function exportReportPDF(html) {
  var reportHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>MerakiPilot Security Audit Report</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">' +
    '<style>' +
    '* { margin: 0; padding: 0; box-sizing: border-box; }' +
    'body { font-family: Inter, system-ui, sans-serif; background: #0a0a0a; color: #e0e0e0; padding: 48px 40px; max-width: 900px; margin: 0 auto; line-height: 1.6; }' +
    'h1 { font-size: 28px; font-weight: 800; color: #FF6A00; margin-bottom: 4px; }' +
    'h2, .msg-bubble h3 { font-size: 18px; font-weight: 700; color: #FF6A00; margin: 28px 0 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,106,0,0.25); }' +
    'h3 { font-size: 15px; font-weight: 600; color: #FF6A00; margin: 18px 0 8px; }' +
    'p, li, div { font-size: 14px; color: rgba(255,255,255,0.8); }' +
    'strong, b { color: #ffffff; }' +
    'code { background: rgba(255,106,0,0.12); color: #FF6A00; padding: 2px 6px; border-radius: 4px; font-size: 12px; font-family: "SF Mono", Monaco, monospace; }' +
    'table { width: 100%; border-collapse: collapse; margin: 14px 0; }' +
    'th { background: rgba(255,106,0,0.1); color: #FF6A00; text-align: left; padding: 10px 14px; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 2px solid rgba(255,106,0,0.2); }' +
    'td { padding: 9px 14px; border-bottom: 1px solid rgba(255,255,255,0.05); color: rgba(255,255,255,0.75); font-size: 13px; }' +
    'tr:nth-child(even) td { background: rgba(255,255,255,0.02); }' +
    'hr { border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 20px 0; }' +
    'blockquote { border-left: 3px solid #FF6A00; padding: 12px 16px; margin: 14px 0; background: rgba(255,106,0,0.04); border-radius: 0 8px 8px 0; color: rgba(255,255,255,0.65); }' +
    'br { display: block; margin: 2px 0; content: ""; }' +
    '.report-header { text-align: center; margin-bottom: 36px; padding: 32px 0; border-bottom: 2px solid rgba(255,106,0,0.3); }' +
    '.report-header h1 { font-size: 32px; margin-bottom: 6px; }' +
    '.report-header .subtitle { color: rgba(255,255,255,0.35); font-size: 13px; }' +
    '.report-header .org { color: rgba(255,255,255,0.6); font-size: 15px; margin-top: 8px; }' +
    '.report-footer { text-align: center; margin-top: 48px; padding: 24px 0; border-top: 1px solid rgba(255,255,255,0.06); }' +
    '.report-footer p { font-size: 11px; color: rgba(255,255,255,0.2); }' +
    '.report-footer .brand { color: #FF6A00; font-weight: 600; }' +
    '</style></head><body>' +
    '<div class="report-header">' +
    '<h1>MerakiPilot Security Audit</h1>' +
    '<div class="org">' + (orgData ? orgData.name : 'Network Audit') + '</div>' +
    '<div class="subtitle">Generated ' + new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) + ' by CapitaCoreAI</div>' +
    '</div>' +
    html +
    '<div class="report-footer">' +
    '<p><span class="brand">MerakiPilot</span> by CapitaCoreAI &middot; capitacoreai.io</p>' +
    '<p>This report was generated by AI and should be verified by a network administrator.</p>' +
    '</div></body></html>';

  // Download as HTML file
  var blob = new Blob([reportHtml], { type: 'text/html' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'MerakiPilot-Security-Audit-' + new Date().toISOString().split('T')[0] + '.html';
  a.click();
  URL.revokeObjectURL(url);
}

function showTyping() {
  var div = document.createElement('div');
  div.className = 'msg bot';
  div.id = 'typingMsg';
  div.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function hideTyping() {
  var el = document.getElementById('typingMsg');
  if (el) el.remove();
}

// ─── Meraki API (proxied through Vercel to bypass CORS) ──────────
async function merakiCall(path, method, body) {
  if (!currentSession) return null;
  try {
    var resp = await fetch('/api/meraki-proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + currentSession.access_token,
      },
      body: JSON.stringify({ merakiKey: merakiKey, method: method || 'GET', path: path, body: body }),
    });
    if (!resp.ok) {
      var errData = await resp.json().catch(function() { return {}; });
      console.error('Meraki proxy error:', resp.status, errData);
      return null;
    }
    return await resp.json();
  } catch (e) {
    console.error('Meraki API error:', e);
    return null;
  }
}

async function merakiGet(path) { return merakiCall(path, 'GET'); }
async function merakiPost(path, data) { return merakiCall(path, 'POST', data); }
async function merakiPut(path, data) { return merakiCall(path, 'PUT', data); }

// ─── Connect Flow ─────────────────────────────────────────────────
async function connectMeraki(key) {
  merakiKey = key.trim();
  showTyping();

  var orgs = await merakiGet('/organizations');
  hideTyping();

  if (!orgs || orgs.length === 0) {
    addMessage("That API key didn't work. I couldn't find any organizations. Double-check the key and try again.", 'bot');
    merakiKey = null;
    return;
  }

  orgData = orgs[0];
  connected = true;

  var chip = document.getElementById('statusChip');
  chip.className = 'status-chip';
  chip.querySelector('#statusText').textContent = orgData.name;

  addMessage('Connected to <strong>' + orgData.name + '</strong>. Loading your network...', 'bot');
  await loadDashboard();
  addMessage(
    'Your dashboard is ready. I found your devices and networks on the right panel.<br><br>' +
    'Try asking me:<br>' +
    '<code>Show offline devices</code><br>' +
    '<code>Run a health scan</code><br>' +
    '<code>Are my networks secure?</code><br>' +
    '<code>Reboot the warehouse switch</code>',
    'bot'
  );
}

// ─── Load Dashboard → Feed Neural Viz ─────────────────────────────
async function loadDashboard() {
  document.getElementById('orgName').textContent = orgData.name;

  var results = await Promise.all([
    merakiGet('/organizations/' + orgData.id + '/devices'),
    merakiGet('/organizations/' + orgData.id + '/devices/statuses'),
    merakiGet('/organizations/' + orgData.id + '/networks'),
  ]);
  var devices = results[0], statuses = results[1], networks = results[2];

  allStatuses = {};
  (statuses || []).forEach(function(s) { allStatuses[s.serial] = s; });

  allDevices = (devices || []).map(function(d) {
    var s = allStatuses[d.serial] || {};
    return { name: d.name || d.model || d.serial, model: d.model, serial: d.serial, lanIp: d.lanIp, status: s.status || 'offline', networkId: d.networkId, clients: 0 };
  });
  allNetworks = (networks || []).map(function(n) { return { id: n.id, name: n.name, productTypes: n.productTypes }; });

  // Populate network selector
  var selector = document.getElementById('networkSelector');
  var prevValue = selector.value;
  selector.innerHTML = '<option value="all">All Networks (' + allNetworks.length + ')</option>';
  allNetworks.forEach(function(n) {
    var opt = document.createElement('option');
    opt.value = n.id;
    opt.textContent = n.name;
    selector.appendChild(opt);
  });
  selector.value = prevValue && selector.querySelector('option[value="' + prevValue + '"]') ? prevValue : 'all';
  selectedNetworkId = selector.value;
  if (allNetworks.length > 0) selector.style.display = 'block';

  updateDashboardStats();

  // Fetch client counts per network (non-blocking — viz updates after)
  (networks || []).forEach(function(net) {
    merakiGet('/networks/' + net.id + '/clients?perPage=5&timespan=86400').then(function(clients) {
      if (!clients || !Array.isArray(clients)) return;
      var counts = {};
      clients.forEach(function(c) {
        if (c.recentDeviceSerial) {
          counts[c.recentDeviceSerial] = (counts[c.recentDeviceSerial] || 0) + 1;
        }
      });
      var updated = false;
      allDevices.forEach(function(d) {
        if (counts[d.serial]) { d.clients = counts[d.serial]; updated = true; }
      });
      if (updated) updateDashboardStats();
    }).catch(function() {});
  });
}

function getFilteredData() {
  var devices = allDevices;
  var networks = allNetworks;
  if (selectedNetworkId !== 'all') {
    devices = allDevices.filter(function(d) { return d.networkId === selectedNetworkId; });
    networks = allNetworks.filter(function(n) { return n.id === selectedNetworkId; });
  }
  return { devices: devices, networks: networks };
}

function updateDashboardStats() {
  var filtered = getFilteredData();
  var devices = filtered.devices;
  var networks = filtered.networks;

  var total = devices.length;
  var online = devices.filter(function(d) { return d.status === 'online'; }).length;
  var offline = total - online;
  var netCount = networks.length;

  document.getElementById('statDevices').textContent = total;
  document.getElementById('statOnline').textContent = online;
  document.getElementById('statOffline').textContent = offline;
  document.getElementById('statNetworks').textContent = netCount;
  document.getElementById('neuralStats').style.display = 'flex';
  document.getElementById('orgMeta').textContent = (selectedNetworkId === 'all' ? netCount + ' network' + (netCount !== 1 ? 's' : '') + ' \u00B7 ' : '') + total + ' device' + (total !== 1 ? 's' : '');
  var previewNet = document.getElementById('previewNet');
  if (previewNet) previewNet.style.display = 'none';

  if (window.neuralVizUpdate) {
    window.neuralVizUpdate({ devices: devices, networks: networks });
  }
}

// ─── Gather Network Context for Claude ────────────────────────────
async function gatherNetworkContext() {
  if (!connected || !orgData) return null;
  try {
    var filtered = getFilteredData();
    var deviceList = filtered.devices;
    var networkList = filtered.networks;
    var context = {
      orgName: orgData.name, orgId: orgData.id,
      totalDevices: deviceList.length,
      onlineDevices: deviceList.filter(function(d) { return d.status === 'online'; }).length,
      offlineDevices: deviceList.filter(function(d) { return d.status !== 'online'; }),
      devices: deviceList, networks: networkList,
    };
    if (selectedNetworkId !== 'all') {
      context.selectedNetwork = selectedNetworkId;
      var net = allNetworks.find(function(n) { return n.id === selectedNetworkId; });
      if (net) context.selectedNetworkName = net.name;
    }
    return context;
  } catch (e) {
    console.error('Failed to gather context:', e);
    return { orgName: orgData.name, orgId: orgData.id, error: 'Failed to fetch network data' };
  }
}

// ─── Execute Fetches (Claude requests data) ──────────────────────
async function executeFetches(fetches) {
  var results = {};
  var promises = fetches.map(function(f) {
    return merakiGet(f.path).then(function(data) {
      results[f.path] = data;
    }).catch(function(e) {
      results[f.path] = { _error: e.message };
    });
  });
  await Promise.all(promises);
  return results;
}

// ─── Execute Actions (Claude makes changes) ──────────────────────
async function executeActions(actions) {
  var results = {};
  for (var i = 0; i < actions.length; i++) {
    var a = actions[i];
    try {
      var method = (a.method || 'GET').toUpperCase();
      var data;
      if (method === 'POST') data = await merakiPost(a.path, a.body || {});
      else if (method === 'PUT') data = await merakiPut(a.path, a.body || {});
      else data = await merakiGet(a.path);
      results[a.path] = data;
    } catch (e) { results[a.path] = { _error: e.message }; }
  }
  await loadDashboard();
  return results;
}

// ─── Markdown to HTML ─────────────────────────────────────────────
function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function mdToHtml(text) {
  // Escape HTML first, then apply safe markdown formatting
  var html = escapeHtml(text);

  // Parse markdown tables
  html = html.replace(/((?:^|\n)\|.+\|(?:\n\|[-:| ]+\|)(?:\n\|.+\|)+)/g, function(table) {
    var rows = table.trim().split('\n').filter(function(r) { return r.trim(); });
    if (rows.length < 2) return table;
    var headerCells = rows[0].split('|').filter(function(c) { return c.trim(); });
    var out = '<table><thead><tr>';
    headerCells.forEach(function(c) { out += '<th>' + c.trim() + '</th>'; });
    out += '</tr></thead><tbody>';
    for (var i = 2; i < rows.length; i++) {
      if (rows[i].match(/^[\s|:-]+$/)) continue;
      var cells = rows[i].split('|').filter(function(c) { return c.trim() !== ''; });
      out += '<tr>';
      cells.forEach(function(c) { out += '<td>' + c.trim() + '</td>'; });
      out += '</tr>';
    }
    out += '</tbody></table>';
    return out;
  });

  return html
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^---$/gm, '<hr>')
    .replace(/^- (.+)$/gm, '&bull; $1<br>')
    .replace(/^#{1,2} (.+)$/gm, '<h3 style="color:#FF6A00;margin:16px 0 8px;">$1</h3>')
    .replace(/^### (.+)$/gm, '<strong style="font-size:15px;">$1</strong><br>')
    .replace(/^&gt; (.+)$/gm, '<blockquote style="border-left:3px solid #FF6A00;padding-left:12px;color:rgba(255,255,255,0.5);margin:8px 0;">$1</blockquote>')
    .replace(/\n/g, '<br>');
}

// ─── Start / Continue Conversation (credit deduction) ─────────────
async function startConversation() {
  if (!currentSession) return false;
  try {
    var res = await fetch('/api/merakipilot-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentSession.access_token },
      body: JSON.stringify({ action: 'start_conversation' }),
    });
    if (res.status === 402) { addMessage('No credits remaining. <a href="pricing.html" style="color:#111;text-decoration:underline;">Buy credits</a> to continue.', 'bot'); return false; }
    if (!res.ok) { addMessage('Failed to start conversation. Please try again.', 'bot'); return false; }
    var data = await res.json();
    creditBalance = data.remaining;
    refreshCredits();
    conversationStarted = true;
    msgCount = 0;
    msgLimit = MSGS_PER_CREDIT;
    enableInput();
    return true;
  } catch (e) { addMessage('Error: ' + e.message, 'bot'); return false; }
}

async function continueConversation() {
  var ok = await startConversation();
  if (ok) {
    msgLimit += MSGS_PER_CREDIT;
    addMessage('Added ' + MSGS_PER_CREDIT + ' more messages. Keep going!', 'bot');
  }
}

// ─── Handle User Input (Claude-powered) ───────────────────────────
async function handleSend() {
  var text = chatInput.value.trim();
  if (!text) return;

  if (!currentSession) {
    addMessage('Please <a href="account.html" style="color:#111;text-decoration:underline;">log in</a> to use MerakiPilot.', 'bot');
    return;
  }

  chatInput.value = '';
  chatInput.style.height = 'auto';
  addMessage(text, 'user');

  // Check if this looks like a Meraki API key
  if (!connected && text.length > 30 && !text.includes(' ')) {
    await connectMeraki(text);
    return;
  }

  if (!connected) {
    addMessage("I need your Meraki API key first. Paste it here and I'll connect to your network.", 'bot');
    return;
  }

  // Start conversation (deduct credit) if not started
  if (!conversationStarted) {
    var ok = await startConversation();
    if (!ok) return;
  }

  // Check message limit
  if (msgCount >= msgLimit) {
    showLimitBar();
    return;
  }

  chatHistory.push({ role: 'user', content: text });
  showTyping();
  if (window.neuralVizAnalyzing) window.neuralVizAnalyzing('Processing: ' + text.substring(0, 60) + (text.length > 60 ? '...' : ''));

  try {
    var networkContext = await gatherNetworkContext();
    var maxLoops = 5; // Safety: max fetch-loop iterations

    // ─── Conversation Loop: Claude can fetch data and keep going ───
    for (var loop = 0; loop < maxLoops; loop++) {
      var resp = await fetch('/api/merakipilot-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentSession.access_token },
        body: JSON.stringify({ action: 'chat', messages: chatHistory, networkContext: loop === 0 ? networkContext : null }),
      });

      if (resp.status === 402) {
        hideTyping(); creditBalance = 0; refreshCredits(); showLimitBar(); return;
      }
      if (!resp.ok) {
        hideTyping();
        var err = {}; try { err = await resp.json(); } catch(e) {}
        addMessage('Something went wrong: ' + (err.error || 'Unknown error') + '. Try again.', 'bot');
        return;
      }

      var data = await resp.json();

      // If Claude wants to fetch data, execute and loop back
      if (data.fetches && data.fetches.length > 0) {
        // Show Claude's status message to the user
        if (data.response) {
          hideTyping();
          var cleanedIntermediate = cleanResponse(data.response);
          if (cleanedIntermediate) addMessage(mdToHtml(cleanedIntermediate), 'bot');
          showTyping();
        }

        // Execute all fetches in parallel
        if (window.neuralVizAnalyzing) window.neuralVizAnalyzing('Fetching ' + data.fetches.length + ' endpoint' + (data.fetches.length > 1 ? 's' : '') + '...');
        var fetchResults = await executeFetches(data.fetches);

        // Add Claude's response + fetch results to history for next loop
        chatHistory.push({ role: 'assistant', content: data.response || 'Fetching data...' });
        chatHistory.push({ role: 'user', content: '<fetch_results>\n' + JSON.stringify(fetchResults, null, 2) + '\n</fetch_results>' });

        // Execute any actions that came with the fetches
        if (data.actions && data.actions.length > 0) {
          var actionResults = await executeActions(data.actions);
          chatHistory.push({ role: 'user', content: '<action_results>\n' + JSON.stringify(actionResults, null, 2) + '\n</action_results>' });
        }

        continue; // Loop back to Claude with the results
      }

      // No more fetches — show final response
      hideTyping();
      if (data.response) {
        var cleanedFinal = cleanResponse(data.response);
        if (cleanedFinal) addMessage(mdToHtml(cleanedFinal), 'bot');
        chatHistory.push({ role: 'assistant', content: data.response });
      }
      msgCount++;

      if (msgCount >= msgLimit) { showLimitBar(); }

      if (window.neuralVizDone) window.neuralVizDone();

      // Execute any final actions
      if (data.actions && data.actions.length > 0) {
        if (window.neuralVizAction) window.neuralVizAction('Executing ' + data.actions.length + ' change' + (data.actions.length > 1 ? 's' : '') + '...');
        var actionResults = await executeActions(data.actions);
        var resultSummary = Object.keys(actionResults).map(function(path) {
          var r = actionResults[path];
          return r && r._error ? '&bull; ' + path + ': Failed — ' + r._error : '&bull; ' + path + ': Done';
        }).join('<br>');
        addMessage('<strong>Changes applied:</strong><br>' + resultSummary, 'bot');
      }

      break; // Done
    }

    if (chatHistory.length > 40) chatHistory = chatHistory.slice(-30);

  } catch (e) {
    hideTyping();
    console.error('Chat error:', e);
    addMessage('Lost connection to the AI. Check your internet and try again.', 'bot');
  }
}

// ─── Event Listeners ──────────────────────────────────────────────
sendBtn.addEventListener('click', handleSend);
chatInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
});
chatInput.addEventListener('input', function() {
  chatInput.style.height = 'auto';
  chatInput.style.height = chatInput.scrollHeight + 'px';
});

document.getElementById('continueBtn').addEventListener('click', continueConversation);

document.getElementById('networkSelector').addEventListener('change', function() {
  selectedNetworkId = this.value;
  updateDashboardStats();
  var net = allNetworks.find(function(n) { return n.id === selectedNetworkId; });
  var name = net ? net.name : 'All Networks';
  if (connected) {
    addMessage('Switched to <strong>' + name + '</strong>. My responses will now focus on ' + (selectedNetworkId === 'all' ? 'all networks.' : 'this network.'), 'bot');
  }
});

window.addEventListener('pageshow', function() {
  if (currentSession) refreshCredits();
});
