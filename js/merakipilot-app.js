var MSGS_PER_CREDIT = 10;
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
  if (!currentSession) return { errors: ['Not authenticated — session expired'] };
  try {
    var resp = await fetch('/api/meraki-proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + currentSession.access_token,
      },
      body: JSON.stringify({ merakiKey: merakiKey, method: method || 'GET', path: path, body: body }),
    });
    var data = await resp.json().catch(function() { return null; });
    if (!resp.ok) {
      console.error('Meraki proxy error:', resp.status, data);
      // Return the error from Meraki so Claude and the user can see what went wrong
      if (data && data.errors) return { errors: data.errors, _status: resp.status };
      if (data && data.error) return { errors: [data.error], _status: resp.status };
      return { errors: ['Meraki API returned status ' + resp.status], _status: resp.status };
    }
    return data;
  } catch (e) {
    console.error('Meraki API error:', e);
    return { errors: ['Network error: ' + e.message] };
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

  if (!orgs || !Array.isArray(orgs) || orgs.length === 0) {
    var errDetail = (orgs && orgs.errors) ? '<br><span style="font-size:12px;color:#ef4444;">' + orgs.errors.join('; ') + '</span>' : '';
    addMessage("That API key didn't work. I couldn't find any organizations. Double-check the key and try again." + errDetail, 'bot');
    merakiKey = null;
    return;
  }

  // If multiple orgs, let the user choose
  if (orgs.length > 1) {
    var orgHtml = '<strong>Found ' + orgs.length + ' organizations:</strong><br><br>';
    orgs.forEach(function(org, i) {
      orgHtml += '<button class="org-select-btn" data-org-index="' + i + '" style="display:block;width:100%;text-align:left;padding:12px 16px;margin-bottom:8px;background:rgba(255,106,0,0.06);border:1px solid rgba(255,106,0,0.2);border-radius:10px;color:#f1f5f9;font-family:inherit;font-size:14px;cursor:pointer;transition:all 0.2s;">' +
        '<strong style="color:#FF6A00;">' + (org.name || 'Unnamed Org') + '</strong>' +
        '<br><span style="font-size:12px;color:#94a3b8;">ID: ' + org.id + '</span>' +
        '</button>';
    });
    orgHtml += '<span style="font-size:12px;color:#94a3b8;">Click an organization to connect.</span>';
    addMessage(orgHtml, 'bot');

    // Store orgs for selection and bind click handlers
    window._pendingOrgs = orgs;
    setTimeout(function() {
      document.querySelectorAll('.org-select-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var idx = parseInt(this.getAttribute('data-org-index'));
          selectOrg(window._pendingOrgs[idx]);
        });
        btn.addEventListener('mouseenter', function() { this.style.borderColor = '#FF6A00'; this.style.background = 'rgba(255,106,0,0.12)'; });
        btn.addEventListener('mouseleave', function() { this.style.borderColor = 'rgba(255,106,0,0.2)'; this.style.background = 'rgba(255,106,0,0.06)'; });
      });
    }, 100);
    return;
  }

  await selectOrg(orgs[0]);
}

