var MSGS_PER_CREDIT = 5;
var currentUser = null;
var creditBalance = 0;
var isAdmin = false;
var chatHistory = [];
var msgCount = 0;
var msgLimit = 0;
var conversationStarted = false;
var currentSession = null;
var currentSubscription = null;

var chatMessages = document.getElementById('chatMessages');
var chatInput = document.getElementById('chatInput');
var sendBtn = document.getElementById('sendBtn');

function escapeHtml(t) { var d = document.createElement('div'); d.textContent = t || ''; return d.innerHTML; }

// ─── Auth ────────────────────────────────────────────────────
(async function() {
  var result = await sb.auth.getSession();
  currentSession = result.data.session;
  if (!currentSession) {
    setTimeout(async function() {
      var r2 = await sb.auth.getSession();
      if (!r2.data.session) window.location.href = 'account.html';
      else { currentUser = r2.data.session.user; refreshCredits(); loadSubscription(); }
    }, 1000);
  } else {
    currentUser = currentSession.user;
    refreshCredits();
    loadSubscription();
  }
  addMessage("Welcome to **NewsPilot** — your AI-powered news curator.\n\nTell me what you're interested in. What topics, companies, industries, or people do you want to track? I'll build you a personalized news digest.", 'bot');
})();

sb.auth.onAuthStateChange(function(event, session) {
  currentSession = session;
  if (event === 'SIGNED_OUT') window.location.href = 'account.html';
});

async function refreshCredits() {
  if (!currentUser) return;
  var result = await sb.from('profiles').select('token_balance, is_admin').eq('id', currentUser.id).single();
  var data = result.data;
  isAdmin = data && data.is_admin === true;
  creditBalance = isAdmin ? 9999 : ((data && data.token_balance) || 0);
  var el = document.getElementById('creditDisplay');
  if (el) { el.style.display = 'flex'; document.getElementById('creditCount').textContent = isAdmin ? '\u221E' : creditBalance; }
}

// ─── Subscription ────────────────────────────────────────────
async function loadSubscription() {
  if (!currentSession) return;
  var res = await fetch('/api/newspilot-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentSession.access_token },
    body: JSON.stringify({ action: 'get_subs' }),
  });
  if (!res.ok) return;
  var data = await res.json();
  var subs = data.subscriptions || [];
  var active = subs.find(function(s) { return s.active; });
  if (active) {
    currentSubscription = active;
    document.getElementById('subBar').classList.add('active');
    document.getElementById('subTopics').textContent = (active.topics || []).join(', ') || active.prompt_text.substring(0, 50);
    document.getElementById('manageSubsBtn').style.display = 'inline-flex';
    document.getElementById('subscribeBtn').style.display = 'none';
  }
}

async function handleSubscribe(data) {
  if (!currentSession) return;
  var res = await fetch('/api/newspilot-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentSession.access_token },
    body: JSON.stringify({ action: 'subscribe', prompt: data.prompt, topics: data.topics }),
  });
  if (res.ok) {
    var result = await res.json();
    currentSubscription = result.subscription;
    document.getElementById('subBar').classList.add('active');
    document.getElementById('subTopics').textContent = (data.topics || []).join(', ');
    addMessage('Subscribed! You\'ll receive a weekly digest. You can edit or cancel anytime from the bar below.', 'bot');
    refreshCredits();
  } else {
    var err = await res.json().catch(function() { return {}; });
    addMessage('Failed to subscribe: ' + (err.error || 'Try again.'), 'bot');
  }
}

async function handleCancelSub() {
  if (!currentSubscription || !currentSession) return;
  if (!confirm('Cancel your weekly news subscription?')) return;
  await fetch('/api/newspilot-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentSession.access_token },
    body: JSON.stringify({ action: 'cancel_sub', subId: currentSubscription.id }),
  });
  currentSubscription = null;
  document.getElementById('subBar').classList.remove('active');
  addMessage('Subscription cancelled. You can re-subscribe anytime by asking me.', 'bot');
}

