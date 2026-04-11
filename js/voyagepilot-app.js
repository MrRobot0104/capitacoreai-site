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

// ==================== HELPERS ====================
function escapeHtml(t) { var d = document.createElement('div'); d.textContent = t || ''; return d.innerHTML; }

function cityGradient(city) {
  var hash = 0;
  for (var i = 0; i < (city||'').length; i++) hash = city.charCodeAt(i) + ((hash << 5) - hash);
  var h = Math.abs(hash) % 360;
  return 'linear-gradient(135deg, hsl(' + h + ',65%,45%), hsl(' + ((h+40)%360) + ',55%,35%))';
}

// Fetch city photo — use Unsplash source (always returns a photo, no API key)
var cityPhotoCache = {};
function fetchCityPhoto(city, callback) {
  if (!city) return;
  if (cityPhotoCache[city]) { callback(cityPhotoCache[city]); return; }
  var url = 'https://source.unsplash.com/800x400/?' + encodeURIComponent(city + ' city skyline travel');
  // Unsplash source redirects to an actual image URL — just use it directly
  cityPhotoCache[city] = url;
  callback(url);
}

// ==================== MAP ====================
function initMap() {
  if (map) return;
  var el = document.getElementById('map');
  if (!el) return;
  map = L.map('map', { zoomControl: true, attributionControl: false }).setView([30, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: ''
  }).addTo(map);
  setTimeout(function() { map.invalidateSize(); }, 300);
  window.addEventListener('resize', function() { if (map) map.invalidateSize(); });
}

function clearMap() {
  mapLayers.forEach(function(l) { if (map) map.removeLayer(l); });
  mapLayers = [];
}

function showMap() {
  var container = document.getElementById('mapContainer');
  container.style.display = 'block';
  if (!map) initMap();
  setTimeout(function() {
    if (map) map.invalidateSize();
    if (lastTripData) drawRoute(lastTripData);
    // Second invalidateSize after routes are drawn
    setTimeout(function() { if (map) map.invalidateSize(); }, 300);
  }, 300);
}

function hideMap() {
  document.getElementById('mapContainer').style.display = 'none';
}

