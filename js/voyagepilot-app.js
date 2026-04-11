var GENS_PER_CREDIT = 5;
var currentUser = null;
var conversationHistory = [];
var genCount = 0;
var genLimit = GENS_PER_CREDIT;
var creditBalance = 0;
var conversationStarted = false;
var map = null;
var mapLayers = [];
var lastTripData = null;

// MAP INIT
map = L.map('map', { zoomControl: true, attributionControl: false }).setView([30, 0], 2);
L.tileLayer('https://{s}.basemaps.cartocdn.com/voyager/{z}/{x}/{y}{r}.png', {
  maxZoom: 19
}).addTo(map);

// AUTH
var initDone = false;
(function init() {
  sb.auth.getSession().then(function(result) {
    var session = result.data.session;
    if (!session) {
      setTimeout(function() {
        sb.auth.getSession().then(function(retry) {
          if (!retry.data.session) { window.location.href = 'account.html'; }
          else { currentUser = retry.data.session.user; refreshCredits(); initDone = true; }
        });
      }, 1000);
      return;
    }
    currentUser = session.user;
    refreshCredits();
    initDone = true;
  });
})();

sb.auth.onAuthStateChange(function(event, session) {
  if (event === 'SIGNED_IN' && session && !initDone) {
    currentUser = session.user;
    refreshCredits();
    initDone = true;
  }
  if (event === 'SIGNED_OUT') { window.location.href = 'account.html'; }
});

var isAdmin = false;
async function refreshCredits() {
  var result = await sb.from('profiles').select('token_balance, is_admin').eq('id', currentUser.id).single();
  var data = result.data;
  isAdmin = data && data.is_admin === true;
  creditBalance = isAdmin ? 9999 : (data ? data.token_balance : 0);
  document.getElementById('creditDisplay').textContent = isAdmin ? '\u221E' : creditBalance;
  if (creditBalance <= 0 && !conversationStarted) {
    addBotMessage("You don't have any credits. Purchase some to start planning trips.");
    disableInput();
  }
}

async function logout() { await sb.auth.signOut(); localStorage.clear(); window.location.href = '/'; }

// TEXTAREA
function autoResize(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; }
function handleKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }

