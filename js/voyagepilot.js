// Nav is handled by common.js — only handle launch button visibility here
sb.auth.onAuthStateChange(async function(event, session) {
  var lb = document.getElementById('launchBtn');
  if (session) {
    var result = await sb.from('profiles').select('token_balance, is_admin').eq('id', session.user.id).single();
    var data = result.data;
    var hasAccess = (data && data.is_admin) || (data && data.token_balance > 0);
    if (lb) lb.style.display = hasAccess ? 'inline-flex' : 'none';
  } else {
    if (lb) lb.style.display = 'none';
  }
});
