async function checkNav(session) {
  if (session === undefined) { var r = await sb.auth.getSession(); session = r.data.session; }
  var n = document.getElementById('navMyAgents'), l = document.getElementById('navLoginBtn'), o = document.getElementById('navOpenApp');
  var ma = document.getElementById('menuAuth'), ml = document.getElementById('menuMyAgents');
  if (session) {
    if (n) n.style.display = 'inline'; if (l) l.style.display = 'none'; if (o) o.style.display = 'inline-block';
    if (ma) ma.style.display = 'none'; if (ml) ml.style.display = 'block';
  } else {
    if (n) n.style.display = 'none'; if (l) l.style.display = 'inline-block'; if (o) o.style.display = 'none';
    if (ma) ma.style.display = 'block'; if (ml) ml.style.display = 'none';
  }
}
sb.auth.onAuthStateChange(function(event, session) { checkNav(session); });