// ─── Chat UI ─────────────────────────────────────────────────
function mdToHtml(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^---$/gm, '<hr>')
    .replace(/^- (.+)$/gm, '&bull; $1<br>')
    .replace(/^#{1,2} (.+)$/gm, '<h3 style="color:#FF6A00;margin:12px 0 6px;">$1</h3>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\n/g, '<br>');
}

function addMessage(text, sender) {
  var div = document.createElement('div');
  div.className = 'msg ' + (sender || 'bot');
  var html = sender === 'user' ? escapeHtml(text) : mdToHtml(text);
  div.innerHTML = '<div class="msg-bubble">' + html + '</div>';
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTyping() {
  var div = document.createElement('div');
  div.className = 'msg bot'; div.id = 'typingMsg';
  div.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
function hideTyping() { var el = document.getElementById('typingMsg'); if (el) el.remove(); }

function showLimitBar() {
  document.getElementById('chatInputArea').style.display = 'none';
  document.getElementById('limitBar').style.display = 'block';
}
function enableInput() {
  document.getElementById('chatInputArea').style.display = 'block';
  document.getElementById('limitBar').style.display = 'none';
}

// ─── Digest Rendering ────────────────────────────────────────
function renderDigest(text) {
  document.getElementById('digestEmpty').style.display = 'none';
  var content = document.getElementById('digestContent');
  content.style.display = 'block';
  document.getElementById('digestDate').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  // Convert markdown to HTML for the digest panel
  var html = escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^---$/gm, '<hr>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gm, '<ul>$1</ul>')
    .replace(/<\/ul>\s*<ul>/g, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');

  document.getElementById('digestBody').innerHTML = '<p>' + html + '</p>';
  document.getElementById('digestPanel').scrollTop = 0;

  // Show subscribe button after digest is generated
  if (!currentSubscription) {
    document.getElementById('subscribeBtn').style.display = 'inline-flex';
  }
}

// Track what the last digest was about for subscription
var lastDigestPrompt = '';
var lastDigestTopics = [];

// ─── Conversation — no credit gate, subscription model ───────
function startConversation() {
  conversationStarted = true;
  msgCount = 0;
  msgLimit = 999; // unlimited for subscribers
  return true;
}

async function handleSend() {
  var text = chatInput.value.trim();
  if (!text) return;
  if (!currentSession) { addMessage('Please log in.', 'bot'); return; }

  chatInput.value = '';
  chatInput.style.height = 'auto';
  addMessage(text, 'user');

  if (!conversationStarted) {
    var ok = await startConversation();
    if (!ok) return;
  }
  if (msgCount >= msgLimit) { showLimitBar(); return; }

  chatHistory.push({ role: 'user', content: text });

  // Clean old search results from history
  chatHistory = chatHistory.filter(function(m) {
    return !(m.role === 'user' && m.content.includes('<search_results>'));
  });
  if (chatHistory.length > 10) chatHistory = chatHistory.slice(-8);

  showTyping();

  try {
    var resp = await fetch('/api/newspilot-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentSession.access_token },
      body: JSON.stringify({ action: 'chat', messages: chatHistory }),
    });

    if (resp.status === 402) { hideTyping(); showLimitBar(); return; }
    if (!resp.ok) { hideTyping(); addMessage('Something went wrong. Try again.', 'bot'); return; }

    var data = await resp.json();

    // If searches were executed and results came back, send them back to Claude for the digest
    if (data.searchResults && Object.keys(data.searchResults).length > 0) {
      // Show status
      hideTyping();
      if (data.response) addMessage(data.response, 'bot');
      addMessage('Fetching latest articles...', 'bot');
      showTyping();

      // Build search results context and send back to Claude
      chatHistory.push({ role: 'assistant', content: data.response || 'Searching for news...' });
      var resultsText = '<search_results>\n' + JSON.stringify(data.searchResults) + '\n</search_results>\nNow write the personalized news digest based on these articles. Format it as a premium newsletter.';
      chatHistory.push({ role: 'user', content: resultsText });

      var digestResp = await fetch('/api/newspilot-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentSession.access_token },
        body: JSON.stringify({ action: 'chat', messages: chatHistory }),
      });

      hideTyping();

      if (digestResp.ok) {
        var digestData = await digestResp.json();
        if (digestData.response) {
          chatHistory.push({ role: 'assistant', content: digestData.response });
          addMessage('Your digest is ready! Check the right panel. Want this every Friday? Click **Subscribe** in the top bar.', 'bot');
          renderDigest(digestData.response);

          // Track what this digest was about for subscription
          lastDigestTopics = (data.searches || []).map(function(s) { return s.topic || s.query; });
          lastDigestPrompt = lastDigestTopics.join(', ');

          if (digestData.subAction) handleSubAction(digestData.subAction);
        }
      } else {
        addMessage('Failed to generate digest. Try again.', 'bot');
      }
    } else {
      // Regular chat response (no searches)
      hideTyping();
      if (data.response) {
        chatHistory.push({ role: 'assistant', content: data.response });
        addMessage(data.response, 'bot');
      }
      if (data.subAction) handleSubAction(data.subAction);
    }

    msgCount++;
    if (msgCount >= msgLimit) showLimitBar();

  } catch (err) {
    hideTyping();
    addMessage('Connection error. Try again.', 'bot');
  }
}

function handleSubAction(action) {
  if (action.type === 'subscribe' && action.data) {
    handleSubscribe(action.data);
  } else if (action.type === 'edit_sub' && action.data && currentSubscription) {
    fetch('/api/newspilot-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentSession.access_token },
      body: JSON.stringify({ action: 'edit_sub', subId: currentSubscription.id, prompt: action.data.prompt, topics: action.data.topics }),
    }).then(function() {
      document.getElementById('subTopics').textContent = (action.data.topics || []).join(', ');
      addMessage('Subscription updated!', 'bot');
    });
  } else if (action.type === 'cancel_sub') {
    handleCancelSub();
  }
}

