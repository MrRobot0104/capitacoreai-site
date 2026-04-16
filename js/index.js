// ============ ANIMATED DNA BACKGROUND ============
var canvas = document.getElementById('dna-canvas');
var ctx = canvas.getContext('2d');
var time = 0;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

function drawDNA(cx, startY, length, nodeCount, amplitude, speed, phase, nodeSize, opacity) {
  var spacing = length / nodeCount;

  for (var i = 0; i < nodeCount; i++) {
    var t = (time * speed) + (i * 0.4) + phase;
    var y = startY + (i * spacing);
    var x1 = cx + Math.sin(t) * amplitude;
    var x2 = cx + Math.sin(t + Math.PI) * amplitude;

    // Rung connecting the two strands
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.strokeStyle = 'rgba(255, 106, 0, ' + (opacity * 0.4) + ')';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Strand lines connecting to next node
    if (i < nodeCount - 1) {
      var nextT = (time * speed) + ((i + 1) * 0.4) + phase;
      var nextY = startY + ((i + 1) * spacing);
      var nextX1 = cx + Math.sin(nextT) * amplitude;
      var nextX2 = cx + Math.sin(nextT + Math.PI) * amplitude;

      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(nextX1, nextY);
      ctx.strokeStyle = 'rgba(255, 106, 0, ' + (opacity * 0.6) + ')';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x2, y);
      ctx.lineTo(nextX2, nextY);
      ctx.strokeStyle = 'rgba(255, 106, 0, ' + (opacity * 0.6) + ')';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Node dots
    ctx.beginPath();
    ctx.arc(x1, y, nodeSize, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 106, 0, ' + (opacity * 0.85) + ')';
    ctx.fill();

    // Glow on primary nodes
    if (opacity > 0.2) {
      ctx.beginPath();
      ctx.arc(x1, y, nodeSize * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 106, 0, ' + (opacity * 0.15) + ')';
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(x2, y, nodeSize * 0.8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 106, 0, ' + (opacity * 0.7) + ')';
    ctx.fill();
  }
}

function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  time += 0.008;

  var scrollY = window.scrollY * 0.15;
  var w = canvas.width;
  var h = canvas.height;

  if (w <= 768) {
    // Mobile — just 2 subtle strands
    drawDNA(w - 60, -80 - scrollY, h + 300, 16, 40, 0.5, 0, 3, 0.4);
    drawDNA(40, 100 - scrollY * 0.6, h + 200, 12, 35, 0.4, 2, 2.5, 0.25);
  } else {
    // Desktop — full 6 strands
    drawDNA(w - 120, -100 - scrollY, h + 400, 22, 80, 0.6, 0, 4, 0.7);
    drawDNA(100, 50 - scrollY * 0.7, h + 300, 18, 60, 0.5, 2, 3.5, 0.5);
    drawDNA(w * 0.65, 200 - scrollY * 0.5, h, 14, 50, 0.4, 4, 3, 0.3);
    drawDNA(w * 0.25, -50 - scrollY * 0.4, h + 200, 16, 45, 0.35, 1.5, 2.5, 0.22);
    drawDNA(w * 0.45, 100 - scrollY * 0.6, h + 100, 12, 35, 0.45, 3, 2, 0.15);
    drawDNA(w - 30, -200 - scrollY * 0.3, h + 500, 20, 30, 0.55, 5, 2, 0.18);
  }

  requestAnimationFrame(animate);
}
animate();

