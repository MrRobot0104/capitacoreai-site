var IS_RECOVERY = window.location.hash.includes('type=recovery');

async function init() {
  sb.auth.onAuthStateChange(function(event, session) {
    if (event === 'PASSWORD_RECOVERY') { showResetForm(); return; }
    if (event === 'SIGNED_IN' && session && !IS_RECOVERY) { showDashboard(session.user); updateNav(true); }
    if (event === 'SIGNED_OUT') {
      document.getElementById('dashboard').classList.remove('active');
      document.getElementById('authSection').style.display = 'block';
      updateNav(false);
      switchTab('login');
    }
  });
  await sb.auth.getSession();
  if (IS_RECOVERY) { showResetForm(); return; }
  var result = await sb.auth.getSession();
  var session = result.data.session;
  if (session) { showDashboard(session.user); updateNav(true); }
}
init();

function switchTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(function(t) { t.classList.remove('active'); });
  document.querySelectorAll('.auth-form').forEach(function(f) { f.classList.remove('active'); });
  document.getElementById('signupSuccess').style.display = 'none';
  document.getElementById('resetSuccess').style.display = 'none';
  if (tab === 'login') {
    document.querySelector('.auth-tab:first-child').classList.add('active');
    document.getElementById('loginForm').classList.add('active');
  } else if (tab === 'forgot') {
    document.getElementById('forgotForm').classList.add('active');
  } else {
    document.querySelector('.auth-tab:last-child').classList.add('active');
    document.getElementById('signupForm').classList.add('active');
  }
  hideError();
}

function showError(msg) { var el = document.getElementById('authError'); el.textContent = msg; el.classList.add('show'); }
function hideError() { document.getElementById('authError').classList.remove('show'); }

function showResetForm() {
  document.getElementById('authSection').style.display = 'block';
  document.getElementById('dashboard').classList.remove('active');
  document.querySelectorAll('.auth-tab').forEach(function(t) { t.classList.remove('active'); });
  document.querySelectorAll('.auth-form').forEach(function(f) { f.classList.remove('active'); });
  document.getElementById('newPasswordForm').style.display = 'block';
}

async function handleNewPassword(e) {
  e.preventDefault(); hideError();
  var pass = document.getElementById('newPass').value;
  var confirm = document.getElementById('confirmPass').value;
  if (pass !== confirm) { showError('Passwords do not match.'); return; }
  var btn = document.getElementById('newPassBtn'); btn.disabled = true; btn.textContent = 'Updating...';
  var result = await sb.auth.updateUser({ password: pass });
  btn.disabled = false; btn.textContent = 'Update Password';
  if (result.error) { showError(result.error.message); return; }
  await sb.auth.signOut(); localStorage.clear();
  document.getElementById('newPasswordForm').style.display = 'none';
  document.getElementById('passwordUpdated').style.display = 'block';
  window.history.replaceState(null, '', 'account.html');
}

var usernameTimer = null, usernameAvailable = false;
function checkUsername(val) {
  var status = document.getElementById('usernameStatus');
  var clean = val.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
  if (clean.length < 3) { status.innerHTML = '<span style="color:#999999;">Min 3 characters</span>'; usernameAvailable = false; return; }
  status.innerHTML = '<span style="color:#999999;">Checking...</span>';
  clearTimeout(usernameTimer);
  usernameTimer = setTimeout(async function() {
    try {
      var result = await sb.rpc('check_username_available', { uname: clean });
      if (result.data === true) { status.innerHTML = '<span style="color:#10b981;">\u2713 Available</span>'; usernameAvailable = true; }
      else { status.innerHTML = '<span style="color:#ef4444;">\u2717 Already taken</span>'; usernameAvailable = false; }
    } catch (e) { status.innerHTML = ''; usernameAvailable = true; }
  }, 400);
}

async function handleSignup(e) {
  e.preventDefault(); hideError();
  var firstName = document.getElementById('signupName').value.trim();
  var username = document.getElementById('signupUsername').value.trim().toLowerCase();
  if (!usernameAvailable) { showError('Please choose an available username.'); return; }
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) { showError('Username: 3-20 characters, letters/numbers/underscores only.'); return; }
  var btn = document.getElementById('signupBtn'); btn.disabled = true; btn.textContent = 'Creating account...';
  var result = await sb.auth.signUp({
    email: document.getElementById('signupEmail').value,
    password: document.getElementById('signupPass').value,
    options: { data: { first_name: firstName, username: username } }
  });
  btn.disabled = false; btn.textContent = 'Create Account';
  if (result.error) { showError(result.error.message); return; }
  document.querySelectorAll('.auth-form').forEach(function(f) { f.classList.remove('active'); });
  document.querySelectorAll('.auth-tab').forEach(function(t) { t.classList.remove('active'); });
  document.getElementById('signupSuccess').style.display = 'block';
}

