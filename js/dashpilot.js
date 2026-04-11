var currentSession = null;

sb.auth.onAuthStateChange(async function(event, session) {
  currentSession = session;
  var n = document.getElementById('navMyAgents'), l = document.getElementById('navLoginBtn');
  var ma = document.getElementById('menuAuth'), ml = document.getElementById('menuLoggedIn');
  var lb = document.getElementById('launchBtn');
  if (session) {
    if (n) n.style.display = 'inline';
    if (l) l.style.display = 'none';
    if (ma) ma.style.display = 'none';
    if (ml) ml.style.display = 'block';
    var result = await sb.from('profiles').select('token_balance, is_admin').eq('id', session.user.id).single();
    var data = result.data;
    var hasAccess = (data && data.is_admin) || (data && data.token_balance > 0);
    if (lb) lb.style.display = hasAccess ? 'inline-flex' : 'none';
  } else {
    if (n) n.style.display = 'none';
    if (l) l.style.display = 'inline-block';
    if (ma) ma.style.display = 'block';
    if (ml) ml.style.display = 'none';
    if (lb) lb.style.display = 'none';
  }
});

// Gallery scroll
function scrollGallery(dir) {
  var track = document.getElementById('galleryTrack');
  if (track) track.scrollBy({ left: dir * 380, behavior: 'smooth' });
}

// Show inline message near a button
function showBtnMessage(btn, msg, isError) {
  var existing = btn.parentElement.querySelector('.btn-msg');
  if (existing) existing.remove();
  var div = document.createElement('div');
  div.className = 'btn-msg';
  div.style.cssText = 'font-size:12px;margin-top:8px;padding:8px 12px;border-radius:8px;text-align:center;' +
    (isError ? 'background:#fef2f2;color:#dc2626;' : 'background:#f0fdf4;color:#166534;');
  div.innerHTML = msg;
  btn.parentElement.appendChild(div);
}

// Prebuilt dashboard purchase
var prebuiltInProgress = false;
async function buyPrebuilt(btn) {
  if (prebuiltInProgress) return;
  prebuiltInProgress = true;

  var file = btn.getAttribute('data-file');
  var origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Checking...';

  // Clear any previous messages
  var oldMsg = btn.parentElement.querySelector('.btn-msg');
  if (oldMsg) oldMsg.remove();

  try {
    var sessionResult = await sb.auth.getSession();
    var session = sessionResult.data.session;

    if (!session) {
      btn.disabled = false;
      btn.textContent = origText;
      prebuiltInProgress = false;
      showBtnMessage(btn, 'Please <a href="account.html" style="color:#dc2626;font-weight:600;">log in</a> first to purchase.', true);
      return;
    }

    // Check credit balance
    var result = await sb.from('profiles').select('token_balance, is_admin').eq('id', session.user.id).single();
    var data = result.data;
    var isAdmin = data && data.is_admin === true;
    var balance = isAdmin ? 9999 : (data ? data.token_balance : 0);

    if (balance <= 0) {
      btn.disabled = false;
      btn.textContent = origText;
      prebuiltInProgress = false;
      showBtnMessage(btn, 'No credits remaining. <a href="pricing.html" style="color:#dc2626;font-weight:600;">Buy credits</a> to continue.', true);
      return;
    }

    btn.textContent = 'Processing...';

    // Deduct 1 credit
    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 30000);

    var res = await fetch('/api/dashpilot-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ action: 'start_conversation' }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      var err = await res.json().catch(function() { return {}; });
      btn.disabled = false;
      btn.textContent = origText;
      prebuiltInProgress = false;
      if (res.status === 402) {
        showBtnMessage(btn, 'No credits remaining. <a href="pricing.html" style="color:#dc2626;font-weight:600;">Buy credits</a> to continue.', true);
      } else {
        showBtnMessage(btn, err.error || 'Something went wrong. Please try again.', true);
      }
      return;
    }

    // Download the HTML file
    btn.textContent = 'Downloading...';
    var htmlRes = await fetch('/dashboards/' + file);
    if (!htmlRes.ok) {
      btn.disabled = false;
      btn.textContent = origText;
      prebuiltInProgress = false;
      showBtnMessage(btn, 'Failed to download. Please try again.', true);
      return;
    }

    var html = await htmlRes.text();
    var blob = new Blob([html], { type: 'text/html' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = file;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    btn.textContent = 'Downloaded!';
    prebuiltInProgress = false;
    showBtnMessage(btn, 'Dashboard saved! Open the HTML file in any browser.', false);
    setTimeout(function() { btn.disabled = false; btn.textContent = origText; }, 3000);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = origText;
    prebuiltInProgress = false;
    if (err.name === 'AbortError') {
      showBtnMessage(btn, 'Request timed out. Please try again.', true);
    } else {
      showBtnMessage(btn, 'Error: ' + err.message, true);
    }
  }
}

// Bind everything immediately (scripts at end of body)
(function() {
  // Gallery nav
  var prevBtn = document.getElementById('galleryPrev');
  if (prevBtn) prevBtn.addEventListener('click', function() { scrollGallery(-1); });
  var nextBtn = document.getElementById('galleryNext');
  if (nextBtn) nextBtn.addEventListener('click', function() { scrollGallery(1); });

  // Gallery items — open preview
  document.querySelectorAll('.gallery-item[data-preview]').forEach(function(item) {
    item.addEventListener('click', function() {
      window.open(this.getAttribute('data-preview'), '_blank');
    });
  });

  // Prebuilt buy buttons
  document.querySelectorAll('.btn-get[data-file]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      buyPrebuilt(this);
    });
  });
})();
