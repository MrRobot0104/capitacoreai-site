function updateNav(session) {
  var n = document.getElementById('navMyAgents'), l = document.getElementById('navLoginBtn');
  var ma = document.getElementById('menuAuth'), ml = document.getElementById('menuMyAgents');
  if (session) {
    if (n) n.style.display = 'inline';
    if (l) l.style.display = 'none';
    if (ma) ma.style.display = 'none';
    if (ml) ml.style.display = 'block';
  } else {
    if (n) n.style.display = 'none';
    if (l) l.style.display = 'inline-block';
    if (ma) ma.style.display = 'block';
    if (ml) ml.style.display = 'none';
  }
}

sb.auth.onAuthStateChange(async function(event, session) {
  updateNav(session);
  if (session) {
    document.getElementById('authPrompt').style.display = 'none';
    document.getElementById('pricingSection').style.display = 'block';
    document.getElementById('balanceBar').style.display = 'flex';
    document.getElementById('userEmail').textContent = session.user.email;
    var result = await sb.from('profiles').select('token_balance').eq('id', session.user.id).single();
    document.getElementById('userBalance').textContent = result.data ? result.data.token_balance : 0;
  } else {
    document.getElementById('authPrompt').style.display = 'block';
    document.getElementById('pricingSection').style.display = 'none';
    document.getElementById('balanceBar').style.display = 'none';
  }
});

var buyInProgress = false;
async function buyPackage(pkg) {
  if (buyInProgress) return;
  buyInProgress = true;

  var btns = document.querySelectorAll('.btn-buy');
  btns.forEach(function(b) { b.disabled = true; b.textContent = 'Processing...'; });

  function showError(msg) {
    buyInProgress = false;
    btns.forEach(function(b) { b.disabled = false; });
    document.querySelectorAll('.btn-buy[data-package]').forEach(function(b) {
      b.textContent = 'Buy ' + b.getAttribute('data-package').charAt(0).toUpperCase() + b.getAttribute('data-package').slice(1);
    });
    var errDiv = document.getElementById('buyError');
    if (!errDiv) {
      errDiv = document.createElement('div');
      errDiv.id = 'buyError';
      errDiv.style.cssText = 'background:#fef2f2;color:#dc2626;padding:14px 20px;border-radius:10px;margin:16px auto;max-width:600px;font-size:14px;text-align:center;';
      document.querySelector('.pricing-grid').after(errDiv);
    }
    errDiv.textContent = msg;
    console.error('buyPackage error:', msg);
  }

  var session;
  try {
    var result = await sb.auth.getSession();
    session = result.data.session;
  } catch(e) {
    showError('Auth error: ' + e.message);
    return;
  }

  if (!session) {
    showError('Not logged in. Redirecting to login...');
    setTimeout(function(){ window.location.href = 'account.html'; }, 1500);
    return;
  }

  try {
    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 30000);

    var res = await fetch('/api/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ package: pkg }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    var text = await res.text();
    console.log('Checkout response:', res.status, text);
    var data;
    try { data = JSON.parse(text); } catch (e) {
      showError('Server returned invalid response (status ' + res.status + '). Please try again.');
      return;
    }

    if (data.url) {
      window.location.href = data.url;
    } else {
      showError(data.error || 'No checkout URL returned (status ' + res.status + ')');
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      showError('Request timed out. Please try again.');
    } else {
      showError('Network error: ' + err.message);
    }
  }
}

// Reset state when page is restored from bfcache (e.g. user hits Back from Stripe)
window.addEventListener('pageshow', function(event) {
  buyInProgress = false;
  document.querySelectorAll('.btn-buy').forEach(function(b) { b.disabled = false; });
  document.querySelectorAll('.btn-buy[data-package]').forEach(function(b) {
    b.textContent = 'Buy ' + b.getAttribute('data-package').charAt(0).toUpperCase() + b.getAttribute('data-package').slice(1);
  });
  var errDiv = document.getElementById('buyError');
  if (errDiv) errDiv.remove();
});

// Bind buy buttons immediately (scripts are at end of body, DOM is ready)
(function() {
  var buttons = document.querySelectorAll('.btn-buy[data-package]');
  console.log('[DashPilot] Found ' + buttons.length + ' buy buttons');
  buttons.forEach(function(btn) {
    btn.addEventListener('click', function() {
      console.log('[DashPilot] Buy clicked:', this.getAttribute('data-package'));
      buyPackage(this.getAttribute('data-package'));
    });
  });
})();
