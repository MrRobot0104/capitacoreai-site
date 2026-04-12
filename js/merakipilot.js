// MerakiPilot landing page — show Launch button if logged in with credits
sb.auth.onAuthStateChange(async function(event, session) {
  var btn = document.getElementById('launchBtn');
  if (!btn) return;
  if (session) {
    var result = await sb.from('profiles').select('token_balance, is_admin').eq('id', session.user.id).single();
    var data = result.data;
    var hasAccess = (data && data.is_admin === true) || (data && data.token_balance > 0);
    btn.style.display = hasAccess ? 'inline-flex' : 'none';
  } else {
    btn.style.display = 'none';
  }
});