async function selectOrg(org) {
  orgData = org;
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

  // Offer to save key (only if not already saved for this org)
  if (currentSession && merakiKey) {
    var existing = await sb.from('meraki_keys').select('id').eq('user_id', currentSession.user.id).eq('org_id', orgData.id);
    if (!existing.data || existing.data.length === 0) {
      offerSaveKey(merakiKey, orgData.name, orgData.id);
    }
  }
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

  var statusMap = {};
  (statuses || []).forEach(function(s) { statusMap[s.serial] = s; });

  var total = (devices || []).length;
  var online = (statuses || []).filter(function(s) { return s.status === 'online'; }).length;
  var offline = total - online;
  var netCount = (networks || []).length;

  document.getElementById('statDevices').textContent = total;
  document.getElementById('statOnline').textContent = online;
  document.getElementById('statOffline').textContent = offline;
  document.getElementById('statNetworks').textContent = netCount;
  document.getElementById('neuralStats').style.display = 'flex';
  document.getElementById('orgMeta').textContent = netCount + ' network' + (netCount !== 1 ? 's' : '') + ' \u00B7 ' + total + ' device' + (total !== 1 ? 's' : '');
  var previewNet = document.getElementById('previewNet');
  if (previewNet) previewNet.style.display = 'none';

  // Build device list with status for neural viz
  var deviceList = (devices || []).map(function(d) {
    var s = statusMap[d.serial] || {};
    return { name: d.name || d.model || d.serial, model: d.model, serial: d.serial, lanIp: d.lanIp, status: s.status || 'offline', networkId: d.networkId, clients: 0 };
  });
  var networkList = (networks || []).map(function(n) { return { id: n.id, name: n.name, productTypes: n.productTypes }; });

  // Fetch client counts per network (non-blocking — viz updates after)
  (networks || []).forEach(function(net) {
    merakiGet('/networks/' + net.id + '/clients?perPage=5&timespan=86400').then(function(clients) {
      if (!clients || !Array.isArray(clients)) return;
      // Count clients per device serial
      var counts = {};
      clients.forEach(function(c) {
        if (c.recentDeviceSerial) {
          counts[c.recentDeviceSerial] = (counts[c.recentDeviceSerial] || 0) + 1;
        }
      });
      // Update device list and refresh viz
      var updated = false;
      deviceList.forEach(function(d) {
        if (counts[d.serial]) { d.clients = counts[d.serial]; updated = true; }
      });
      if (updated && window.neuralVizUpdate) {
        window.neuralVizUpdate({ devices: deviceList, networks: networkList });
      }
    }).catch(function() {});
  });

  // Feed the neural visualization immediately (client counts update async)
  if (window.neuralVizUpdate) {
    window.neuralVizUpdate({ devices: deviceList, networks: networkList });
  }
}

// ─── Gather Network Context for Claude ────────────────────────────
async function gatherNetworkContext() {
  if (!connected || !orgData) return null;
  try {
    var results = await Promise.all([
      merakiGet('/organizations/' + orgData.id + '/devices'),
      merakiGet('/organizations/' + orgData.id + '/devices/statuses'),
      merakiGet('/organizations/' + orgData.id + '/networks'),
    ]);
    var devices = results[0], statuses = results[1], networks = results[2];
    var statusMap = {};
    (statuses || []).forEach(function(s) { statusMap[s.serial] = s; });
    var deviceList = (devices || []).map(function(d) {
      var s = statusMap[d.serial] || {};
      return { name: d.name || d.model || d.serial, model: d.model, serial: d.serial, lanIp: d.lanIp, status: s.status || 'unknown', networkId: d.networkId };
    });
    var networkList = (networks || []).map(function(n) { return { id: n.id, name: n.name, productTypes: n.productTypes }; });
    return {
      orgName: orgData.name, orgId: orgData.id,
      totalDevices: deviceList.length,
      onlineDevices: deviceList.filter(function(d) { return d.status === 'online'; }).length,
      offlineDevices: deviceList.filter(function(d) { return d.status !== 'online'; }),
      devices: deviceList, networks: networkList,
    };
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
  var failures = [];
  for (var i = 0; i < actions.length; i++) {
    var a = actions[i];
    try {
      var method = (a.method || 'GET').toUpperCase();
      var data;
      if (method === 'POST') data = await merakiPost(a.path, a.body || {});
      else if (method === 'PUT') data = await merakiPut(a.path, a.body || {});
      else data = await merakiGet(a.path);

      // Check if the Meraki API returned an error
      if (data && data.errors) {
        var errMsg = data.errors.join('; ');
        results[a.path] = { _error: errMsg, _status: data._status };
        failures.push(a.path + ': ' + errMsg);
      } else if (data === null) {
        results[a.path] = { _error: 'No response from Meraki API' };
        failures.push(a.path + ': No response');
      } else {
        results[a.path] = data;
      }
    } catch (e) {
      results[a.path] = { _error: e.message };
      failures.push(a.path + ': ' + e.message);
    }
  }
  // Report failures prominently so Claude doesn't hallucinate success
  if (failures.length > 0) {
    addMessage('<strong style="color:#ef4444;">Action failed:</strong><br>' + failures.map(function(f) { return '&bull; ' + f; }).join('<br>') + '<br><br><span style="color:#94a3b8;font-size:12px;">The requested changes were NOT applied. The AI may need to try a different approach.</span>', 'bot');
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

  // Handle org switch command
  var lower = text.toLowerCase().trim();
  if (lower === 'switch org' || lower === 'switch organization' || lower === 'change org' || lower === 'change organization') {
    showTyping();
    var orgs = await merakiGet('/organizations');
    hideTyping();
    if (!orgs || orgs.length <= 1) {
      addMessage('Only one organization is available on this API key.', 'bot');
      return;
    }
    var orgHtml = '<strong>Switch organization:</strong><br><br>';
    orgs.forEach(function(org, i) {
      var isCurrent = orgData && org.id === orgData.id;
      orgHtml += '<button class="org-select-btn" data-org-index="' + i + '" style="display:block;width:100%;text-align:left;padding:12px 16px;margin-bottom:8px;background:' + (isCurrent ? 'rgba(34,197,94,0.08)' : 'rgba(255,106,0,0.06)') + ';border:1px solid ' + (isCurrent ? 'rgba(34,197,94,0.3)' : 'rgba(255,106,0,0.2)') + ';border-radius:10px;color:#f1f5f9;font-family:inherit;font-size:14px;cursor:pointer;transition:all 0.2s;">' +
        '<strong style="color:' + (isCurrent ? '#22c55e' : '#FF6A00') + ';">' + (org.name || 'Unnamed Org') + '</strong>' +
        (isCurrent ? ' <span style="font-size:11px;color:#22c55e;">(current)</span>' : '') +
        '<br><span style="font-size:12px;color:#94a3b8;">ID: ' + org.id + '</span>' +
        '</button>';
    });
    addMessage(orgHtml, 'bot');
    window._pendingOrgs = orgs;
    setTimeout(function() {
      document.querySelectorAll('.org-select-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var idx = parseInt(this.getAttribute('data-org-index'));
          selectOrg(window._pendingOrgs[idx]);
        });
        btn.addEventListener('mouseenter', function() { this.style.borderColor = '#FF6A00'; this.style.background = 'rgba(255,106,0,0.12)'; });
        btn.addEventListener('mouseleave', function() { this.style.borderColor = 'rgba(255,106,0,0.2)'; this.style.background = 'rgba(255,106,0,0.06)'; });
      });
    }, 100);
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
    var maxLoops = 8; // Safety: max fetch-loop iterations (higher for complex MSP workflows)

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

window.addEventListener('pageshow', function() {
  if (currentSession) refreshCredits();
});

// ─── Encrypted API Key Storage (Web Crypto API) ─────────────────
// Keys are encrypted in the browser with AES-256-GCM.
// The encryption key is derived from the user's password via PBKDF2.
// The server only ever sees the encrypted blob — never the raw API key.

function b64Encode(buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))); }
function b64Decode(str) { var bin = atob(str); var buf = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i); return buf; }

