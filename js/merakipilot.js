// MerakiPilot landing page — show Launch button if logged in with credits
sb.auth.onAuthStateChange(async function(event, session) {
  var btn = document.getElementById('launchBtn');
  if (!btn) return;
  if (session) {
    btn.style.display = 'inline-flex';
  } else {
    btn.style.display = 'none';
  }
});
