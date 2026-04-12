// Nav is handled by common.js — handle launch button visibility here
sb.auth.onAuthStateChange(async function(event, session) {
  var btns = document.querySelectorAll('.launch-btn');
  if (session) {
    var result = await sb.from('profiles').select('token_balance, is_admin').eq('id', session.user.id).single();
    var data = result.data;
    var hasAccess = (data && data.is_admin) || (data && data.token_balance > 0);
    btns.forEach(function(b) { b.style.display = hasAccess ? 'inline-flex' : 'none'; });
  } else {
    btns.forEach(function(b) { b.style.display = 'none'; });
  }
});
