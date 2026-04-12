var SUPABASE_URL = 'https://bdlcgzdptcanoadxbhwv.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkbGNnemRwdGNhbm9hZHhiaHd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MzAxODcsImV4cCI6MjA5MTQwNjE4N30.3AHqw9Hsqyup0Igb4n8zO-vBrae9vwQ7tHUjAP17Hi8';
var sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function toggleMobileMenu() {
  var m = document.getElementById('mobileMenu'), o = document.getElementById('mobileOverlay');
  var open = m.classList.contains('active');
  m.classList.toggle('active'); o.classList.toggle('active');
  document.body.style.overflow = open ? '' : 'hidden';
}

function menuLogout() {
  sb.auth.signOut().catch(function() {});
  localStorage.clear(); sessionStorage.clear(); window.location.href = '/';
}

// ─── Auth-aware mobile menu (runs on every page) ──────────────────
function updateMobileMenuAuth(session) {
  var authDiv = document.getElementById('menuAuth');
  var agentsDiv = document.getElementById('menuMyAgents');
  var navMyAgents = document.getElementById('navMyAgents');
  var navLoginBtn = document.getElementById('navLoginBtn');

  if (!authDiv) return; // page doesn't have the menu elements

  if (session) {
    authDiv.style.display = 'none';
    if (agentsDiv) agentsDiv.style.display = 'block';
    if (navMyAgents) navMyAgents.style.display = 'inline';
    if (navLoginBtn) navLoginBtn.style.display = 'none';

    // Fetch credits and populate menu
    sb.from('profiles').select('token_balance, first_name, username, is_admin').eq('id', session.user.id).single().then(function(result) {
      var data = result.data;
      var balance = (data && data.token_balance) || 0;
      var isAdmin = data && data.is_admin === true;
      var name = (data && data.first_name) || session.user.email;

      if (agentsDiv) {
        var html = '';
        // Credits display
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:8px;">';
        html += '<span style="font-size:13px;color:rgba(255,255,255,0.5);">Credits</span>';
        html += '<span style="font-size:16px;font-weight:700;color:#FF6A00;">' + (isAdmin ? '\u221E' : balance) + '</span>';
        html += '</div>';
        // My Account link
        html += '<a href="account.html" style="display:block;padding:12px 0;font-size:14px;font-weight:500;color:rgba(255,255,255,0.7);text-decoration:none;border-bottom:1px solid rgba(255,255,255,0.08);">My Account</a>';
        // Agent list
        if (agentsDiv.querySelector('#menuAgentsList')) {
          // Page already has agent list (index.html) - just update credits
        } else {
          html += '<a href="dashpilot-app.html" style="display:block;padding:10px 0;font-size:13px;color:rgba(255,255,255,0.5);text-decoration:none;border-bottom:1px solid rgba(255,255,255,0.05);">DashPilot <span style="float:right;color:#FF6A00;">3 cr</span></a>';
          html += '<a href="voyagepilot-app.html" style="display:block;padding:10px 0;font-size:13px;color:rgba(255,255,255,0.5);text-decoration:none;border-bottom:1px solid rgba(255,255,255,0.05);">VoyagePilot <span style="float:right;color:#FF6A00;">2 cr</span></a>';
          html += '<a href="merakipilot-app.html" style="display:block;padding:10px 0;font-size:13px;color:rgba(255,255,255,0.5);text-decoration:none;border-bottom:1px solid rgba(255,255,255,0.05);">MerakiPilot <span style="float:right;color:#FF6A00;">1 cr</span></a>';
        }
        // Buy credits + logout
        html += '<a href="pricing.html" style="display:block;margin-top:12px;padding:12px 20px;background:#FF6A00;color:#fff;border-radius:10px;font-size:14px;font-weight:500;text-align:center;text-decoration:none;">Buy Credits</a>';
        html += '<button style="display:block;width:100%;padding:12px;margin-top:8px;background:transparent;color:#FF6A00;border:1px solid rgba(255,106,0,0.3);border-radius:10px;font-size:14px;font-family:inherit;cursor:pointer;" data-action="menuLogout">Log Out</button>';

        agentsDiv.innerHTML = html;

        // Rebind logout on dynamically added button
        agentsDiv.querySelectorAll('[data-action="menuLogout"]').forEach(function(btn) {
          btn.addEventListener('click', menuLogout);
        });
      }
    });
  } else {
    if (authDiv) authDiv.style.display = 'block';
    if (agentsDiv) agentsDiv.style.display = 'none';
    if (navMyAgents) navMyAgents.style.display = 'none';
    if (navLoginBtn) navLoginBtn.style.display = 'inline-block';
  }
}

// Listen for auth changes on every page
sb.auth.onAuthStateChange(function(event, session) {
  updateMobileMenuAuth(session);
});

// Bind immediately — scripts are at end of body, DOM is ready
(function() {
  var hamburger = document.querySelector('.hamburger');
  if (hamburger) hamburger.addEventListener('click', toggleMobileMenu);

  var overlay = document.getElementById('mobileOverlay');
  if (overlay) overlay.addEventListener('click', toggleMobileMenu);

  document.querySelectorAll('[data-action="menuLogout"]').forEach(function(btn) {
    btn.addEventListener('click', menuLogout);
  });

  var mobileMenu = document.getElementById('mobileMenu');
  if (mobileMenu) {
    mobileMenu.querySelectorAll('a[href^="#"], a[href="/"]').forEach(function(link) {
      link.addEventListener('click', toggleMobileMenu);
    });
  }
})();