function drawRoute(trip) {
  clearMap();
  var points = [];
  if (trip.origin && trip.origin.lat) points.push(trip.origin);
  (trip.destinations || []).forEach(function(d) { if (d.lat) points.push(d); });
  // Add origin at the end to show return flight path
  if (trip.origin && trip.origin.lat && points.length > 1) {
    points.push({ city: trip.origin.city, country: trip.origin.country, code: trip.origin.code, lat: trip.origin.lat, lng: trip.origin.lng, isReturn: true });
  }
  if (points.length === 0) return;

  var colors = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4'];
  points.forEach(function(p, i) {
    // Skip duplicate marker for return point (origin is already drawn)
    if (p.isReturn) return;
    var isOrigin = i === 0;
    var iconSvg = isOrigin
      ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="' + colors[i % colors.length] + '" stroke="white" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4" fill="white"/></svg>'
      : '<svg width="28" height="36" viewBox="0 0 28 36" fill="none"><path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.27 21.73 0 14 0z" fill="' + colors[i % colors.length] + '"/><circle cx="14" cy="14" r="6" fill="white"/><text x="14" y="17" text-anchor="middle" font-size="10" font-weight="700" fill="' + colors[i % colors.length] + '">' + i + '</text></svg>';
    var icon = L.divIcon({ className: '', html: iconSvg, iconSize: isOrigin ? [24,24] : [28,36], iconAnchor: isOrigin ? [12,12] : [14,36] });
    var marker = L.marker([p.lat, p.lng], { icon: icon }).addTo(map);
    marker.bindPopup('<div style="font-family:Inter,sans-serif;"><strong>' + escapeHtml(p.city||'') + '</strong><div style="color:#64748b;font-size:12px;">' + escapeHtml(p.country||'') + (p.days ? ' · ' + p.days + ' days' : '') + '</div></div>');
    mapLayers.push(marker);
  });

  for (var i = 0; i < points.length - 1; i++) {
    var isReturnLeg = points[i + 1].isReturn;
    // Create curved arc
    var from = points[i], to = points[i + 1];
    var arcPts = [];
    var steps = 40;
    for (var s = 0; s <= steps; s++) {
      var t = s / steps;
      var lat = from.lat + (to.lat - from.lat) * t;
      var lng = from.lng + (to.lng - from.lng) * t;
      var d = Math.sqrt(Math.pow(to.lat - from.lat, 2) + Math.pow(to.lng - from.lng, 2));
      lat += Math.sin(t * Math.PI) * d * 0.1;
      arcPts.push([lat, lng]);
    }
    var lineStyle = {
      color: isReturnLeg ? '#f59e0b' : colors[i % colors.length],
      weight: isReturnLeg ? 2.5 : 3,
      opacity: isReturnLeg ? 0.6 : 0.8,
      dashArray: isReturnLeg ? '6,10' : null
    };
    var line = L.polyline(arcPts, lineStyle).addTo(map);
    mapLayers.push(line);

    // Add plane icon at midpoint
    var mid = arcPts[Math.floor(steps / 2)];
    var angle = Math.atan2(to.lng - from.lng, to.lat - from.lat) * 180 / Math.PI;
    var planeIcon = L.divIcon({
      className: '',
      html: '<svg width="18" height="18" viewBox="0 0 24 24" fill="' + (isReturnLeg ? '#f59e0b' : colors[i % colors.length]) + '" style="transform:rotate(' + angle + 'deg);"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>',
      iconSize: [18, 18], iconAnchor: [9, 9]
    });
    var plane = L.marker(mid, { icon: planeIcon, interactive: false }).addTo(map);
    mapLayers.push(plane);
  }

  map.fitBounds(L.latLngBounds(points.map(function(p) { return [p.lat, p.lng]; })), { padding: [40, 40], maxZoom: 6 });
}

// ==================== RENDERING ====================
function renderTrip(trip) {
  lastTripData = trip;

  // Show trip content, hide empty state
  document.getElementById('tripEmpty').style.display = 'none';
  document.getElementById('tripScroll').style.display = 'block';

  renderTripHero(trip);
  renderFlightCards(trip.flights || [], trip.liveFlights);
  renderItinerary(trip.itinerary || []);
  renderBudget(trip.budget || {});
  renderTips(trip.tips || []);

  // Map data stored for when user opens it
  lastTripData = trip;

  document.getElementById('shareBtn').style.display = 'inline-flex';
  document.getElementById('printBtn').style.display = 'inline-flex';

  document.getElementById('tripScroll').scrollTop = 0;
}

function renderTripHero(trip) {
  var el = document.getElementById('tripHero');
  var cities = (trip.destinations || []).map(function(d) { return d.city; }).join(' → ');
  var totalDays = (trip.destinations || []).reduce(function(s, d) { return s + (d.days || 0); }, 0);
  var originCity = trip.origin ? trip.origin.city : '';
  var gradient = cityGradient(cities);
  el.style.background = gradient;
  // Fetch hero photo from first destination
  var heroCity = (trip.destinations && trip.destinations[0]) ? trip.destinations[0].city : '';
  if (heroCity) {
    fetchCityPhoto(heroCity, function(url) {
      el.style.backgroundImage = 'linear-gradient(to bottom, rgba(0,0,0,0.15), rgba(0,0,0,0.6)), url(' + url + ')';
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
    });
  }
  el.innerHTML =
    '<div class="hero-title">' + escapeHtml(trip.title || originCity + ' → ' + cities) + '</div>' +
    '<div class="hero-meta">' + (trip.dates ? escapeHtml(trip.dates.departure) + ' → ' + escapeHtml(trip.dates.return) : '') + ' · ' + (trip.travelers || 1) + ' traveler' + ((trip.travelers || 1) > 1 ? 's' : '') + ' · ' + escapeHtml(trip.budgetLevel || 'mid-range') + '</div>' +
    '<div class="hero-stats">' +
      '<div class="hero-stat"><div class="val">' + totalDays + '</div><div class="label">Days</div></div>' +
      '<div class="hero-stat"><div class="val">' + (trip.flights || []).length + '</div><div class="label">Flights</div></div>' +
      '<div class="hero-stat"><div class="val">' + (trip.budget ? '$' + trip.budget.total : '--') + '</div><div class="label">Est. Total</div></div>' +
    '</div>';
}