// MESSAGES
function addUserMessage(text) {
  var msgs = document.getElementById('chatMessages');
  var div = document.createElement('div');
  div.className = 'msg user';
  div.innerHTML = '<div class="msg-bubble">' + escapeHtml(text) + '</div>';
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function addBotMessage(text) {
  var msgs = document.getElementById('chatMessages');
  var div = document.createElement('div');
  div.className = 'msg bot';
  div.innerHTML = '<div class="msg-bubble">' + escapeHtml(text) + '</div>';
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function addTyping() {
  var msgs = document.getElementById('chatMessages');
  var div = document.createElement('div');
  div.className = 'msg bot'; div.id = 'typingMsg';
  div.innerHTML = '<div class="msg-bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div>';
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}
function removeTyping() { var el = document.getElementById('typingMsg'); if (el) el.remove(); }
function escapeHtml(t) { var d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

function disableInput() { document.getElementById('chatInputArea').style.display = 'none'; }
function enableInput() { document.getElementById('chatInputArea').style.display = 'block'; document.getElementById('limitBar').style.display = 'none'; }

function showLimitBar() {
  document.getElementById('chatInputArea').style.display = 'none';
  var bar = document.getElementById('limitBar');
  bar.style.display = 'block';
  document.getElementById('limitMsg').textContent = creditBalance > 0
    ? "You've used all 5 trip plans for this credit."
    : "No credits remaining.";
  document.getElementById('continueBtn').style.display = creditBalance > 0 ? 'inline-block' : 'none';
}

function updateGenCounter() {
  var remaining = genLimit - genCount;
  var el = document.getElementById('genCounter');
  if (el) el.textContent = remaining + ' of ' + genLimit + ' plans left';
}

// ==================== MAP RENDERING ====================
function clearMap() {
  mapLayers.forEach(function(l) { map.removeLayer(l); });
  mapLayers = [];
}

function renderTrip(trip) {
  lastTripData = trip;
  clearMap();

  // Hide empty state
  document.getElementById('mapEmpty').classList.add('hidden');

  // Collect all points
  var points = [];
  if (trip.origin && trip.origin.lat) {
    points.push(trip.origin);
  }
  (trip.destinations || []).forEach(function(d) {
    if (d.lat) points.push(d);
  });

  if (points.length === 0) return;

  // Add markers
  var colors = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4'];
  points.forEach(function(p, i) {
    var isOrigin = i === 0 && trip.origin;
    var icon = L.divIcon({
      className: '',
      html: '<div style="background:' + colors[i % colors.length] + ';color:#fff;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:3px solid rgba(255,255,255,0.3);box-shadow:0 2px 8px rgba(0,0,0,0.4);">' + (i + 1) + '</div>',
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });
    var marker = L.marker([p.lat, p.lng], { icon: icon }).addTo(map);
    marker.bindPopup('<div style="font-family:Inter,sans-serif;"><strong>' + (p.city || '') + '</strong><br><span style="color:#666;">' + (p.country || '') + ' (' + (p.code || '') + ')</span>' + (p.days ? '<br>' + p.days + ' days' : '') + '</div>');
    mapLayers.push(marker);
  });

  // Draw flight paths
  for (var i = 0; i < points.length - 1; i++) {
    var from = points[i];
    var to = points[i + 1];
    // Create curved path using midpoint offset
    var midLat = (from.lat + to.lat) / 2;
    var midLng = (from.lng + to.lng) / 2;
    var dist = Math.sqrt(Math.pow(to.lat - from.lat, 2) + Math.pow(to.lng - from.lng, 2));
    var offset = dist * 0.15;
    midLat += offset;

    var curve = L.polyline(
      [[from.lat, from.lng], [midLat, midLng], [to.lat, to.lng]],
      { color: colors[i % colors.length], weight: 2.5, opacity: 0.8, dashArray: '8,8', smoothFactor: 3 }
    ).addTo(map);
    mapLayers.push(curve);

    // Plane icon at midpoint
    var planeIcon = L.divIcon({
      className: '',
      html: '<div style="color:' + colors[i % colors.length] + ';font-size:16px;transform:rotate(' + (Math.atan2(to.lng - from.lng, to.lat - from.lat) * 180 / Math.PI) + 'deg);">&#9992;</div>',
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });
    var plane = L.marker([midLat, midLng], { icon: planeIcon, interactive: false }).addTo(map);
    mapLayers.push(plane);
  }

  // Fit map bounds
  var bounds = L.latLngBounds(points.map(function(p) { return [p.lat, p.lng]; }));
  map.fitBounds(bounds, { padding: [60, 60], maxZoom: 6 });

  // Render flight cards
  renderFlightCards(trip.flights || [], trip.liveFlights);

  // Render itinerary
  renderItinerary(trip.itinerary || []);

  // Render budget
  renderBudget(trip.budget || {});

  // Show trip details panel
  var toggle = document.getElementById('tripToggle');
  toggle.classList.add('visible');
  document.getElementById('tripDetails').classList.add('open');
}

function renderFlightCards(flights, liveData) {
  var container = document.getElementById('flightCards');
  container.innerHTML = '';
  if (liveData) {
    var badge = document.createElement('div');
    badge.className = 'live-badge';
    badge.innerHTML = '<span class="live-dot"></span> Live Google Flights';
    container.appendChild(badge);
  }
  flights.forEach(function(f) {
    var from = encodeURIComponent(f.fromCode || f.from || '');
    var to = encodeURIComponent(f.toCode || f.to || '');
    var dateParam = f.date ? '+on+' + encodeURIComponent(f.date) : '';
    var bookUrl = 'https://www.google.com/travel/flights?q=flights+from+' + from + '+to+' + to + dateParam;
    var dateLabel = f.date ? '<div style="font-size:11px;color:#64748b;margin-top:4px;">' + escapeHtml(f.date) + '</div>' : '';
    var card = document.createElement('div');
    card.className = 'flight-card';
    card.innerHTML =
      '<div class="route"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3s-3-1-4.5.5L13 7 5 5.2 3.5 6.7l6 3.5-2 2-3-1-1.5 1.5 3.5 2 2 3.5L10 16l-1-3 2-2 3.5 6 1.5-1.5z"/></svg>' + escapeHtml(f.fromCode || f.from) + ' &rarr; ' + escapeHtml(f.toCode || f.to) + '</div>' +
      '<div class="price">' + escapeHtml(f.price || 'TBD') + '</div>' +
      '<div class="duration">' + escapeHtml(f.duration || '') + (f.stops ? ' &middot; ' + escapeHtml(f.stops) : '') + '</div>' +
      dateLabel +
      '<div class="airline">' + escapeHtml((f.airlines || []).join(', ') || f.airline || '') + '</div>' +
      '<a class="book-link" href="' + bookUrl + '" target="_blank" rel="noopener">Book on Google Flights &rarr;</a>';
    container.appendChild(card);
  });
}

function renderItinerary(days) {
  var container = document.getElementById('itinerary');
  container.innerHTML = '<div class="itin-section-title">Day-by-Day Itinerary</div>';
  days.forEach(function(day, i) {
    var div = document.createElement('div');
    div.className = 'itin-day' + (i === 0 ? ' open' : '');
    var activitiesHtml = (day.activities || []).map(function(a) {
      return '<div class="itin-activity">' +
        (a.time ? '<div class="itin-time">' + escapeHtml(a.time) + '</div>' : '') +
        '<div>' + escapeHtml(a.description || a) + '</div></div>';
    }).join('');
    div.innerHTML =
      '<div class="itin-day-header"><span><span class="day-num">Day ' + (day.day || i + 1) + '</span>' + escapeHtml(day.title || '') + '</span><span class="arrow">&#9660;</span></div>' +
      '<div class="itin-day-body">' + activitiesHtml + '</div>';
    container.appendChild(div);
  });
  // Bind accordion
  container.querySelectorAll('.itin-day-header').forEach(function(header) {
    header.addEventListener('click', function() {
      this.parentElement.classList.toggle('open');
    });
  });
}

function renderBudget(budget) {
  var container = document.getElementById('budgetBar');
  if (!budget || !budget.total) { container.innerHTML = ''; return; }
  container.innerHTML =
    '<div class="budget-item">Flights<strong>$' + (budget.flights || 0) + '</strong></div>' +
    '<div class="budget-item">Hotels<strong>$' + (budget.hotels || 0) + '</strong></div>' +
    '<div class="budget-item">Food<strong>$' + (budget.food || 0) + '</strong></div>' +
    '<div class="budget-item">Activities<strong>$' + (budget.activities || 0) + '</strong></div>' +
    '<div class="budget-total">Estimated Total<strong>$' + (budget.total || 0) + '</strong></div>';
}

// ==================== TRIP CONTROL ====================
async function startNewTrip() {
  if (creditBalance <= 0) { window.location.href = 'voyagepilot.html'; return; }
  var result = await sb.auth.getSession();
  var session = result.data.session;
  var res = await fetch('/api/voyagepilot-generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
    body: JSON.stringify({ action: 'start_conversation' })
  });
  if (!res.ok) {
    var err = await res.json().catch(function() { return {}; });
    addBotMessage(err.error || 'Failed to start. Please try again.');
    return;
  }
  conversationHistory = [];
  genCount = 0;
  genLimit = GENS_PER_CREDIT;
  conversationStarted = true;
  lastTripData = null;
  clearMap();
  document.getElementById('mapEmpty').classList.remove('hidden');
  document.getElementById('tripDetails').classList.remove('open');
  document.getElementById('tripToggle').classList.remove('visible');
  document.getElementById('chatMessages').innerHTML = '';
  enableInput();
  updateGenCounter();
  addBotMessage("New trip started! You have 5 plans. Tell me where you want to go.");
  await refreshCredits();
}

async function continueTrip() {
  var result = await sb.auth.getSession();
  var session = result.data.session;
  var res = await fetch('/api/voyagepilot-generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
    body: JSON.stringify({ action: 'start_conversation' })
  });
  if (!res.ok) { addBotMessage('Failed to add plans.'); return; }
  genLimit += GENS_PER_CREDIT;
  enableInput();
  updateGenCounter();
  addBotMessage("5 more plans added! Keep refining your trip.");
  await refreshCredits();
}

async function sendMessage() {
  var textarea = document.getElementById('chatTextarea');
  var message = textarea.value.trim();
  if (!message) return;

  if (!conversationStarted) {
    if (creditBalance <= 0) { window.location.href = 'voyagepilot.html'; return; }
    var authResult = await sb.auth.getSession();
    var res = await fetch('/api/voyagepilot-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authResult.data.session.access_token },
      body: JSON.stringify({ action: 'start_conversation' })
    });
    if (!res.ok) { addBotMessage('Failed to start.'); return; }
    conversationStarted = true;
    await refreshCredits();
  }

  if (genCount >= genLimit) { showLimitBar(); return; }

  addUserMessage(message);
  textarea.value = '';
  textarea.style.height = 'auto';
  conversationHistory.push({ role: 'user', content: message });

  document.getElementById('sendBtn').disabled = true;
  addBotMessage('Planning your trip...');
  addTyping();

  try {
    var sessionResult = await sb.auth.getSession();
    var session = sessionResult.data.session;
    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 120000);
    var res = await fetch('/api/voyagepilot-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ action: 'generate', history: conversationHistory }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    removeTyping();
    document.getElementById('sendBtn').disabled = false;

    var responseText = await res.text();
    var data;
    try { data = JSON.parse(responseText); } catch (e) {
      addBotMessage('Server error. Please try again.');
      return;
    }

    if (!res.ok) { addBotMessage(data.error || 'Something went wrong.'); return; }

    var trip = data.trip;
    genCount++;
    updateGenCounter();
    conversationHistory.push({ role: 'assistant', content: 'Trip plan: ' + JSON.stringify(trip).substring(0, 3000) });

    // Render the trip on the map and panels
    renderTrip(trip);

    var remaining = genLimit - genCount;
    var summary = 'Trip planned: ' + (trip.title || '') + '. ';
    if (trip.flights) summary += trip.flights.length + ' flights. ';
    if (trip.budget) summary += 'Estimated total: $' + trip.budget.total + '. ';
    if (remaining > 0) summary += remaining + ' plan' + (remaining === 1 ? '' : 's') + ' left. Tell me what to change.';
    else summary += 'That was your last plan for this credit.';
    addBotMessage(summary);

    if (genCount >= genLimit) { await refreshCredits(); showLimitBar(); }
  } catch (err) {
    removeTyping();
    document.getElementById('sendBtn').disabled = false;
    if (err.name === 'AbortError') addBotMessage('Request timed out. Please try again.');
    else addBotMessage('Connection error. Please try again.');
  }
}

// ==================== EVENT BINDINGS ====================
(function() {
  document.getElementById('newTripBtn').addEventListener('click', startNewTrip);
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('chatTextarea').addEventListener('keydown', handleKey);
  document.getElementById('chatTextarea').addEventListener('input', function() { autoResize(this); });
  document.getElementById('sendBtn').addEventListener('click', sendMessage);
  document.getElementById('continueBtn').addEventListener('click', continueTrip);
  document.getElementById('newTripLimitBtn').addEventListener('click', startNewTrip);
  document.getElementById('tripToggle').addEventListener('click', function() {
    document.getElementById('tripDetails').classList.toggle('open');
  });
})();