async function deriveKey(password, salt) {
  var enc = new TextEncoder();
  var keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt, iterations: 310000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptKey(apiKey, password) {
  var salt = crypto.getRandomValues(new Uint8Array(16));
  var iv = crypto.getRandomValues(new Uint8Array(12));
  var key = await deriveKey(password, salt);
  var enc = new TextEncoder();
  var encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, enc.encode(apiKey));
  return { encrypted: b64Encode(encrypted), salt: b64Encode(salt), iv: b64Encode(iv) };
}

async function decryptKey(encryptedB64, saltB64, ivB64, password) {
  var salt = b64Decode(saltB64);
  var iv = b64Decode(ivB64);
  var encrypted = b64Decode(encryptedB64);
  var key = await deriveKey(password, salt);
  var decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, encrypted);
  return new TextDecoder().decode(decrypted);
}

// ─── Save Key Flow ──────────────────────────────────────────────
var pendingSaveKey = null;

function offerSaveKey(rawKey, orgName, orgId) {
  pendingSaveKey = { key: rawKey, orgName: orgName, orgId: orgId };
  var hint = '••••' + rawKey.slice(-4);
  var html = '<div class="save-key-banner" id="saveKeyBanner">' +
    '<p>Save this API key (<code>' + hint + '</code>) for <strong>' + escapeHtml(orgName) + '</strong> so you don\'t have to paste it next time?</p>' +
    '<div class="save-actions">' +
    '<button class="key-action-btn use" onclick="promptSavePassword()">Save Key</button>' +
    '<button class="key-action-btn del" onclick="dismissSaveBanner()">No Thanks</button>' +
    '</div></div>';
  addMessage(html, 'bot');
}

