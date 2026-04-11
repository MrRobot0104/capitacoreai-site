sb.auth.onAuthStateChange(async function(event, session) {
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
