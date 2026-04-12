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

  // Populate profile card
  var pName = document.getElementById('profileName');
  var pUser = document.getElementById('profileUsername');
  var pEmail = document.getElementById('profileEmail');
  var pCredits = document.getElementById('profileCredits');
  if (pName) pName.textContent = (data && data.first_name) || '—';
  if (pUser) pUser.textContent = (data && data.username) ? '@' + data.username : '—';
  if (pEmail) pEmail.textContent = user.email || '—';
  if (pCredits) pCredits.textContent = isAdmin ? '\u221E' : balance;

  var list = document.getElementById('agentsList');
  var balance = (data && data.token_balance) || 0;
  var hasAccess = isAdmin || balance > 0;

  var agents = [
    { name: 'DashPilot', desc: 'AI-powered dashboard builder', url: 'dashpilot-app.html', cost: 3 },
    { name: 'VoyagePilot', desc: 'AI-powered travel planner', url: 'voyagepilot-app.html', cost: 2 },
    { name: 'MerakiPilot', desc: 'AI-powered Meraki network agent', url: 'merakipilot-app.html', cost: 1 },
  ];
  var html = '';
  agents.forEach(function(agent) {
    html += '<div class="agent-card-dash"><div class="agent-info"><h3>' + agent.name + '</h3><p>' + agent.desc + '</p></div><div class="agent-actions">';
    if (isAdmin) {
      html += '<span class="credits-badge">\u221E credits</span>';
      html += '<a href="' + agent.url + '" class="btn-launch">Launch \u2192</a>';
    } else if (balance >= agent.cost) {
      html += '<span class="credits-badge">' + balance + ' credits \u00B7 ' + agent.cost + '/use</span>';
      html += '<a href="' + agent.url + '" class="btn-launch">Launch \u2192</a>';
    } else {
      html += '<span class="credits-badge">' + balance + ' credits \u00B7 needs ' + agent.cost + '</span>';
      html += '<a href="pricing.html" class="btn-buy-small">Buy Credits \u2192</a>';
    }
    html += '</div></div>';
  });

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

// ─── Profile Edit ─────────────────────────────────────────────────
var editUsernameTimer = null;
var editUsernameOk = true;
var originalUsername = '';

function showProfileEdit() {
  document.getElementById('profileView').style.display = 'none';
  document.getElementById('profileEdit').style.display = 'block';
  document.getElementById('profileEditError').style.display = 'none';
  document.getElementById('profileEditSuccess').style.display = 'none';
  // Populate inputs with current values
  var name = document.getElementById('profileName').textContent;
  var username = document.getElementById('profileUsername').textContent.replace('@', '');
  document.getElementById('editName').value = name === '—' ? '' : name;
  document.getElementById('editUsername').value = username === '—' ? '' : username;
  document.getElementById('editEmailDisplay').textContent = document.getElementById('profileEmail').textContent;
  document.getElementById('profileCreditsEdit').textContent = document.getElementById('profileCredits').textContent;
  originalUsername = username === '—' ? '' : username;
  editUsernameOk = true;
}

function cancelProfileEdit() {
  document.getElementById('profileView').style.display = 'block';
  document.getElementById('profileEdit').style.display = 'none';
}

function checkEditUsername(val) {
  var status = document.getElementById('editUsernameStatus');
  var clean = val.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
  document.getElementById('editUsername').value = clean;
  if (clean.length < 3) {
    status.innerHTML = '<span style="color:rgba(255,255,255,0.4);">Min 3 characters</span>';
    editUsernameOk = false;
    return;
  }
  if (clean === originalUsername) {
    status.innerHTML = '<span style="color:rgba(255,255,255,0.4);">Current username</span>';
    editUsernameOk = true;
    return;
  }
  status.innerHTML = '<span style="color:rgba(255,255,255,0.4);">Checking...</span>';
  editUsernameOk = false;
  clearTimeout(editUsernameTimer);
  editUsernameTimer = setTimeout(async function() {
    try {
      var result = await sb.rpc('check_username_available', { uname: clean });
      if (result.data === true) {
        status.innerHTML = '<span style="color:#34d399;">\u2713 Available</span>';
        editUsernameOk = true;
      } else {
        status.innerHTML = '<span style="color:#ef4444;">\u2717 Already taken</span>';
        editUsernameOk = false;
      }
    } catch (e) {
      status.innerHTML = '';
      editUsernameOk = true;
    }
  }, 400);
}

async function saveProfile() {
  var errEl = document.getElementById('profileEditError');
  var successEl = document.getElementById('profileEditSuccess');
  errEl.style.display = 'none';
  successEl.style.display = 'none';

  var newName = document.getElementById('editName').value.trim();
  var newUsername = document.getElementById('editUsername').value.trim().toLowerCase();

  if (!newName) { errEl.textContent = 'Name is required.'; errEl.style.display = 'block'; return; }
  if (newUsername.length < 3) { errEl.textContent = 'Username must be at least 3 characters.'; errEl.style.display = 'block'; return; }
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(newUsername)) { errEl.textContent = 'Username: 3-20 characters, letters/numbers/underscores only.'; errEl.style.display = 'block'; return; }
  if (!editUsernameOk) { errEl.textContent = 'That username is already taken.'; errEl.style.display = 'block'; return; }

  var btn = document.getElementById('saveProfileBtn');
  btn.disabled = true; btn.textContent = 'Saving...';

  try {
    var session = (await sb.auth.getSession()).data.session;
    if (!session) { errEl.textContent = 'Session expired. Please log in again.'; errEl.style.display = 'block'; return; }

    // If username changed, double-check availability
    if (newUsername !== originalUsername) {
      var check = await sb.rpc('check_username_available', { uname: newUsername });
      if (check.data !== true) {
        errEl.textContent = 'That username was just taken. Try another.';
        errEl.style.display = 'block';
        btn.disabled = false; btn.textContent = 'Save Changes';
        return;
      }
    }

    var result = await sb.from('profiles').update({ first_name: newName, username: newUsername }).eq('id', session.user.id);
    if (result.error) {
      errEl.textContent = result.error.message || 'Failed to update profile.';
      errEl.style.display = 'block';
    } else {
      // Update view mode
      document.getElementById('profileName').textContent = newName;
      document.getElementById('profileUsername').textContent = '@' + newUsername;
      document.getElementById('dashUserInfo').textContent = 'Welcome, ' + newName;
      successEl.textContent = 'Profile updated!';
      successEl.style.display = 'block';
      setTimeout(function() { cancelProfileEdit(); }, 1200);
    }
  } catch (e) {
    errEl.textContent = 'Error: ' + e.message;
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'Save Changes';
  }
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

  var editProfileBtn = document.getElementById('editProfileBtn');
  if (editProfileBtn) editProfileBtn.addEventListener('click', showProfileEdit);

  var cancelProfileBtn = document.getElementById('cancelProfileBtn');
  if (cancelProfileBtn) cancelProfileBtn.addEventListener('click', cancelProfileEdit);

  var saveProfileBtn = document.getElementById('saveProfileBtn');
  if (saveProfileBtn) saveProfileBtn.addEventListener('click', saveProfile);

  var editUsernameInput = document.getElementById('editUsername');
  if (editUsernameInput) editUsernameInput.addEventListener('input', function() { checkEditUsername(this.value); });

  document.querySelectorAll('[data-tab]').forEach(function(link) {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      switchTab(this.getAttribute('data-tab'));
    });
  });
});