function dismissSaveBanner() {
  pendingSaveKey = null;
  var banner = document.getElementById('saveKeyBanner');
  if (banner) banner.closest('.msg').remove();
}

function promptSavePassword() {
  var banner = document.getElementById('saveKeyBanner');
  if (banner) banner.closest('.msg').remove();

  var html = '<div style="padding:16px;background:rgba(255,106,0,0.04);border:1px solid rgba(255,106,0,0.15);border-radius:10px;">' +
    '<p style="font-size:13px;color:#94a3b8;margin-bottom:10px;"><strong style="color:#f1f5f9;">Encrypt & Save</strong><br>Enter your CapitaCoreAI login password to encrypt this key. We never see your password or raw key.</p>' +
    '<input type="password" id="saveKeyPassword" placeholder="Your CapitaCoreAI password" style="width:100%;padding:10px 14px;background:#0a0a0a;border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#f1f5f9;font-size:14px;font-family:inherit;outline:none;margin-bottom:8px;">' +
    '<div id="saveKeyError" style="font-size:12px;color:#ef4444;display:none;margin-bottom:6px;"></div>' +
    '<div style="display:flex;gap:8px;">' +
    '<button class="key-action-btn use" onclick="executeSaveKey()">Encrypt & Save</button>' +
    '<button class="key-action-btn del" onclick="dismissSaveBanner()">Cancel</button>' +
    '</div></div>';
  addMessage(html, 'bot');

  setTimeout(function() {
    var input = document.getElementById('saveKeyPassword');
    if (input) {
      input.focus();
      input.addEventListener('keydown', function(e) { if (e.key === 'Enter') executeSaveKey(); });
    }
  }, 100);
}

async function executeSaveKey() {
  if (!pendingSaveKey || !currentSession) return;
  var passwordInput = document.getElementById('saveKeyPassword');
  var errorEl = document.getElementById('saveKeyError');
  var password = passwordInput ? passwordInput.value : '';
  if (!password) { if (errorEl) { errorEl.textContent = 'Password required.'; errorEl.style.display = 'block'; } return; }

  // Verify password by attempting to sign in
  var email = currentSession.user.email;
  var authCheck = await sb.auth.signInWithPassword({ email: email, password: password });
  if (authCheck.error) {
    if (errorEl) { errorEl.textContent = 'Wrong password. Please enter your CapitaCoreAI login password.'; errorEl.style.display = 'block'; }
    return;
  }

  try {
    var encrypted = await encryptKey(pendingSaveKey.key, password);
    var hint = pendingSaveKey.key.slice(-4);

    var res = await sb.from('meraki_keys').insert({
      user_id: currentSession.user.id,
      label: pendingSaveKey.orgName || 'Meraki Key',
      org_id: pendingSaveKey.orgId || null,
      encrypted_key: encrypted.encrypted,
      salt: encrypted.salt,
      iv: encrypted.iv,
      key_hint: hint,
    });

    if (res.error) {
      if (errorEl) { errorEl.textContent = 'Failed to save: ' + res.error.message; errorEl.style.display = 'block'; }
      return;
    }

    pendingSaveKey = null;
    // Remove the save prompt and show success
    var msgs = document.querySelectorAll('.msg.bot');
    var lastMsg = msgs[msgs.length - 1];
    if (lastMsg) lastMsg.remove();
    addMessage('<span style="color:#22c55e;">Key saved and encrypted.</span> You can access it anytime from <strong>My Keys</strong> in the top bar.', 'bot');
    document.getElementById('myKeysBtn').style.display = 'inline-flex';
  } catch (e) {
    if (errorEl) { errorEl.textContent = 'Encryption failed: ' + e.message; errorEl.style.display = 'block'; }
  }
}