// ============ MODALS ============
function openModal(id) {
  document.getElementById('modal-' + id).classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeModal(e, id) {
  document.getElementById('modal-' + id).classList.remove('active');
  document.body.style.overflow = '';
}

// ============ CHAT WIDGET ============
var chatOpen = false;
var chatHistory = [];
var MAX_CHATS = 10;

setTimeout(function() {
  var tip = document.getElementById('chatTooltip');
  if (tip) tip.style.display = 'none';
}, 5000);

function getChatCount() {
  return parseInt(localStorage.getItem('ccai_chat_count') || '0', 10);
}
function incrementChatCount() {
  localStorage.setItem('ccai_chat_count', (getChatCount() + 1).toString());
}

function toggleChat() {
  chatOpen = !chatOpen;
  document.getElementById('chatPanel').classList.toggle('active', chatOpen);
  document.getElementById('chatFab').classList.toggle('hidden', chatOpen);
  if (chatOpen) {
    document.getElementById('chatTooltip').style.display = 'none';
    document.getElementById('chatInput').focus();
  }
}

function addMessage(text, sender) {
  var msgs = document.getElementById('chatMessages');
  var div = document.createElement('div');
  div.className = 'chat-msg ' + sender;
  div.textContent = text;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function addLoading() {
  var msgs = document.getElementById('chatMessages');
  var div = document.createElement('div');
  div.className = 'chat-msg bot loading';
  div.id = 'chatLoading';
  div.innerHTML = '<div class="dot-typing"><span></span><span></span><span></span></div>';
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function removeLoading() {
  var el = document.getElementById('chatLoading');
  if (el) el.remove();
}

function disableChat(msg) {
  var input = document.getElementById('chatInput');
  var sendBtn = document.getElementById('chatSendBtn');
  input.disabled = true;
  input.placeholder = '';
  sendBtn.disabled = true;
  var msgs = document.getElementById('chatMessages');
  var div = document.createElement('div');
  div.className = 'chat-msg bot';
  div.style.maxWidth = '100%';
  var p = document.createElement('p');
  p.style.cssText = 'font-size:14px;margin-bottom:8px;';
  p.textContent = msg;
  var a = document.createElement('a');
  a.href = '#contact';
  a.style.cssText = 'display:inline-block;padding:10px 20px;background:#FF6A00;color:#fff;border-radius:10px;font-size:13px;font-weight:500;text-decoration:none;';
  a.textContent = 'Contact Us \u2192';
  a.addEventListener('click', toggleChat);
  div.appendChild(p);
  div.appendChild(a);
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

async function sendChat() {
  var input = document.getElementById('chatInput');
  var sendBtn = document.getElementById('chatSendBtn');
  var message = input.value.trim();
  if (!message) return;

  if (getChatCount() >= MAX_CHATS) {
    addMessage(message, 'user');
    input.value = '';
    disableChat("You've reached the chat limit. For more help, reach out to us directly!");
    return;
  }

  addMessage(message, 'user');
  chatHistory.push({ role: 'user', content: message });
  input.value = '';
  input.disabled = true;
  sendBtn.disabled = true;
  addLoading();

  try {
    var res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message, history: chatHistory.slice(-6) })
    });

    removeLoading();

    if (!res.ok) {
      var err = await res.json().catch(function() { return {}; });
      addMessage(err.error || 'Something went wrong. Please try again.', 'bot');
    } else {
      var data = await res.json();
      addMessage(data.reply, 'bot');
      chatHistory.push({ role: 'assistant', content: data.reply });
      incrementChatCount();
      var remaining = MAX_CHATS - getChatCount();
      if (remaining <= 0) {
        disableChat("That's all for now! Want to keep the conversation going?");
      }
    }
  } catch (err) {
    removeLoading();
    addMessage('Connection error. Please try again.', 'bot');
  } finally {
    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
    if (getChatCount() >= MAX_CHATS) {
      input.disabled = true;
      sendBtn.disabled = true;
    }
  }
}

// ============ CONTACT FORM ============
function submitForm(e) {
  e.preventDefault();
  var name = document.getElementById('fname').value;
  var email = document.getElementById('femail').value;
  var message = document.getElementById('fmessage').value;

  fetch('https://api.web3forms.com/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_key: '1845d8ef-284d-447c-b6e7-0ace52d19f4f',
      name: name,
      email: email,
      message: message,
      to: 'capitacoreai@gmail.com',
      subject: 'New inquiry from CapitaCoreAI.com'
    })
  }).then(function() {
    document.getElementById('contactForm').style.display = 'none';
    document.getElementById('formSuccess').classList.add('active');
  }).catch(function() {
    window.location.href = 'mailto:capitacoreai@gmail.com?subject=CapitaCoreAI Inquiry from ' + name + '&body=' + encodeURIComponent('Name: ' + name + '\nEmail: ' + email + '\n\n' + message);
  });
}