function renderFlightCards(flights, liveData) {
  var container = document.getElementById('flightsSection');
  if (!flights || flights.length === 0) { container.innerHTML = ''; return; }
  var html = '<div class="section-title">Flights</div>';
  if (liveData) {
    html += '<div class="live-badge"><span class="live-dot"></span> Estimated Google Flights Data</div>';
  }
  html += '<div class="flight-grid">';
  flights.forEach(function(f) {
    var from = encodeURIComponent(f.fromCode || f.from || '');
    var to = encodeURIComponent(f.toCode || f.to || '');
    var dateParam = f.date ? '+on+' + encodeURIComponent(f.date) : '';
    var bookUrl = 'https://www.google.com/travel/flights?q=flights+from+' + from + '+to+' + to + dateParam;
    html += '<div class="flight-card">' +
      '<div class="route"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3s-3-1-4.5.5L13 7 5 5.2 3.5 6.7l6 3.5-2 2-3-1-1.5 1.5 3.5 2 2 3.5L10 16l-1-3 2-2 3.5 6 1.5-1.5z"/></svg>' +
      escapeHtml(f.fromCode || f.from) + ' \u2192 ' + escapeHtml(f.toCode || f.to) +
      (f.date ? '<span style="margin-left:auto;font-size:10px;color:#94a3b8;font-weight:400;">' + escapeHtml(f.date) + '</span>' : '') +
      '</div>' +
      '<div class="times">' +
        '<div class="time-point"><div class="time">' + escapeHtml(f.departureTime || '--') + '</div><div class="airport">' + escapeHtml(f.fromCode || '') + '</div></div>' +
        '<div class="time-line"><div class="stops-label">' + escapeHtml(f.duration || '') + ' · ' + escapeHtml(f.stops || '') + '</div></div>' +
        '<div class="time-point"><div class="time">' + escapeHtml(f.arrivalTime || '--') + '</div><div class="airport">' + escapeHtml(f.toCode || '') + '</div></div>' +
      '</div>' +
      '<div class="price">' + escapeHtml(f.price || 'TBD') + ' <span class="est-label">est.</span></div>' +
      '<div class="airline">' + escapeHtml((f.airlines || []).join(', ') || f.airline || '') + '</div>' +
      '<a class="book-link" href="' + bookUrl + '" target="_blank" rel="noopener">Book on Google Flights \u2192</a>' +
      '</div>';
  });
  html += '</div>';
  container.innerHTML = html;
}

