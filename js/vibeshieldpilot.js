// Nav is handled by common.js — handle launch button visibility here
sb.auth.onAuthStateChange(async function(event, session) {
  var btns = document.querySelectorAll('.launch-btn');
  if (session) {
    btns.forEach(function(b) { b.style.display = 'inline-flex'; });
  } else {
    btns.forEach(function(b) { b.style.display = 'none'; });
  }
});
