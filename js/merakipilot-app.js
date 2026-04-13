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
    return { name: d.name || d.model || d.serial, model: d.model, serial: d.serial, lanIp: d.lanIp, status: s.status || 'offline', networkId: d.networkId };
  });
  var networkList = (networks || []).map(function(n) { return { id: n.id, name: n.name, productTypes: n.productTypes }; });

  // Feed the neural visualization
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
  return escapeHtml(text)
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
          addMessage(mdToHtml(data.response), 'bot');
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
        addMessage(mdToHtml(data.response), 'bot');
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
