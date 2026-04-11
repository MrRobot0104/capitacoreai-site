async function checkMenuAuth(session) {
  if (session === undefined) {
    var r = await sb.auth.getSession();
    session = r.data.session;
  }
  var navMyAgents = document.getElementById('navMyAgents');
  var navLoginBtn = document.getElementById('navLoginBtn');
  if (session) {
    document.getElementById('menuAuth').style.display = 'none';
    document.getElementById('menuMyAgents').style.display = 'block';
    if (navMyAgents) navMyAgents.style.display = 'inline';
    if (navLoginBtn) navLoginBtn.style.display = 'none';
    var result = await sb.from('profiles').select('token_balance, is_admin').eq('id', session.user.id).single();
    var data = result.data;
    var bal = data ? data.token_balance : 0;
    var isAdmin = data && data.is_admin === true;
    var hasAccess = isAdmin || bal > 0;
    document.getElementById('menuAgentsList').innerHTML = hasAccess
      ? '<a href="znak-app.html" style="display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-bottom:1px solid #eeeeee;color:#111111;font-weight:500;">znak <span style="font-size:12px;color:#999999;">' + (isAdmin ? '\u221E' : bal) + ' credits</span></a>'
      : '<a href="pricing.html" style="display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-bottom:1px solid #eeeeee;color:#111111;font-weight:500;">znak <span style="font-size:12px;color:#999999;">Buy credits \u2192</span></a>';
  } else {
    if (navMyAgents) navMyAgents.style.display = 'none';
    if (navLoginBtn) navLoginBtn.style.display = 'inline-block';
  }
}
sb.auth.onAuthStateChange(function(event, session) { checkMenuAuth(session); });

document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.agent-card[data-href]').forEach(function(card) {
    card.addEventListener('click', function() {
      window.location.href = this.getAttribute('data-href');
    });
  });
});