function renderItinerary(days) {
  var container = document.getElementById('itinerarySection');
  if (!days || days.length === 0) { container.innerHTML = ''; return; }
  var html = '<div class="section-title">Day-by-Day Itinerary</div>';
  var lastCity = '';
  days.forEach(function(day, i) {
    if (day.city && day.city !== lastCity) {
      var cid = 'city-banner-' + i;
      html += '<div class="city-photo" id="' + cid + '" style="background:' + cityGradient(day.city) + ';" data-city="' + escapeHtml(day.city) + '">' + escapeHtml(day.city) + '</div>';
      lastCity = day.city;
    }
    var cityTag = day.city ? '<span style="font-size:11px;color:#64748b;font-weight:400;margin-left:8px;">' + escapeHtml(day.city) + '</span>' : '';
    html += '<div class="itin-day' + (i === 0 ? ' open' : '') + '">' +
      '<div class="itin-day-header"><span><span class="day-num">Day ' + (day.day || i+1) + '</span>' + escapeHtml(day.title || '') + cityTag + '</span><span class="arrow">\u25bc</span></div>' +
      '<div class="itin-day-body">';
    (day.activities || []).forEach(function(a) {
      var desc = a.description || a;
      var ratingHtml = a.rating ? '<span class="act-rating">★ ' + a.rating + (a.reviews ? ' <span class="act-reviews">(' + a.reviews.toLocaleString() + ')</span>' : '') + '</span>' : '';
      var linkOpen = a.mapsUrl ? '<a href="' + a.mapsUrl + '" target="_blank" rel="noopener" class="act-link">' : '';
      var linkClose = a.mapsUrl ? ' <span class="act-maps-icon">📍</span></a>' : '';
      html += '<div class="itin-activity">' +
        (a.time ? '<div class="itin-time">' + escapeHtml(a.time) + '</div>' : '') +
        '<div>' + linkOpen + escapeHtml(desc) + linkClose + ' ' + ratingHtml + '</div></div>';
    });
    html += '</div></div>';
  });
  container.innerHTML = html;
  container.querySelectorAll('.itin-day-header').forEach(function(h) {
    h.addEventListener('click', function() { this.parentElement.classList.toggle('open'); });
  });
  // Fetch real photos for city banners
  container.querySelectorAll('.city-photo[data-city]').forEach(function(el) {
    fetchCityPhoto(el.dataset.city, function(url) {
      el.style.backgroundImage = 'linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(0,0,0,0.5)), url(' + url + ')';
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
    });
  });
}

function renderBudget(budget) {
  var container = document.getElementById('budgetSection');
  if (!budget || !budget.total) { container.innerHTML = ''; return; }
  var cats = [
    { key: 'flights', label: 'Flights', color: '#3b82f6' },
    { key: 'hotels', label: 'Hotels', color: '#8b5cf6' },
    { key: 'food', label: 'Food', color: '#f59e0b' },
    { key: 'activities', label: 'Activities', color: '#10b981' },
    { key: 'transport', label: 'Transport', color: '#06b6d4' },
  ];
  var total = budget.total || 1;
  var html = '<div class="section-title">Budget Breakdown</div><div class="budget-card">';
  html += '<div class="budget-header"><span class="budget-title">Estimated Total</span><span class="budget-total-val">$' + total + '</span></div>';
  html += '<div class="budget-visual">';
  cats.forEach(function(c) { var v = budget[c.key] || 0; var pct = Math.round((v/total)*100); if (pct > 0) html += '<div class="seg" style="width:' + pct + '%;background:' + c.color + ';"></div>'; });
  html += '</div><div class="budget-items">';
  cats.forEach(function(c) { var v = budget[c.key] || 0; if (v > 0) html += '<div class="b-item"><span class="b-dot" style="background:' + c.color + ';"></span>' + c.label + ': <strong>$' + v + '</strong></div>'; });
  html += '</div></div>';
  container.innerHTML = html;
}

function renderTips(tips) {
  var container = document.getElementById('tipsSection');
  if (!tips || tips.length === 0) { container.innerHTML = ''; return; }
  var html = '<div class="section-title">Travel Tips</div>';
  tips.forEach(function(t) { html += '<div class="tip-card">' + escapeHtml(t) + '</div>'; });
  container.innerHTML = html;
}

function showLoading() {
  document.getElementById('tripEmpty').style.display = 'none';
  var scroll = document.getElementById('tripScroll');
  scroll.style.display = 'block';
  document.getElementById('tripHero').innerHTML = '<div class="skeleton" style="height:160px;border-radius:0;"></div>';
  document.getElementById('flightsSection').innerHTML = '<div class="section-title">Flights</div><div class="flight-grid"><div class="skeleton" style="height:160px;"></div><div class="skeleton" style="height:160px;"></div></div>';
  document.getElementById('itinerarySection').innerHTML = '';
  document.getElementById('budgetSection').innerHTML = '';
  document.getElementById('tipsSection').innerHTML = '';
}

function hideLoading() { /* no-op, renderTrip replaces content */ }

