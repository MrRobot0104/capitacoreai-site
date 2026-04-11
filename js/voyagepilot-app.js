var GENS_PER_CREDIT = 5;
var currentUser = null;
var conversationHistory = [];
var genCount = 0;
var genLimit = GENS_PER_CREDIT;
var lastTripHtml = '';
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
    addBotMessage("You don't have any credits. Purchase some to start planning trips.");
    disableInput();
  }
}

async function logout() { await sb.auth.signOut(); localStorage.clear(); window.location.href = '/'; }

// TEXTAREA AUTO-RESIZE
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}
function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

// MESSAGES
function addUserMessage(text) {
  var msgs = document.getElementById('chatMessages');
  var div = document.createElement('div');
  div.className = 'msg user';
  div.innerHTML = '<div class="msg-bubble">' + escapeHtml(text) + '</div>';
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
    document.getElementById('limitMsg').textContent = "You've used all 5 trip generations for this credit. Add another credit to keep planning.";
    document.getElementById('continueBtn').style.display = 'inline-block';
  } else {
    document.getElementById('limitMsg').textContent = "No credits remaining. Purchase more to continue planning.";
    document.getElementById('continueBtn').style.display = 'none';
  }
}

function updateGenCounter() {
  var remaining = genLimit - genCount;
  var el = document.getElementById('genCounter');
  if (el) el.textContent = remaining + ' of ' + genLimit + ' generations left';
}

// TRIP CONTROL
async function startNewTrip() {
  if (creditBalance <= 0) { window.location.href = 'voyagepilot.html'; return; }
  var result = await sb.auth.getSession();
  var session = result.data.session;
  var res = await fetch('/api/voyagepilot-generate', {
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
  lastTripHtml = '';
  conversationStarted = true;
  document.getElementById('chatMessages').innerHTML = '';
  document.getElementById('previewEmpty').style.display = 'flex';
  document.getElementById('previewFrame').style.display = 'none';
  document.getElementById('expandBtn').style.display = 'none';
  document.getElementById('downloadBtn').style.display = 'none';
  enableInput();
  updateGenCounter();
  addBotMessage("New trip started! You have 5 generations. Tell me where you want to go — include your starting city, destinations, how long at each, dates, and budget preference.");
  await refreshCredits();
}

async function continueTrip() {
  var result = await sb.auth.getSession();
  var session = result.data.session;
  var res = await fetch('/api/voyagepilot-generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
    body: JSON.stringify({ action: 'start_conversation' })
  });
  if (!res.ok) {
    var err = await res.json().catch(function() { return {}; });
    addBotMessage(err.error || 'Failed to add generations.');
    return;
  }
  genLimit += GENS_PER_CREDIT;
  enableInput();
  updateGenCounter();
  addBotMessage("5 more generations added! Keep refining your trip.");
  await refreshCredits();
}

// SEND MESSAGE
async function sendMessage() {
  var textarea = document.getElementById('chatTextarea');
  var message = textarea.value.trim();
  if (!message) return;

  if (!conversationStarted) {
    if (creditBalance <= 0) { window.location.href = 'voyagepilot.html'; return; }
    var authResult = await sb.auth.getSession();
    var authSession = authResult.data.session;
    var res = await fetch('/api/voyagepilot-generate', {
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

  addUserMessage(message);
  textarea.value = '';
  textarea.style.height = 'auto';

  conversationHistory.push({ role: 'user', content: message });

  document.getElementById('sendBtn').disabled = true;
  addBotMessage('Planning your trip... this may take up to a minute.');
  addTyping();

  try {
    var sessionResult = await sb.auth.getSession();
    var session = sessionResult.data.session;
    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 300000);
    var res = await fetch('/api/voyagepilot-generate', {
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

    lastTripHtml = data.html;
    genCount++;
    updateGenCounter();
    var configStr = data.config ? JSON.stringify(data.config).substring(0, 3000) : '';
    conversationHistory.push({ role: 'assistant', content: 'Current trip config: ' + configStr });

    document.getElementById('previewEmpty').style.display = 'none';
    document.getElementById('previewFrame').style.display = 'block';
    document.getElementById('expandBtn').style.display = 'inline-flex';
    document.getElementById('downloadBtn').style.display = 'inline-flex';
    var blob = new Blob([lastTripHtml], { type: 'text/html' });
    var blobUrl = URL.createObjectURL(blob);
    document.getElementById('tripIframe').src = blobUrl;

    var remaining = genLimit - genCount;
    if (remaining > 0) {
      addBotMessage("Trip itinerary ready! You have " + remaining + " generation" + (remaining === 1 ? '' : 's') + " left. Tell me what to change — different dates, add a city, adjust the budget.");
    } else {
      addBotMessage("Trip itinerary ready! That was your last generation for this credit.");
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
  win.document.write(lastTripHtml);
  win.document.close();
}

function downloadTrip() {
  var blob = new Blob([lastTripHtml], { type: 'text/html' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'voyagepilot-itinerary.html';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Bind everything immediately
(function() {
  var newTripBtn = document.getElementById('newTripBtn');
  if (newTripBtn) newTripBtn.addEventListener('click', startNewTrip);

  var logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  var chatTextarea = document.getElementById('chatTextarea');
  if (chatTextarea) {
    chatTextarea.addEventListener('keydown', handleKey);
    chatTextarea.addEventListener('input', function() { autoResize(this); });
  }

  var sendBtn = document.getElementById('sendBtn');
  if (sendBtn) sendBtn.addEventListener('click', sendMessage);

  var continueBtn = document.getElementById('continueBtn');
  if (continueBtn) continueBtn.addEventListener('click', continueTrip);

  var newTripLimitBtn = document.getElementById('newTripLimitBtn');
  if (newTripLimitBtn) newTripLimitBtn.addEventListener('click', startNewTrip);

  var expandBtn = document.getElementById('expandBtn');
  if (expandBtn) expandBtn.addEventListener('click', expandPreview);

  var downloadBtn = document.getElementById('downloadBtn');
  if (downloadBtn) downloadBtn.addEventListener('click', downloadTrip);
})();
