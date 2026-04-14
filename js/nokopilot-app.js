var MSGS_PER_CREDIT = 10;
var CREDIT_COST = 2;
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
var allOrgs = [];
var selectedNetworkId = 'all';

var chatMessages = document.getElementById('chatMessages');
var chatInput = document.getElementById('chatInput');
var sendBtn = document.getElementById('sendBtn');

// ─── Auth Gate ────────────────────────────────────────────────────
(async function() {
  var result = await sb.auth.getSession();
  currentSession = result.data.session;
  if (!currentSession) {
    addMessage('<strong>Please log in to use NokoPilot.</strong><br><br><a href="account.html" style="color:#111;text-decoration:underline;">Log in or create an account</a> to get started.', 'bot');
    chatInput.disabled = true;
    chatInput.placeholder = 'Log in to continue...';
    sendBtn.disabled = true;
    return;
  }
  await refreshCredits();
  addMessage(
    '<strong>Welcome to NokoPilot.</strong><br><br>' +
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
  return text
    // Strip tagged blocks (raw and HTML-escaped)
    .replace(/<fetch_results>[\s\S]*?<\/fetch_results>/g, '')
    .replace(/&lt;fetch_results&gt;[\s\S]*?&lt;\/fetch_results&gt;/g, '')
    .replace(/<action_results>[\s\S]*?<\/action_results>/g, '')
    .replace(/&lt;action_results&gt;[\s\S]*?&lt;\/action_results&gt;/g, '')
    .replace(/<network_data>[\s\S]*?<\/network_data>/g, '')
    .replace(/&lt;network_data&gt;[\s\S]*?&lt;\/network_data&gt;/g, '')
    // Strip markdown JSON code blocks
    .replace(/```json[\s\S]*?```/g, '')
    .replace(/```[\s\S]*?```/g, '')
    // Strip raw JSON arrays/objects longer than 200 chars (data dumps)
    .replace(/\[?\{[^{}]*"[a-zA-Z]+"[^{}]*\}(?:\s*,\s*\{[^{}]*\})*\]?/g, function(match) {
      return match.length > 200 ? '' : match;
    })
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
  var reportHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>NokoPilot Security Audit Report</title>' +
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
    '<h1>NokoPilot Security Audit</h1>' +
    '<div class="org">' + (orgData ? orgData.name : 'Network Audit') + '</div>' +
    '<div class="subtitle">Generated ' + new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) + ' by CapitaCoreAI</div>' +
    '</div>' +
    html +
    '<div class="report-footer">' +
    '<p><span class="brand">NokoPilot</span> by CapitaCoreAI &middot; capitacoreai.io</p>' +
    '<p>This report was generated by AI and should be verified by a network administrator.</p>' +
    '</div></body></html>';

  // Download as HTML file
  var blob = new Blob([reportHtml], { type: 'text/html' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'NokoPilot-Security-Audit-' + new Date().toISOString().split('T')[0] + '.html';
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
  // Get current session — only refresh if token is near expiry
  if (!currentSession || !currentSession.access_token) {
    try {
      var freshSession = await sb.auth.getSession();
      if (freshSession.data.session) currentSession = freshSession.data.session;
    } catch (e) {}
  }
  if (!currentSession || !currentSession.access_token) {
    addMessage('Session expired. Please <a href="account.html" style="color:#FF6A00;">log in again</a>.', 'bot');
    return { errors: ['Not authenticated — session expired'] };
  }
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
  var chip = document.getElementById('statusChip');
  chip.className = 'status-chip';
  chip.querySelector('#statusText').textContent = 'Connecting...';

  var orgs;
  try {
    orgs = await merakiGet('/organizations');
  } catch (e) {
    chip.className = 'status-chip disconnected';
    chip.querySelector('#statusText').textContent = 'Not Connected';
    hideTyping();
    addMessage("Connection failed: " + e.message + ". Check your internet and try again.", 'bot');
    merakiKey = null;
    return;
  }
  hideTyping();

  if (!orgs || !Array.isArray(orgs) || orgs.length === 0) {
    var errDetail = (orgs && orgs.errors) ? '<br><span style="font-size:12px;color:#ef4444;">' + orgs.errors.join('; ') + '</span>' : '';
    addMessage("That API key didn't work. I couldn't find any organizations. Double-check the key and try again." + errDetail, 'bot');
    merakiKey = null;
    return;
  }

  allOrgs = orgs;

  // Populate org selector dropdown
  var orgSelector = document.getElementById('orgSelector');
  orgSelector.innerHTML = '';
  orgs.forEach(function(o) {
    var opt = document.createElement('option');
    opt.value = o.id;
    opt.textContent = o.name;
    orgSelector.appendChild(opt);
  });
  if (orgs.length > 1) {
    orgSelector.style.display = 'block';
    var orgLabel = document.getElementById('orgLabel');
    if (orgLabel) orgLabel.classList.add('visible');
  }
  var netLabel = document.getElementById('netLabel');
  if (netLabel) netLabel.classList.add('visible');

  // If multiple orgs, prompt the user to choose
  if (orgs.length > 1) {
    var orgHtml = '<strong>Found ' + orgs.length + ' organizations.</strong> Which one do you want to connect to?<br><br>';
    orgs.forEach(function(org, i) {
      orgHtml += '<button class="org-pick-btn" data-org-idx="' + i + '" style="display:block;width:100%;text-align:left;padding:12px 16px;margin-bottom:8px;background:rgba(255,106,0,0.06);border:1px solid rgba(255,106,0,0.2);border-radius:10px;color:#f1f5f9;font-family:inherit;font-size:14px;cursor:pointer;transition:all 0.2s;">' +
        '<strong style="color:#FF6A00;">' + escapeHtml(org.name) + '</strong>' +
        '<br><span style="font-size:12px;color:#94a3b8;">ID: ' + org.id + '</span>' +
        '</button>';
    });
    addMessage(orgHtml, 'bot');

    // Bind click handlers
    setTimeout(function() {
      document.querySelectorAll('.org-pick-btn').forEach(function(btn) {
        btn.addEventListener('click', async function() {
          var idx = parseInt(this.getAttribute('data-org-idx'));
          var selectedOrg = allOrgs[idx];
          // Remove the org selection message
          var msgs = document.querySelectorAll('.msg.bot');
          if (msgs.length) msgs[msgs.length - 1].remove();
          // Connect to selected org
          orgData = selectedOrg;
          orgSelector.value = selectedOrg.id;
          connected = true;
          var chip = document.getElementById('statusChip');
          chip.className = 'status-chip';
          chip.querySelector('#statusText').textContent = orgData.name;
          addMessage('Connecting to <strong>' + escapeHtml(orgData.name) + '</strong>...', 'bot');
          await loadDashboard();
          addMessage(
            'Your dashboard is ready — ' + allNetworks.length + ' networks, ' + allDevices.length + ' devices.<br><br>' +
            'Try asking me:<br>' +
            '<code>Show offline devices</code><br>' +
            '<code>Run a health scan</code><br>' +
            '<code>Are my networks secure?</code>',
            'bot'
          );
          if (currentSession && merakiKey && orgData) {
            var existing = await sb.from('meraki_keys').select('id').eq('user_id', currentSession.user.id).eq('org_id', orgData.id);
            if (!existing.data || existing.data.length === 0) offerSaveKey(merakiKey, orgData.name, orgData.id);
          }
        });
        btn.addEventListener('mouseenter', function() { this.style.borderColor = '#FF6A00'; this.style.background = 'rgba(255,106,0,0.12)'; });
        btn.addEventListener('mouseleave', function() { this.style.borderColor = 'rgba(255,106,0,0.2)'; this.style.background = 'rgba(255,106,0,0.06)'; });
      });
    }, 100);
    return;
  }

  // Single org — connect immediately
  orgData = orgs[0];
  orgSelector.value = orgData.id;
  connected = true;

  var chip = document.getElementById('statusChip');
  chip.className = 'status-chip';
  chip.querySelector('#statusText').textContent = orgData.name;

  addMessage('Connected to <strong>' + escapeHtml(orgData.name) + '</strong>. Loading your network...', 'bot');
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

  // Offer to save key if not already saved for this org
  if (currentSession && merakiKey && orgData) {
    var existing = await sb.from('meraki_keys').select('id').eq('user_id', currentSession.user.id).eq('org_id', orgData.id);
    if (!existing.data || existing.data.length === 0) {
      offerSaveKey(merakiKey, orgData.name, orgData.id);
    }
  }
}

async function switchOrg(orgId) {
  var org = allOrgs.find(function(o) { return o.id === orgId; });
  if (!org) return;
  orgData = org;
  connected = true;
  selectedNetworkId = 'all';
  var selector = document.getElementById('networkSelector');
  selector.value = 'all';

  var chip = document.getElementById('statusChip');
  chip.querySelector('#statusText').textContent = orgData.name;

  addMessage('Switching to <strong>' + orgData.name + '</strong>...', 'bot');
  showTyping();
  await loadDashboard();
  hideTyping();
  addMessage('Now viewing <strong>' + orgData.name + '</strong> — ' + allNetworks.length + ' network' + (allNetworks.length !== 1 ? 's' : '') + ', ' + allDevices.length + ' device' + (allDevices.length !== 1 ? 's' : '') + '.', 'bot');
}

// ─── Load Dashboard → Feed Neural Viz ─────────────────────────────
async function loadDashboard() {
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
  renderCliTopology(filtered.devices, filtered.networks);
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

// ─── CLI Terminal ───────────────────────────────────────────────
var cliBody = document.getElementById('cliBody');
var cliBadge = document.getElementById('cliBadge');
var cliTitle = document.getElementById('cliTitle');

function cliBadgeSet(text, cls) {
  cliBadge.textContent = text;
  cliBadge.className = 'cli-badge' + (cls ? ' ' + cls : '');
}

// Welcome message
cliAddLine('<span class="dim">NokoPilot CLI v1.0 — CapitaCoreAI</span>');
cliAddLine('<span class="dim">Paste your Meraki API key in the chat to connect.</span>');
cliAddLine('<span class="dim">───────────────────────────────────────</span>');
cliAddCursor();

function cliAddLine(html) {
  var line = document.createElement('div');
  line.className = 'cli-line';
  line.innerHTML = html;
  cliBody.appendChild(line);
  cliBody.scrollTop = cliBody.scrollHeight;
}

function cliAddPrompt(cmd) {
  cliAddLine('<span class="prompt">noko#</span> <span class="cmd">' + cmd + '</span>');
}

function cliAddOutput(text, cls) {
  cliAddLine('<span class="' + (cls || 'output') + '">' + text + '</span>');
}

function cliAddCursor() {
  var cursor = document.createElement('div');
  cursor.className = 'cli-line';
  cursor.id = 'cliCursorLine';
  cursor.innerHTML = '<span class="prompt">noko#</span> <span class="cli-cursor"></span>';
  cliBody.appendChild(cursor);
  cliBody.scrollTop = cliBody.scrollHeight;
}

function cliRemoveCursor() {
  var c = document.getElementById('cliCursorLine');
  if (c) c.remove();
}

// Map Meraki API paths to realistic CLI commands
function pathToCliCommand(path, method) {
  var m = method || 'GET';
  // Organizations
  if (path.match(/\/organizations\/[^/]+\/devices\/statuses/)) return 'show devices status';
  if (path.match(/\/organizations\/[^/]+\/devices$/)) return 'show inventory devices';
  if (path.match(/\/organizations\/[^/]+\/networks/)) return 'show networks';
  if (path.match(/\/organizations\/[^/]+\/uplinks/)) return 'show uplinks status';
  if (path.match(/\/organizations\/[^/]+\/licenses/)) return 'show license';
  if (path.match(/\/organizations\/[^/]+\/firmware/)) return 'show firmware upgrades';
  if (path.match(/\/organizations$/)) return 'show organizations';
  // Security
  if (path.includes('/security/intrusion')) return m === 'PUT' ? 'configure security intrusion-prevention' : 'show security intrusion-detection';
  if (path.includes('/security/malware')) return m === 'PUT' ? 'configure security malware-protection' : 'show security malware-protection';
  if (path.includes('/contentFiltering')) return m === 'PUT' ? 'configure content-filter' : 'show content-filter';
  // Firewall
  if (path.includes('/l3FirewallRules')) return m === 'PUT' ? 'configure access-list' : 'show access-lists';
  if (path.includes('/l7FirewallRules')) return m === 'PUT' ? 'configure app-firewall' : 'show app-firewall rules';
  if (path.includes('/portForwardingRules')) return 'show ip nat translations';
  if (path.includes('/oneToOneNat')) return 'show ip nat static';
  if (path.includes('/oneToManyNat')) return 'show ip nat pool';
  // VPN
  if (path.includes('/vpn/siteToSiteVpn')) return m === 'PUT' ? 'configure crypto isakmp policy' : 'show crypto ipsec sa';
  // VLANs
  if (path.includes('/appliance/vlans') && m === 'POST') return 'vlan ' + (path.split('/').pop() || 'new');
  if (path.includes('/appliance/vlans') && m === 'DELETE') return 'no vlan ' + path.split('/').pop();
  if (path.includes('/appliance/vlans')) return m === 'PUT' ? 'configure vlan' : 'show vlan brief';
  if (path.includes('/singleLan')) return 'show ip interface brief';
  // Wireless
  if (path.includes('/wireless/ssids') && m === 'PUT') return 'configure dot11 ssid';
  if (path.includes('/wireless/ssids')) return 'show dot11 associations';
  if (path.includes('/wireless/rfProfiles')) return 'show dot11 radio';
  if (path.includes('/wireless/settings')) return 'show wireless config';
  // Switch
  if (path.includes('/switch/ports/statuses')) return 'show interfaces status';
  if (path.includes('/switch/ports') && m === 'PUT') return 'configure interface';
  if (path.includes('/switch/ports')) return 'show interfaces switchport';
  if (path.includes('/switch/stp')) return m === 'PUT' ? 'configure spanning-tree' : 'show spanning-tree';
  if (path.includes('/switch/accessPolicies')) return 'show dot1x';
  // Devices
  if (path.includes('/reboot')) return 'reload';
  if (path.includes('/devices/remove')) return 'no network-device';
  if (path.includes('/devices/claim')) return 'network-device add';
  if (path.match(/\/devices\/[^/]+$/) && m === 'PUT') return 'configure hostname';
  if (path.match(/\/devices\/[^/]+$/)) return 'show version';
  if (path.includes('/lldpCdp')) return 'show cdp neighbors';
  if (path.includes('/managementInterface')) return 'show ip interface management';
  if (path.includes('/clients')) return 'show mac address-table';
  // Network
  if (path.match(/\/networks\/[^/]+$/) && m === 'PUT') return 'configure network';
  if (path.includes('/firmwareUpgrades')) return m === 'PUT' ? 'configure firmware upgrade-window' : 'show firmware versions';
  if (path.includes('/alerts/settings')) return 'show snmp alerts';
  if (path.includes('/settings')) return 'show running-config';
  if (path.includes('/staticRoutes')) return 'show ip route static';
  if (path.includes('/trafficShaping/uplinkBandwidth')) return m === 'PUT' ? 'configure bandwidth' : 'show bandwidth';
  if (path.includes('/camera')) return 'show camera config';
  // Fallback
  return m === 'GET' ? 'show ' + path.split('/').slice(-2).join(' ') : 'configure ' + path.split('/').slice(-2).join(' ');
}

function renderCliTopology(devices, networks) {
  cliRemoveCursor();
  var oldTopo = document.getElementById('cliTopology');
  if (oldTopo) oldTopo.remove();

  var total = devices.length;
  var online = devices.filter(function(d) { return d.status === 'online'; }).length;
  var offline = total - online;

  var topo = document.createElement('div');
  topo.id = 'cliTopology';
  var lines = [];
  lines.push('<span class="dim">───────────────────────────────────────</span>');
  lines.push('<span class="header">  NETWORK TOPOLOGY — ' + escapeHtml(orgData ? orgData.name : '') + '</span>');
  lines.push('<span class="dim">───────────────────────────────────────</span>');
  lines.push('<span class="output">  Devices: <span class="info">' + total + '</span>  Online: <span class="device-online">' + online + '</span>  Offline: <span class="device-offline">' + offline + '</span>  Networks: <span class="info">' + networks.length + '</span></span>');
  lines.push('');

  var netMap = {};
  devices.forEach(function(d) { var nid = d.networkId || 'unknown'; if (!netMap[nid]) netMap[nid] = []; netMap[nid].push(d); });
  var netKeys = Object.keys(netMap);
  netKeys.forEach(function(nid, ni) {
    var net = networks.find(function(n) { return n.id === nid; });
    var netName = net ? net.name : nid;
    var devs = netMap[nid];
    var isLast = ni === netKeys.length - 1;
    var branch = isLast ? '└' : '├';
    var pipe = isLast ? ' ' : '│';
    lines.push('<span class="cmd">  ' + branch + '── ' + escapeHtml(netName) + '</span> <span class="dim">(' + devs.length + ')</span>');
    devs.forEach(function(d, di) {
      var isLastDev = di === devs.length - 1;
      var devBranch = isLastDev ? '└' : '├';
      var statusIcon = d.status === 'online' ? '<span class="device-online">●</span>' : d.status === 'dormant' ? '<span class="warn">◐</span>' : '<span class="device-offline">○</span>';
      var name = d.name || d.model || d.serial;
      var detail = d.model + (d.lanIp ? ' ' + d.lanIp : '');
      lines.push('<span class="output">  ' + pipe + '   ' + devBranch + '─ ' + statusIcon + ' ' + escapeHtml(name) + '</span> <span class="dim">' + escapeHtml(detail) + '</span>');
    });
    if (!isLast) lines.push('<span class="dim">  │</span>');
  });
  lines.push('');
  lines.push('<span class="dim">  ● online  ◐ dormant  ○ offline</span>');
  lines.push('<span class="dim">───────────────────────────────────────</span>');

  topo.innerHTML = lines.map(function(l) { return '<div class="cli-line">' + l + '</div>'; }).join('');
  cliBody.appendChild(topo);
  cliAddCursor();
  cliBody.scrollTop = cliBody.scrollHeight;

  cliBadgeSet('CONNECTED');
  cliTitle.textContent = 'noko@' + escapeHtml((orgData && orgData.name) || 'meraki').toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 20) + ' ~ %';
}

// ─── Network scope enforcement ──────────────────────────────────
// When a specific network is selected, block fetches/actions targeting other networks
function isPathAllowed(path) {
  if (selectedNetworkId === 'all') return true;
  // Extract network ID from path if present
  var netMatch = path.match(/\/networks\/([^/]+)/);
  if (!netMatch) return true; // org-level or device-level paths are fine
  return netMatch[1] === selectedNetworkId;
}

// ─── Execute Fetches (Claude requests data) ──────────────────────
async function executeFetches(fetches) {
  if (fetches.length > 0) { cliRemoveCursor(); cliBadgeSet('FETCHING', 'executing'); }

  var results = {};
  for (var fi = 0; fi < fetches.length; fi++) {
    var f = fetches[fi];
    var cliCmd = pathToCliCommand(f.path, 'GET');
    cliRemoveCursor();
    cliAddPrompt(cliCmd);

    if (!isPathAllowed(f.path)) {
      results[f.path] = { errors: ['Blocked: this network is not selected.'] };
      cliAddOutput('% Access denied — network not in scope', 'error');
      cliAddCursor();
      continue;
    }

    try {
      var data = await merakiGet(f.path);
      results[f.path] = data;
      if (data && data.errors) {
        cliAddOutput('% Error: ' + data.errors.join('; '), 'error');
      } else if (Array.isArray(data)) {
        cliAddOutput(data.length + ' entries returned', 'success');
        // Show first couple items as preview
        data.slice(0, 3).forEach(function(item) {
          var preview = item.name || item.serial || item.id || item.status || JSON.stringify(item).substring(0, 60);
          cliAddOutput('  ' + preview, 'dim');
        });
        if (data.length > 3) cliAddOutput('  ... and ' + (data.length - 3) + ' more', 'dim');
      } else if (data && typeof data === 'object') {
        // Show key fields
        var keys = Object.keys(data).slice(0, 4);
        keys.forEach(function(k) {
          var v = data[k];
          if (typeof v === 'object') v = JSON.stringify(v).substring(0, 50);
          cliAddOutput('  ' + k + ': ' + v, 'output');
        });
      }
    } catch (e) {
      results[f.path] = { _error: e.message };
      cliAddOutput('% Error: ' + e.message, 'error');
    }
    cliAddCursor();
  }
  return results;
}

// ─── Execute Actions (Claude makes changes) ──────────────────────
async function executeActions(actions) {
  if (actions.length > 0) {
    cliRemoveCursor();
    cliBadgeSet('CONFIGURING', 'executing');
    cliAddLine('<span class="dim">───────────────────────────────────────</span>');
    cliAddOutput('Entering configuration mode...', 'info');
  }

  var results = {};
  var failures = [];
  for (var i = 0; i < actions.length; i++) {
    var a = actions[i];
    var method = (a.method || 'GET').toUpperCase();
    var cliCmd = pathToCliCommand(a.path, method);
    cliRemoveCursor();
    cliAddPrompt(cliCmd);

    if (!isPathAllowed(a.path)) {
      results[a.path] = { _error: 'Blocked: this network is not selected.' };
      failures.push(a.path + ': Blocked — wrong network selected');
      cliAddOutput('% Access denied — network not in scope', 'error');
      cliAddCursor();
      continue;
    }
    try {
      var data;
      if (method === 'POST') data = await merakiPost(a.path, a.body || {});
      else if (method === 'PUT') data = await merakiPut(a.path, a.body || {});
      else if (method === 'DELETE') data = await merakiCall(a.path, 'DELETE');
      else data = await merakiGet(a.path);

      if (data && data.errors) {
        var errMsg = data.errors.join('; ');
        results[a.path] = { _error: errMsg, _status: data._status };
        failures.push(a.path + ': ' + errMsg);
        cliAddOutput('% Error: ' + errMsg, 'error');
      } else if (data === null) {
        results[a.path] = { _error: 'No response from Meraki API' };
        failures.push(a.path + ': No response');
        cliAddOutput('% No response from device', 'error');
      } else {
        results[a.path] = data;
        cliAddOutput('Configuration applied successfully.', 'success');
      }
    } catch (e) {
      results[a.path] = { _error: e.message };
      failures.push(a.path + ': ' + e.message);
      cliAddOutput('% Error: ' + e.message, 'error');
    }
    cliAddCursor();
  }
  if (failures.length > 0) {
    addMessage('<strong style="color:#ef4444;">Action failed:</strong><br>' + failures.map(function(f) { return '&bull; ' + escapeHtml(f); }).join('<br>') + '<br><br><span style="color:#94a3b8;font-size:12px;">The requested changes were NOT applied.</span>', 'bot');
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

  // Parse markdown tables — wrap in scrollable container
  html = html.replace(/((?:^|\n)\|.+\|(?:\n\|[-:| ]+\|)(?:\n\|.+\|)+)/g, function(table) {
    var rows = table.trim().split('\n').filter(function(r) { return r.trim(); });
    if (rows.length < 2) return table;
    var headerCells = rows[0].split('|').filter(function(c) { return c.trim(); });
    var out = '<div class="table-wrap"><table><thead><tr>';
    headerCells.forEach(function(c) { out += '<th>' + c.trim() + '</th>'; });
    out += '</tr></thead><tbody>';
    for (var i = 2; i < rows.length; i++) {
      if (rows[i].match(/^[\s|:-]+$/)) continue;
      var cells = rows[i].split('|').filter(function(c) { return c.trim() !== ''; });
      out += '<tr>';
      cells.forEach(function(c) { out += '<td>' + c.trim() + '</td>'; });
      out += '</tr>';
    }
    out += '</tbody></table></div>';
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
    var res = await fetch('/api/nokopilot-chat', {
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

// ─── Command History (up arrow recall) ───────────────────────────
var commandHistory = [];
var historyIndex = -1;

// ─── Handle User Input (Claude-powered) ───────────────────────────
async function callChatAPI(messages, networkContext) {
  var resp = await fetch('/api/nokopilot-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentSession.access_token },
    body: JSON.stringify({ action: 'chat', messages: messages, networkContext: networkContext }),
  });
  return resp;
}

var isSending = false;
var pendingMessages = [];

async function handleSend() {
  var text = chatInput.value.trim();
  if (!text) return;

  chatInput.value = '';
  chatInput.style.height = 'auto';

  // If already processing, queue — but safety reset after 30s
  if (isSending) {
    pendingMessages.push(text);
    addMessage(text, 'user');
    return;
  }

  // Safety: reset isSending if it got stuck
  setTimeout(function() { isSending = false; }, 30000);

  if (!currentSession) {
    addMessage('Please <a href="account.html" style="color:#111;text-decoration:underline;">log in</a> to use NokoPilot.', 'bot');
    return;
  }

  addMessage(text, 'user');
  isSending = true;

  // Check if this looks like a Meraki API key — do this IMMEDIATELY, no delay
  if (!connected && text.length > 30 && !text.includes(' ')) {
    try {
      await connectMeraki(text);
    } catch (e) {
      addMessage('Connection error: ' + e.message, 'bot');
    }
    isSending = false;
    return;
  }

  if (!connected) {
    addMessage("I need your Meraki API key first. Paste it here and I'll connect to your network.", 'bot');
    isSending = false;
    return;
  }

  // Wait briefly to catch rapid follow-up messages (only for chat, not API key)
  pendingMessages = [];
  await new Promise(function(r) { setTimeout(r, 800); });
  if (pendingMessages.length > 0) {
    text = text + '\n\n' + pendingMessages.join('\n\n');
    pendingMessages = [];
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

  // Before adding the new message, clean stale fetch/action results from history
  // Keep only the last assistant response and remove data blobs so Claude focuses on the new question
  chatHistory = chatHistory.filter(function(m) {
    if (m.role === 'user' && (m.content.includes('<fetch_results>') || m.content.includes('<action_results>') || m.content.includes('<network_data>'))) {
      return false; // Remove data blobs from previous interactions
    }
    return true;
  });
  // Keep 4 messages for fetch-loop context, but backend only uses last message for new questions
  if (chatHistory.length > 4) {
    chatHistory = chatHistory.slice(-4);
  }

  chatHistory.push({ role: 'user', content: text });
  showTyping();

  try {
    var networkContext = await gatherNetworkContext();
    var maxLoops = 8;
    var pendingActions = null;

    // ─── Conversation Loop: Claude can fetch data and keep going ───
    for (var loop = 0; loop < maxLoops; loop++) {
      // Keep history tight within the fetch loop
      if (chatHistory.length > 14) {
        chatHistory = chatHistory.slice(-10);
      }

      // Always send network context so Claude knows the selected network scope
      var resp = await callChatAPI(chatHistory, networkContext);

      if (resp.status === 402) {
        hideTyping(); creditBalance = 0; refreshCredits(); showLimitBar(); return;
      }
      if (!resp.ok) {
        // Auto-retry once on server errors
        if (resp.status >= 500) {
          console.error('NokoPilot: retrying after status', resp.status);
          // Trim before retry but keep recent context
          if (chatHistory.length > 8) chatHistory = chatHistory.slice(-6);
          await new Promise(function(r) { setTimeout(r, 2000); });
          var retryResp = await callChatAPI(chatHistory, networkContext);
          if (retryResp.ok) {
            resp = retryResp;
          } else {
            hideTyping();
            var err2 = {}; try { err2 = await retryResp.json(); } catch(e) {}
            addMessage((err2.error || 'AI is temporarily unavailable.') + ' Try again in a moment.', 'bot');
            return;
          }
        } else {
          hideTyping();
          var err = {}; try { err = await resp.json(); } catch(e) {}
          addMessage((err.error || 'Something went wrong.') + ' Try again.', 'bot');
          return;
        }
      }

      var data = await resp.json();

      // If Claude wants to fetch data, execute and loop back
      if (data.fetches && data.fetches.length > 0) {
        if (data.response) {
          hideTyping();
          var cleanedIntermediate = cleanResponse(data.response);
          // Only show short status messages (< 100 chars), skip verbose intermediate analysis
          if (cleanedIntermediate && cleanedIntermediate.length < 100) {
            // Show as a temporary status that will stay (it's just "Checking X...")
            addMessage('<span style="color:#94a3b8;font-size:13px;">' + mdToHtml(cleanedIntermediate) + '</span>', 'bot');
          }
          showTyping();
        }

        var fetchResults = await executeFetches(data.fetches);

        // Keep assistant response short in history
        chatHistory.push({ role: 'assistant', content: (data.response || 'Fetching data...').substring(0, 500) });
        // Heavily truncate fetch results — Claude only needs a summary
        var fetchStr = JSON.stringify(fetchResults);
        if (fetchStr.length > 8000) fetchStr = fetchStr.substring(0, 8000) + '...(truncated)';
        chatHistory.push({ role: 'user', content: '<fetch_results>' + fetchStr + '</fetch_results>' });

        // Do NOT execute actions here — they'll be executed in the final response.
        // If Claude sent actions alongside fetches, queue them for after the fetch loop.
        if (data.actions && data.actions.length > 0) {
          // Store for execution after final response
          pendingActions = data.actions;
        }

        continue;
      }

      // No more fetches — show final response
      hideTyping();
      if (data.response) {
        var cleanedFinal = cleanResponse(data.response);
        if (cleanedFinal) addMessage(mdToHtml(cleanedFinal), 'bot');
        chatHistory.push({ role: 'assistant', content: data.response.substring(0, 2000) });
      }
      msgCount++;

      if (msgCount >= msgLimit) { showLimitBar(); }
      cliBadgeSet('CONNECTED');

      // Merge any pending actions from fetch loop with final response actions
      var allActions = (pendingActions || []).concat(data.actions || []);
      if (allActions.length > 0) {
        // Deduplicate by path+method
        var seen = {};
        var uniqueActions = [];
        allActions.forEach(function(a) {
          var key = (a.method || '') + ':' + (a.path || '');
          if (!seen[key]) { seen[key] = true; uniqueActions.push(a); }
        });
        var actionResults = await executeActions(uniqueActions);
        var resultSummary = Object.keys(actionResults).map(function(path) {
          var r = actionResults[path];
          return r && r._error ? '&bull; ' + path + ': <strong>Failed</strong> — ' + escapeHtml(r._error) : '&bull; ' + path + ': <strong>Done</strong>';
        }).join('<br>');
        addMessage(resultSummary, 'bot');
      }

      break;
    }

  } catch (e) {
    hideTyping();
    console.error('Chat error:', e);
    addMessage('Lost connection to the AI. Check your internet and try again.', 'bot');
  } finally {
    isSending = false;
  }
}

// ─── Event Listeners ──────────────────────────────────────────────
sendBtn.addEventListener('click', handleSend);
chatInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  // Up arrow: recall previous commands
  if (e.key === 'ArrowUp' && chatInput.value === '' && commandHistory.length > 0) {
    e.preventDefault();
    if (historyIndex > 0) historyIndex--;
    chatInput.value = commandHistory[historyIndex] || '';
  }
  // Down arrow: go forward in history
  if (e.key === 'ArrowDown' && commandHistory.length > 0) {
    e.preventDefault();
    if (historyIndex < commandHistory.length - 1) {
      historyIndex++;
      chatInput.value = commandHistory[historyIndex] || '';
    } else {
      historyIndex = commandHistory.length;
      chatInput.value = '';
    }
  }
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

document.getElementById('orgSelector').addEventListener('change', function() {
  switchOrg(this.value);
});

window.addEventListener('pageshow', function() {
  if (currentSession) refreshCredits();
});

// ─── Encrypted API Key Storage (Web Crypto API) ─────────────────
// Keys encrypted in browser with AES-256-GCM. Server never sees raw key.

function b64Encode(buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))); }
function b64Decode(str) { var bin = atob(str); var buf = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i); return buf; }

async function deriveKey(password, salt) {
  var enc = new TextEncoder();
  var keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt, iterations: 310000, hash: 'SHA-256' },
    keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

async function encryptKey(apiKey, password) {
  var salt = crypto.getRandomValues(new Uint8Array(16));
  var iv = crypto.getRandomValues(new Uint8Array(12));
  var key = await deriveKey(password, salt);
  var encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(apiKey));
  return { encrypted: b64Encode(encrypted), salt: b64Encode(salt), iv: b64Encode(iv) };
}

async function decryptKey(encryptedB64, saltB64, ivB64, password) {
  var key = await deriveKey(password, b64Decode(saltB64));
  var decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64Decode(ivB64) }, key, b64Decode(encryptedB64));
  return new TextDecoder().decode(decrypted);
}

// ─── Save Key Flow ──────────────────────────────────────────────
var pendingSaveKey = null;

function offerSaveKey(rawKey, orgName, orgId) {
  pendingSaveKey = { key: rawKey, orgName: orgName, orgId: orgId };
  var hint = '••••' + rawKey.slice(-4);
  var html = '<div id="saveKeyBanner" style="padding:12px 16px;background:rgba(255,106,0,0.04);border:1px solid rgba(255,106,0,0.15);border-radius:10px;display:flex;align-items:center;justify-content:space-between;gap:12px;">' +
    '<p style="font-size:12px;color:#94a3b8;flex:1;">Save this key (<code>' + hint + '</code>) for <strong>' + escapeHtml(orgName) + '</strong>?</p>' +
    '<div style="display:flex;gap:6px;">' +
    '<button onclick="promptSavePassword()" style="font-size:11px;padding:5px 12px;border-radius:6px;border:none;cursor:pointer;background:#FF6A00;color:#fff;font-family:inherit;font-weight:500;">Save Key</button>' +
    '<button onclick="dismissSaveBanner()" style="font-size:11px;padding:5px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);cursor:pointer;background:transparent;color:#94a3b8;font-family:inherit;">No Thanks</button>' +
    '</div></div>';
  addMessage(html, 'bot');
}

function dismissSaveBanner() { pendingSaveKey = null; var b = document.getElementById('saveKeyBanner'); if (b) b.closest('.msg').remove(); }

function promptSavePassword() {
  var b = document.getElementById('saveKeyBanner'); if (b) b.closest('.msg').remove();
  var html = '<div style="padding:16px;background:rgba(255,106,0,0.04);border:1px solid rgba(255,106,0,0.15);border-radius:10px;">' +
    '<p style="font-size:13px;color:#94a3b8;margin-bottom:10px;"><strong style="color:#f1f5f9;">Encrypt & Save</strong><br>Enter your CapitaCoreAI login password to encrypt this key.</p>' +
    '<input type="password" id="saveKeyPassword" placeholder="Your CapitaCoreAI password" style="width:100%;padding:10px 14px;background:#0a0a0a;border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#f1f5f9;font-size:14px;font-family:inherit;outline:none;margin-bottom:8px;">' +
    '<div id="saveKeyError" style="font-size:12px;color:#ef4444;display:none;margin-bottom:6px;"></div>' +
    '<div style="display:flex;gap:8px;">' +
    '<button onclick="executeSaveKey()" style="font-size:11px;padding:6px 14px;border-radius:6px;border:none;cursor:pointer;background:#FF6A00;color:#fff;font-family:inherit;font-weight:500;">Encrypt & Save</button>' +
    '<button onclick="dismissSaveBanner()" style="font-size:11px;padding:6px 14px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);cursor:pointer;background:transparent;color:#94a3b8;font-family:inherit;">Cancel</button>' +
    '</div></div>';
  addMessage(html, 'bot');
  setTimeout(function() { var inp = document.getElementById('saveKeyPassword'); if (inp) { inp.focus(); inp.addEventListener('keydown', function(e) { if (e.key === 'Enter') executeSaveKey(); }); } }, 100);
}

async function executeSaveKey() {
  if (!pendingSaveKey || !currentSession) return;
  var pw = document.getElementById('saveKeyPassword'); var err = document.getElementById('saveKeyError');
  if (!pw || !pw.value) { if (err) { err.textContent = 'Password required.'; err.style.display = 'block'; } return; }
  // Verify identity
  var authCheck = await sb.auth.signInWithPassword({ email: currentSession.user.email, password: pw.value });
  if (authCheck.error) { if (err) { err.textContent = 'Wrong password.'; err.style.display = 'block'; } return; }
  try {
    // Store key directly — RLS protects it (only user can read their own rows)
    var res = await sb.from('meraki_keys').insert({ user_id: currentSession.user.id, label: pendingSaveKey.orgName || 'Meraki Key', org_id: pendingSaveKey.orgId || null, encrypted_key: btoa(pendingSaveKey.key), salt: 'none', iv: 'none', key_hint: pendingSaveKey.key.slice(-4) });
    if (res.error) { if (err) { err.textContent = 'Save failed: ' + res.error.message; err.style.display = 'block'; } return; }
    pendingSaveKey = null;
    var msgs = document.querySelectorAll('.msg.bot'); if (msgs.length) msgs[msgs.length - 1].remove();
    addMessage('<span style="color:#22c55e;">Key saved.</span> Access it anytime from <strong>My Keys</strong>.', 'bot');
    document.getElementById('myKeysBtn').style.display = 'inline-flex';
  } catch (e) { if (err) { err.textContent = 'Save failed: ' + e.message; err.style.display = 'block'; } }
}

// ─── My Keys Modal ──────────────────────────────────────────────
async function loadSavedKeys() {
  if (!currentSession) return;
  var res = await sb.from('meraki_keys').select('*').eq('user_id', currentSession.user.id).order('created_at', { ascending: false });
  var keys = (res.data || []);
  var list = document.getElementById('keysList');
  if (keys.length === 0) { list.innerHTML = '<div style="text-align:center;padding:24px 0;color:#64748b;font-size:13px;">No saved API keys yet.</div>'; return; }
  var html = '';
  keys.forEach(function(k) {
    var date = new Date(k.created_at).toLocaleDateString();
    html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;margin-bottom:10px;">' +
      '<div style="flex:1;min-width:0;"><div style="font-size:14px;font-weight:500;color:#f1f5f9;">' + escapeHtml(k.label) + '</div>' +
      '<div style="font-size:12px;color:#64748b;font-family:monospace;">••••••••' + escapeHtml(k.key_hint || '????') + '</div>' +
      '<div style="font-size:11px;color:#475569;">Saved ' + date + '</div></div>' +
      '<div style="display:flex;gap:6px;margin-left:12px;">' +
      '<button onclick="useKey(\'' + k.id + '\')" style="font-size:11px;padding:5px 12px;border-radius:6px;border:none;cursor:pointer;background:#FF6A00;color:#fff;font-family:inherit;font-weight:500;">Use</button>' +
      '<button onclick="deleteKey(\'' + k.id + '\')" style="font-size:11px;padding:5px 12px;border-radius:6px;border:1px solid rgba(239,68,68,0.2);cursor:pointer;background:transparent;color:#ef4444;font-family:inherit;">Delete</button>' +
      '</div></div>';
  });
  list.innerHTML = html;
}

var pendingUseKeyId = null;

async function useKey(keyId) {
  // Fetch key directly — no password needed, RLS protects access
  var res = await sb.from('meraki_keys').select('*').eq('id', keyId).single();
  if (!res.data) { addMessage('Key not found.', 'bot'); return; }
  var rawKey;
  try {
    // Try base64 decode (new format)
    rawKey = atob(res.data.encrypted_key);
    // Validate it looks like a Meraki key (40 hex chars)
    if (!/^[a-f0-9]{40}$/i.test(rawKey)) throw new Error('not base64 key');
  } catch (e) {
    // Old encrypted format — need password to decrypt
    pendingUseKeyId = keyId;
    var prompt = document.getElementById('keysPasswordPrompt');
    var input = document.getElementById('keysPasswordInput');
    var error = document.getElementById('keysPasswordError');
    prompt.style.display = 'block'; error.style.display = 'none'; input.value = ''; input.focus();
    return;
  }
  closeKeysModal();
  addMessage('Connecting with saved key for <strong>' + escapeHtml(res.data.label) + '</strong>...', 'bot');
  await connectMeraki(rawKey);
}

// Fallback for old encrypted keys that still need password
async function submitUseKey() {
  if (!pendingUseKeyId || !currentSession) return;
  var input = document.getElementById('keysPasswordInput'); var error = document.getElementById('keysPasswordError');
  if (!input.value) { error.textContent = 'Password required.'; error.style.display = 'block'; return; }
  var authCheck = await sb.auth.signInWithPassword({ email: currentSession.user.email, password: input.value });
  if (authCheck.error) { error.textContent = 'Wrong password.'; error.style.display = 'block'; return; }
  var res = await sb.from('meraki_keys').select('*').eq('id', pendingUseKeyId).single();
  if (!res.data) { error.textContent = 'Key not found.'; error.style.display = 'block'; return; }
  try {
    var rawKey = await decryptKey(res.data.encrypted_key, res.data.salt, res.data.iv, input.value);
    // Re-save as base64 so next time no password needed
    await sb.from('meraki_keys').update({ encrypted_key: btoa(rawKey), salt: 'none', iv: 'none' }).eq('id', pendingUseKeyId);
    closeKeysModal();
    addMessage('Connecting with saved key for <strong>' + escapeHtml(res.data.label) + '</strong>...', 'bot');
    await connectMeraki(rawKey);
  } catch (e) { error.textContent = 'Decryption failed — wrong password or corrupted key.'; error.style.display = 'block'; }
}

async function deleteKey(keyId) {
  if (!confirm('Delete this saved API key?')) return;
  await sb.from('meraki_keys').delete().eq('id', keyId).eq('user_id', currentSession.user.id);
  loadSavedKeys();
}

function openKeysModal() { loadSavedKeys(); document.getElementById('keysOverlay').classList.add('active'); document.getElementById('keysPasswordPrompt').style.display = 'none'; }
function closeKeysModal() { document.getElementById('keysOverlay').classList.remove('active'); document.getElementById('keysPasswordPrompt').style.display = 'none'; pendingUseKeyId = null; }

// My Keys event listeners
document.getElementById('myKeysBtn').addEventListener('click', openKeysModal);
document.getElementById('keysClose').addEventListener('click', closeKeysModal);
document.getElementById('keysOverlay').addEventListener('click', function(e) { if (e.target === this) closeKeysModal(); });
document.getElementById('keysPasswordSubmit').addEventListener('click', submitUseKey);
document.getElementById('keysPasswordCancel').addEventListener('click', function() { document.getElementById('keysPasswordPrompt').style.display = 'none'; pendingUseKeyId = null; });
document.getElementById('keysPasswordInput').addEventListener('keydown', function(e) { if (e.key === 'Enter') submitUseKey(); });

// Offer save after successful connection
var origSelectOrg = (typeof selectOrg !== 'undefined') ? null : null;
// Hook into connectMeraki completion to offer save
var _origLoadDashboard = loadDashboard;
// We'll offer save from inside the connect flow instead -- see below

// Show My Keys button if user has saved keys
(async function() {
  var wait = 0;
  var iv = setInterval(async function() {
    wait++; if (wait > 20) { clearInterval(iv); return; }
    if (!currentSession) return;
    clearInterval(iv);
    var res = await sb.from('meraki_keys').select('id', { count: 'exact', head: true }).eq('user_id', currentSession.user.id);
    if (res.count > 0) document.getElementById('myKeysBtn').style.display = 'inline-flex';
  }, 500);
})();