async function handleLogin(e) {
  e.preventDefault(); hideError();
  var btn = document.getElementById('loginBtn'); btn.disabled = true; btn.textContent = 'Logging in...';
  var result = await sb.auth.signInWithPassword({
    email: document.getElementById('loginEmail').value,
    password: document.getElementById('loginPass').value,
  });
  btn.disabled = false; btn.textContent = 'Log In';
  if (result.error) { showError(result.error.message); return; }
  showDashboard(result.data.user);
}

async function handleForgot(e) {
  e.preventDefault(); hideError();
  var btn = document.getElementById('forgotBtn'); btn.disabled = true; btn.textContent = 'Sending...';
  var result = await sb.auth.resetPasswordForEmail(
    document.getElementById('forgotEmail').value,
    { redirectTo: window.location.origin + '/account.html' }
  );
  btn.disabled = false; btn.textContent = 'Send Reset Link';
  if (result.error) { showError(result.error.message); return; }
  document.querySelectorAll('.auth-form').forEach(function(f) { f.classList.remove('active'); });
  document.getElementById('resetSuccess').style.display = 'block';
}

async function showDashboard(user) {
  document.getElementById('authSection').style.display = 'none';
  document.getElementById('dashboard').classList.add('active');
  var result = await sb.from('profiles').select('token_balance, first_name, username, is_admin').eq('id', user.id).single();
  var data = result.data;
  var name = (data && data.first_name) || user.email;
  var isAdmin = data && data.is_admin === true;
  document.getElementById('dashUserInfo').textContent = 'Welcome, ' + name;

  var list = document.getElementById('agentsList');
  var balance = (data && data.token_balance) || 0;
  var hasAccess = isAdmin || balance > 0;

  var html = '';
  html += '<div class="agent-card-dash"><div class="agent-info"><h3>DashPilot</h3><p>AI-powered dashboard builder</p></div><div class="agent-actions">';
  if (hasAccess) {
    html += '<span class="credits-badge">' + (isAdmin ? '\u221E' : balance) + ' credits</span>';
    html += '<a href="dashpilot-app.html" class="btn-launch">Launch \u2192</a>';
  } else {
    html += '<span class="credits-badge">No credits</span>';
    html += '<a href="pricing.html" class="btn-buy-small">Buy Credits \u2192</a>';
  }
  html += '</div></div>';
  html += '<div class="agent-card-dash" style="border-style:dashed;opacity:0.6;"><div class="agent-info"><h3>More agents coming soon</h3><p>Stay tuned for new AI agents</p></div><div class="agent-actions"><a href="agents.html" class="btn-buy-small">Browse \u2192</a></div></div>';

  list.innerHTML = html;
}

async function handleLogout() {
  try { await sb.auth.signOut(); } catch(e) {}
  localStorage.clear(); sessionStorage.clear(); window.location.replace('/');
}

function updateNav(loggedIn) {
  var n = document.getElementById('navMyAgents');
  var l = document.getElementById('navLoginBtn');
  var ma = document.getElementById('menuAuth');
  var mw = document.getElementById('menuLogoutWrap');
  if (n) { n.style.display = loggedIn ? 'inline' : 'none'; if (loggedIn) n.classList.add('active'); }
  if (l) l.style.display = loggedIn ? 'none' : 'inline-block';
  if (ma) ma.style.display = loggedIn ? 'none' : 'block';
  if (mw) mw.style.display = loggedIn ? 'block' : 'none';
}

document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.auth-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      var tabName = this.textContent.trim().toLowerCase().replace(/\s+/g, '');
      if (tabName === 'login' || tabName === 'log in' || tabName === 'login') switchTab('login');
      else switchTab('signup');
    });
  });

  var loginForm = document.getElementById('loginForm');
  if (loginForm) loginForm.addEventListener('submit', handleLogin);

  var signupForm = document.getElementById('signupForm');
  if (signupForm) signupForm.addEventListener('submit', handleSignup);

  var forgotForm = document.getElementById('forgotForm');
  if (forgotForm) forgotForm.addEventListener('submit', handleForgot);

  var newPasswordForm = document.getElementById('newPasswordForm');
  if (newPasswordForm) newPasswordForm.addEventListener('submit', handleNewPassword);

  var logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

  var signupUsername = document.getElementById('signupUsername');
  if (signupUsername) signupUsername.addEventListener('input', function() { checkUsername(this.value); });

  document.querySelectorAll('[data-tab]').forEach(function(link) {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      switchTab(this.getAttribute('data-tab'));
    });
  });
});
