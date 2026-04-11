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

// Prebuilt dashboard purchase
async function buyPrebuilt(btn) {
  if (!currentSession) {
    window.location.href = 'account.html';
    return;
  }

  var file = btn.getAttribute('data-file');
  var origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Checking credits...';

  try {
    // Check credit balance first
    var result = await sb.from('profiles').select('token_balance, is_admin').eq('id', currentSession.user.id).single();
    var data = result.data;
    var isAdmin = data && data.is_admin === true;
    var balance = isAdmin ? 9999 : (data ? data.token_balance : 0);

    if (balance <= 0) {
      btn.disabled = false;
      btn.textContent = origText;
      if (confirm('You don\'t have any credits. Would you like to buy some?')) {
        window.location.href = 'pricing.html';
      }
      return;
    }

    btn.textContent = 'Processing...';

    // Deduct 1 credit
    var res = await fetch('/api/dashpilot-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentSession.access_token },
      body: JSON.stringify({ action: 'start_conversation' })
    });

    if (!res.ok) {
      var err = await res.json().catch(function() { return {}; });
      if (res.status === 402) {
        btn.disabled = false;
        btn.textContent = origText;
        if (confirm('No credits remaining. Would you like to buy more?')) {
          window.location.href = 'pricing.html';
        }
        return;
      }
      alert(err.error || 'Failed to purchase. Please try again.');
      btn.disabled = false;
      btn.textContent = origText;
      return;
    }

    // Fetch and download the HTML file
    var htmlRes = await fetch('/dashboards/' + file);
    if (!htmlRes.ok) {
      alert('Failed to download dashboard. Please try again.');
      btn.disabled = false;
      btn.textContent = origText;
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
    setTimeout(function() { btn.disabled = false; btn.textContent = origText; }, 3000);
  } catch (err) {
    alert('Error: ' + err.message);
    btn.disabled = false;
    btn.textContent = origText;
  }
}
