var MSGS_PER_CREDIT = 5;
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
    document.getElementById('limitMsg').textContent = 'You\'ve used all ' + MSGS_PER_CREDIT + ' messages for this credit.';
    document.getElementById('continueBtn').style.display = 'inline-block';
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
function addMessage(text, sender) {
  var div = document.createElement('div');
  div.className = 'msg ' + (sender || 'bot');
  div.innerHTML = '<div class="msg-bubble">' + text + '</div>';
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
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

// ─── Load Dashboard ───────────────────────────────────────────────
async function loadDashboard() {
  document.getElementById('networkEmpty').style.display = 'none';
  document.getElementById('networkDash').style.display = 'block';
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
  document.getElementById('orgMeta').textContent = netCount + ' network' + (netCount !== 1 ? 's' : '') + ' \u00B7 ' + total + ' device' + (total !== 1 ? 's' : '');

  var rowsEl = document.getElementById('deviceRows');
  rowsEl.innerHTML = '';
  (devices || []).forEach(function(d) {
    var s = statusMap[d.serial] || {};
    var status = s.status || 'offline';
    var row = document.createElement('div');
    row.className = 'device-row';
    row.innerHTML = '<span><span class="device-dot ' + status + '"></span></span>' +
      '<span class="device-name">' + (d.name || d.model || d.serial) + '</span>' +
      '<span class="device-model">' + (d.model || '--') + '</span>' +
      '<span class="device-ip">' + (d.lanIp || '--') + '</span>' +
      '<span class="device-status ' + status + '">' + status + '</span>';
    rowsEl.appendChild(row);
  });
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

// ─── Execute Actions from Claude ──────────────────────────────────
async function executeActions(actions) {
  var results = [];
  for (var i = 0; i < actions.length; i++) {
    var action = actions[i];
    try {
      switch (action.type) {
        case 'reboot': await merakiPost('/devices/' + action.serial + '/reboot', {}); results.push('Reboot sent to ' + action.serial); break;
        case 'blink': await merakiPost('/devices/' + action.serial + '/blinkLeds', { duration: 20 }); results.push('LEDs blinking on ' + action.serial); break;
        case 'enable_ids': await merakiPut('/networks/' + action.networkId + '/appliance/security/intrusion', { mode: action.mode || 'prevention', idsRulesets: 'balanced' }); results.push('IDS enabled'); break;
        case 'enable_malware': await merakiPut('/networks/' + action.networkId + '/appliance/security/malware', { mode: 'enabled' }); results.push('Malware protection enabled'); break;
        case 'enable_ssid': await merakiPut('/networks/' + action.networkId + '/wireless/ssids/' + action.ssidNumber, { enabled: true }); results.push('SSID enabled'); break;
        case 'disable_ssid': await merakiPut('/networks/' + action.networkId + '/wireless/ssids/' + action.ssidNumber, { enabled: false }); results.push('SSID disabled'); break;
        default: results.push('Unknown action: ' + action.type);
      }
    } catch (e) { results.push('Failed: ' + action.type + ' — ' + e.message); }
  }
  if (results.length > 0) await loadDashboard();
  return results;
}

// ─── Markdown to HTML ─────────────────────────────────────────────
function mdToHtml(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '&bull; $1<br>')
    .replace(/^### (.+)$/gm, '<strong style="font-size:15px;">$1</strong><br>')
    .replace(/^## (.+)$/gm, '<strong style="font-size:16px;">$1</strong><br>')
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

  try {
    var networkContext = await gatherNetworkContext();

    var resp = await fetch('/api/merakipilot-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentSession.access_token },
      body: JSON.stringify({ action: 'chat', messages: chatHistory, networkContext: networkContext }),
    });

    hideTyping();

    if (resp.status === 402) {
      creditBalance = 0;
      refreshCredits();
      showLimitBar();
      return;
    }

    if (!resp.ok) {
      var err = {};
      try { err = await resp.json(); } catch(e) {}
      addMessage('Something went wrong: ' + (err.error || 'Unknown error') + '. Try again.', 'bot');
      return;
    }

    var data = await resp.json();
    addMessage(mdToHtml(data.response), 'bot');
    chatHistory.push({ role: 'assistant', content: data.response });
    msgCount++;

    // Check limit after response
    if (msgCount >= msgLimit) {
      showLimitBar();
    }

    // Execute any actions Claude instructed
    if (data.actions && data.actions.length > 0) {
      var results = await executeActions(data.actions);
      if (results.length > 0) {
        addMessage('<strong>Actions executed:</strong><br>' + results.map(function(r) { return '&bull; ' + r; }).join('<br>'), 'bot');
      }
    }

    // Refresh dashboard contextually
    var lower = text.toLowerCase();
    if (lower.includes('refresh') || lower.includes('device') || lower.includes('show')) {
      await loadDashboard();
    }

    if (chatHistory.length > 30) chatHistory = chatHistory.slice(-20);

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