// ==================== AUTH ====================
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
  document.getElementById('creditDisplay').textContent = isAdmin ? '\u221e' : creditBalance;
  if (creditBalance <= 0 && !conversationStarted) {
    addBotMessage("You don't have any credits. Purchase some to start planning trips.");
    disableInput();
  }
}

async function logout() { await sb.auth.signOut(); localStorage.clear(); window.location.href = '/'; }

// ==================== TEXTAREA ====================
function autoResize(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; }
function handleKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }

// ==================== MESSAGES ====================
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
  document.getElementById('tripEmpty').style.display = 'flex';
  document.getElementById('tripScroll').style.display = 'none';
  document.getElementById('mapContainer').style.display = 'none';
  document.getElementById('chatMessages').innerHTML = '';
  document.getElementById('shareBtn').style.display = 'none';
  document.getElementById('printBtn').style.display = 'none';
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
  showLoading();

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

    hideLoading();
    renderTrip(trip);

    var remaining = genLimit - genCount;
    var summary = 'Trip planned: ' + (trip.title || '') + '. ';
    if (trip.flights) summary += trip.flights.length + ' flights. ';
    if (trip.budget) summary += 'Estimated total: ~$' + trip.budget.total + '. ';
    if (remaining > 0) summary += remaining + ' plan' + (remaining === 1 ? '' : 's') + ' left.';
    else summary += 'That was your last plan for this credit.';
    addBotMessage(summary);

    // Follow-up question to drive engagement
    if (remaining > 0) {
      var questions = [
        'Any specific cuisine you want to try? I can find the best ' + ((trip.destinations||[])[0]||{}).city + ' restaurants for you.',
        'What citizenship do you hold? I can give you accurate visa and entry requirements.',
        'Want me to find direct flights only, or are layovers okay if they save money?',
        'Any must-see attractions or experiences? I can build the itinerary around them.',
        'Traveling with kids, partner, or solo? I can adjust the activities and hotels.',
        'Want me to add a day trip or side excursion from ' + ((trip.destinations||[])[0]||{}).city + '?',
        'Prefer boutique hotels, big chains, or Airbnb-style stays?',
        'Morning person or night owl? I can shift the daily schedule.',
        'Want me to factor in travel insurance or airport transfers?',
        'Any dietary restrictions? I can recommend restaurants that accommodate them.',
      ];
      var q = questions[Math.floor(Math.random() * questions.length)];
      setTimeout(function() { addBotMessage(q); }, 1500);
    }

    if (genCount >= genLimit) { await refreshCredits(); showLimitBar(); }
  } catch (err) {
    removeTyping();
    document.getElementById('sendBtn').disabled = false;
    if (err.name === 'AbortError') addBotMessage('Request timed out. Please try again.');
    else addBotMessage('Connection error. Please try again.');
  }
}

// ==================== SHARE / PRINT ====================
async function shareTrip() {
  if (!lastTripData || !lastTripData.shareId) {
    alert('No trip to share yet. Generate a trip first.');
    return;
  }
  var shareUrl = window.location.origin + '/trip.html?id=' + lastTripData.shareId;
  try {
    await navigator.clipboard.writeText(shareUrl);
    var toast = document.getElementById('shareToast');
    toast.classList.add('show');
    setTimeout(function() { toast.classList.remove('show'); }, 2500);
  } catch (e) {
    prompt('Copy this link:', shareUrl);
  }
}

function printTrip() {
  if (!lastTripData) { alert('No trip to print yet.'); return; }
  document.querySelectorAll('.itin-day').forEach(function(d) { d.classList.add('open'); });
  setTimeout(function() { window.print(); }, 300);
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
  document.getElementById('shareBtn').addEventListener('click', shareTrip);
  document.getElementById('printBtn').addEventListener('click', printTrip);
  document.getElementById('mapToggleBtn').addEventListener('click', function() {
    var container = document.getElementById('mapContainer');
    if (container.style.display === 'none') showMap();
    else hideMap();
  });
  document.getElementById('mapCloseBtn').addEventListener('click', hideMap);
})();
