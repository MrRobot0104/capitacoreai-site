// Nav is handled by common.js — handle launch button visibility here
sb.auth.onAuthStateChange(async function(event, session) {
  var btns = document.querySelectorAll('.launch-btn');
  if (session) {
    // Show launch button for any logged-in user
    btns.forEach(function(b) { b.style.display = 'inline-flex'; });
  } else {
    // Hide launch button when not logged in
    btns.forEach(function(b) { b.style.display = 'none'; });
  }
});