// ─── Event Listeners ─────────────────────────────────────────
sendBtn.addEventListener('click', handleSend);
chatInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
});
chatInput.addEventListener('input', function() {
  chatInput.style.height = 'auto';
  chatInput.style.height = chatInput.scrollHeight + 'px';
});
document.getElementById('continueBtn').addEventListener('click', continueConversation);
document.getElementById('logoutBtn').addEventListener('click', function() {
  sb.auth.signOut().catch(function() {});
  localStorage.clear(); sessionStorage.clear(); window.location.href = '/';
});
document.getElementById('editSubBtn').addEventListener('click', function() {
  openSubsModal();
});
document.getElementById('cancelSubBtn').addEventListener('click', handleCancelSub);

// Subscriptions modal
document.getElementById('manageSubsBtn').addEventListener('click', openSubsModal);
document.getElementById('subsClose').addEventListener('click', function() {
  document.getElementById('subsOverlay').classList.remove('active');
});
document.getElementById('subsOverlay').addEventListener('click', function(e) {
  if (e.target === this) this.classList.remove('active');
});

async function openSubsModal() {
  document.getElementById('subsOverlay').classList.add('active');
  var list = document.getElementById('subsList');
  list.innerHTML = '<p style="color:#64748b;text-align:center;">Loading...</p>';

  var res = await fetch('/api/newspilot-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentSession.access_token },
    body: JSON.stringify({ action: 'get_subs' }),
  });
  if (!res.ok) { list.innerHTML = '<p style="color:#ef4444;">Failed to load.</p>'; return; }
  var data = await res.json();
  var subs = data.subscriptions || [];

  if (subs.length === 0) {
    list.innerHTML = '<p style="color:#64748b;text-align:center;padding:24px 0;">No subscriptions yet. Generate a digest and click Subscribe to get started.</p>';
    return;
  }

  var html = '';
  subs.forEach(function(s) {
    var date = new Date(s.created_at).toLocaleDateString();
    var status = s.active ? '<span style="color:#22c55e;">Active</span>' : '<span style="color:#ef4444;">Cancelled</span>';
    var topicStr = (s.topics || []).join(', ') || s.prompt_text.substring(0, 80);
    html += '<div class="sub-item" data-sub-id="' + s.id + '">' +
      '<div class="sub-topics">' + escapeHtml(topicStr) + '</div>' +
      '<div class="sub-meta">Created ' + date + ' &middot; ' + status + ' &middot; Weekly (Friday 8AM EST)</div>' +
      '<div class="sub-prompt">' + escapeHtml(s.prompt_text.substring(0, 200)) + '</div>' +
      (s.active ? '<div class="sub-actions">' +
        '<button class="sub-btn edit" onclick="toggleEditSub(\'' + s.id + '\')">Edit Prompt</button>' +
        '<button class="sub-btn cancel" onclick="cancelSubFromModal(\'' + s.id + '\')">Cancel Subscription</button>' +
      '</div>' +
      '<div class="sub-edit-area" id="edit-' + s.id + '">' +
        '<textarea id="edittext-' + s.id + '">' + escapeHtml(s.prompt_text) + '</textarea>' +
        '<div class="edit-actions">' +
          '<button class="sub-btn edit" onclick="saveEditSub(\'' + s.id + '\')">Save</button>' +
          '<button class="sub-btn cancel" onclick="toggleEditSub(\'' + s.id + '\')">Cancel</button>' +
        '</div>' +
      '</div>' : '') +
      '</div>';
  });
  list.innerHTML = html;
}