// ─── Load & Display Saved Keys ──────────────────────────────────
async function loadSavedKeys() {
  if (!currentSession) return;
  var res = await sb.from('meraki_keys').select('*').eq('user_id', currentSession.user.id).order('created_at', { ascending: false });
  var keys = (res.data || []);
  var list = document.getElementById('keysList');

  if (keys.length === 0) {
    list.innerHTML = '<div class="keys-empty">No saved API keys yet.<br>Connect a Meraki API key and you\'ll be offered to save it.</div>';
    return;
  }

  var html = '';
  keys.forEach(function(k) {
    var date = new Date(k.created_at).toLocaleDateString();
    html += '<div class="key-item" data-key-id="' + k.id + '">' +
      '<div class="key-item-info">' +
      '<div class="key-item-label">' + escapeHtml(k.label) + '</div>' +
      '<div class="key-item-hint">••••••••' + escapeHtml(k.key_hint || '????') + '</div>' +
      '<div class="key-item-date">Saved ' + date + '</div>' +
      '</div>' +
      '<div class="key-item-actions">' +
      '<button class="key-action-btn use" onclick="useKey(\'' + k.id + '\')">Use</button>' +
      '<button class="key-action-btn del" onclick="deleteKey(\'' + k.id + '\')">Delete</button>' +
      '</div></div>';
  });
  list.innerHTML = html;
}

var pendingUseKeyId = null;

function useKey(keyId) {
  pendingUseKeyId = keyId;
  var prompt = document.getElementById('keysPasswordPrompt');
  var input = document.getElementById('keysPasswordInput');
  var error = document.getElementById('keysPasswordError');
  prompt.style.display = 'block';
  error.style.display = 'none';
  input.value = '';
  input.focus();
}

async function submitUseKey() {
  if (!pendingUseKeyId || !currentSession) return;
  var input = document.getElementById('keysPasswordInput');
  var error = document.getElementById('keysPasswordError');
  var password = input.value;
  if (!password) { error.textContent = 'Password required.'; error.style.display = 'block'; return; }

  // Verify password
  var authCheck = await sb.auth.signInWithPassword({ email: currentSession.user.email, password: password });
  if (authCheck.error) {
    error.textContent = 'Wrong password. Enter your CapitaCoreAI login password.';
    error.style.display = 'block';
    return;
  }

  // Find the key
  var res = await sb.from('meraki_keys').select('*').eq('id', pendingUseKeyId).single();
  if (!res.data) { error.textContent = 'Key not found.'; error.style.display = 'block'; return; }

  try {
    var rawKey = await decryptKey(res.data.encrypted_key, res.data.salt, res.data.iv, password);
    // Close modal and connect
    closeKeysModal();
    addMessage('Connecting with saved key for <strong>' + escapeHtml(res.data.label) + '</strong>...', 'bot');
    await connectMeraki(rawKey);
  } catch (e) {
    error.textContent = 'Decryption failed — wrong password or corrupted key.';
    error.style.display = 'block';
  }
}

async function deleteKey(keyId) {
  if (!confirm('Delete this saved API key? This cannot be undone.')) return;
  await sb.from('meraki_keys').delete().eq('id', keyId).eq('user_id', currentSession.user.id);
  loadSavedKeys();
}

function openKeysModal() {
  loadSavedKeys();
  document.getElementById('keysOverlay').classList.add('active');
  document.getElementById('keysPasswordPrompt').style.display = 'none';
}

function closeKeysModal() {
  document.getElementById('keysOverlay').classList.remove('active');
  document.getElementById('keysPasswordPrompt').style.display = 'none';
  pendingUseKeyId = null;
}

// ─── Key management event listeners ─────────────────────────────
document.getElementById('myKeysBtn').addEventListener('click', openKeysModal);
document.getElementById('keysClose').addEventListener('click', closeKeysModal);
document.getElementById('keysOverlay').addEventListener('click', function(e) {
  if (e.target === document.getElementById('keysOverlay')) closeKeysModal();
});
document.getElementById('keysPasswordSubmit').addEventListener('click', submitUseKey);
document.getElementById('keysPasswordCancel').addEventListener('click', function() {
  document.getElementById('keysPasswordPrompt').style.display = 'none';
  pendingUseKeyId = null;
});
document.getElementById('keysPasswordInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') submitUseKey();
});

// Show "My Keys" button if user has saved keys
(async function checkSavedKeys() {
  // Wait for auth
  var waitCount = 0;
  var interval = setInterval(async function() {
    waitCount++;
    if (waitCount > 20) { clearInterval(interval); return; }
    if (!currentSession) return;
    clearInterval(interval);
    var res = await sb.from('meraki_keys').select('id', { count: 'exact', head: true }).eq('user_id', currentSession.user.id);
    if (res.count > 0) {
      document.getElementById('myKeysBtn').style.display = 'inline-flex';
    }
  }, 500);
})();
