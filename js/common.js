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
  localStorage.clear(); sessionStorage.clear(); window.location.href = '/';
}

document.addEventListener('DOMContentLoaded', function() {
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
});