function toggleEditSub(id) {
  var el = document.getElementById('edit-' + id);
  if (el) el.style.display = el.style.display === 'block' ? 'none' : 'block';
}

async function saveEditSub(id) {
  var textarea = document.getElementById('edittext-' + id);
  if (!textarea || !textarea.value.trim()) return;
  await fetch('/api/newspilot-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentSession.access_token },
    body: JSON.stringify({ action: 'edit_sub', subId: id, prompt: textarea.value.trim() }),
  });
  openSubsModal(); // Refresh
}

async function cancelSubFromModal(id) {
  if (!confirm('Cancel this subscription? You won\'t receive weekly digests anymore.')) return;
  await fetch('/api/newspilot-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentSession.access_token },
    body: JSON.stringify({ action: 'cancel_sub', subId: id }),
  });
  if (currentSubscription && currentSubscription.id === id) {
    currentSubscription = null;
    document.getElementById('subBar').classList.remove('active');
    document.getElementById('subscribeBtn').style.display = 'inline-flex';
  }
  openSubsModal(); // Refresh
}

// Subscribe button
document.getElementById('subscribeBtn').addEventListener('click', async function() {
  if (!currentSession || !lastDigestPrompt) {
    addMessage('Generate a digest first, then subscribe to get it weekly.', 'bot');
    return;
  }
  var btn = document.getElementById('subscribeBtn');
  btn.disabled = true;
  btn.textContent = 'Subscribing...';

  try {
    var res = await fetch('/api/newspilot-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentSession.access_token },
      body: JSON.stringify({ action: 'subscribe', prompt: lastDigestPrompt, topics: lastDigestTopics }),
    });
    var data = await res.json();
    if (res.ok && data.ok) {
      currentSubscription = data.subscription;
      document.getElementById('subBar').classList.add('active');
      document.getElementById('subTopics').textContent = lastDigestTopics.join(', ') || lastDigestPrompt.substring(0, 50);
      btn.style.display = 'none';
      document.getElementById('manageSubsBtn').style.display = 'inline-flex';
      addMessage('Subscribed! You\'ll receive a personalized digest every Friday. Check your email for confirmation.\n\n**Topics:** ' + (lastDigestTopics.join(', ') || lastDigestPrompt) + '\n\n**Delivery:** Every Friday at 8AM EST\n\nManage your subscription from **My Subscriptions** in the top bar.', 'bot');
      refreshCredits();
    } else {
      addMessage('Failed to subscribe: ' + (data.error || 'Try again.'), 'bot');
      btn.disabled = false;
      btn.textContent = 'Subscribe Weekly';
    }
  } catch (e) {
    addMessage('Error: ' + e.message, 'bot');
    btn.disabled = false;
    btn.textContent = 'Subscribe Weekly';
  }
});