// ============ AUTH & MY AGENTS ============
async function checkMenuAuth(session) {
  if (session === undefined) {
    var r = await sb.auth.getSession();
    session = r.data.session;
  }
  var authDiv = document.getElementById('menuAuth');
  var agentsDiv = document.getElementById('menuMyAgents');
  var navMyAgents = document.getElementById('navMyAgents');
  var navLoginBtn = document.getElementById('navLoginBtn');
  var navOpenApp = document.getElementById('navOpenApp');
  if (session) {
    authDiv.style.display = 'none';
    agentsDiv.style.display = 'block';
    if (navMyAgents) navMyAgents.style.display = 'inline';
    if (navLoginBtn) navLoginBtn.style.display = 'none';
    if (navOpenApp) navOpenApp.style.display = 'inline-block';
    var result = await sb.from('profiles').select('token_balance, first_name, is_admin').eq('id', session.user.id).single();
    var data = result.data;
    var balance = data ? data.token_balance : 0;
    var isAdmin = data && data.is_admin === true;
    var hasAccess = isAdmin || balance > 0;
    var list = document.getElementById('menuAgentsList');
    if (hasAccess) {
      list.innerHTML = '<div class="agent-item"><div><span class="agent-name">DashPilot</span><br><span style="font-size:12px;color:rgba(255,255,255,0.5);">' + (isAdmin ? '\u221E' : balance) + ' credits remaining</span></div><a href="dashpilot-app.html" class="agent-link">Launch \u2192</a></div>';
    } else {
      list.innerHTML = '<div class="agent-item"><div><span class="agent-name">DashPilot</span><br><span style="font-size:12px;color:rgba(255,255,255,0.5);">No credits</span></div><a href="pricing.html" class="agent-link">Buy \u2192</a></div>';
    }
  } else {
    authDiv.style.display = 'block';
    agentsDiv.style.display = 'none';
    if (navMyAgents) navMyAgents.style.display = 'none';
    if (navLoginBtn) navLoginBtn.style.display = 'inline-block';
    if (navOpenApp) navOpenApp.style.display = 'none';
  }
}
sb.auth.onAuthStateChange(function(event, session) { checkMenuAuth(session); });

// ============ ACTIVE NAV HIGHLIGHT ============
function updateActiveNav() {
  var sections = ['services', 'about', 'contact'];
  var navLinks = document.querySelectorAll('.nav-links a[href^="#"]');
  var current = '';
  sections.forEach(function(id) {
    var el = document.getElementById(id);
    if (el && window.scrollY >= el.offsetTop - 200) current = id;
  });
  navLinks.forEach(function(link) {
    link.classList.remove('active');
    if (link.getAttribute('href') === '#' + current) link.classList.add('active');
  });
}
window.addEventListener('scroll', updateActiveNav);
updateActiveNav();

// ============ EVENT BINDINGS ============
document.addEventListener('DOMContentLoaded', function() {
  var chatFab = document.getElementById('chatFab');
  if (chatFab) chatFab.addEventListener('click', toggleChat);

  var chatClose = document.querySelector('.chat-close');
  if (chatClose) chatClose.addEventListener('click', toggleChat);

  var chatSendBtn = document.getElementById('chatSendBtn');
  if (chatSendBtn) chatSendBtn.addEventListener('click', sendChat);

  var chatInput = document.getElementById('chatInput');
  if (chatInput) {
    chatInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') sendChat();
    });
  }

  var contactForm = document.getElementById('contactForm');
  if (contactForm) contactForm.addEventListener('submit', submitForm);
});
