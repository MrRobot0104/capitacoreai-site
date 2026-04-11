var GENS_PER_CREDIT = 5;
var currentUser = null;
var conversationHistory = [];
var genCount = 0;
var genLimit = GENS_PER_CREDIT;
var creditBalance = 0;
var conversationStarted = false;
var map = null;
var mapReady = false;
var mapLayers = [];
var lastTripData = null;

// MAP INIT (deferred)
function initMap() {
  if (map) return;
  var el = document.getElementById('map');
  if (!el) return;
  map = L.map('map', { zoomControl: true, attributionControl: false }).setView([30, 0], 2);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
  setTimeout(function() { map.invalidateSize(); mapReady = true; }, 200);
  window.addEventListener('resize', function() { if (map) map.invalidateSize(); });
}

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
  if (!map) initMap();
  if (map) setTimeout(function() { map.invalidateSize(); }, 100);
  clearMap();
  if (map) map.invalidateSize();

  // Hide empty state
  document.getElementById('mapEmpty').classList.add('hidden');
  renderTripSummary(trip);

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
    var isOrigin = i === 0;
    var iconSvg = isOrigin
      ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="' + colors[i % colors.length] + '" stroke="white" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4" fill="white"/></svg>'
      : '<svg width="28" height="36" viewBox="0 0 28 36" fill="none"><path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.27 21.73 0 14 0z" fill="' + colors[i % colors.length] + '"/><circle cx="14" cy="14" r="6" fill="white"/><text x="14" y="17" text-anchor="middle" font-size="10" font-weight="700" fill="' + colors[i % colors.length] + '">' + i + '</text></svg>';
    var icon = L.divIcon({
      className: '',
      html: iconSvg,
      iconSize: isOrigin ? [24, 24] : [28, 36],
      iconAnchor: isOrigin ? [12, 12] : [14, 36],
      popupAnchor: [0, isOrigin ? -12 : -36]
    });
    var marker = L.marker([p.lat, p.lng], { icon: icon }).addTo(map);
    var photoUrl = p.photoUrl || 'https://source.unsplash.com/300x150/?' + encodeURIComponent(p.city || '') + '+travel';
    var popupContent = '<div style="font-family:Inter,sans-serif;min-width:180px;">' +
      '<img src="' + photoUrl + '" style="width:100%;height:80px;object-fit:cover;border-radius:6px;margin-bottom:8px;" onerror="this.style.display=\'none\'" loading="lazy">' +
      '<strong style="font-size:14px;">' + escapeHtml(p.city || '') + '</strong>' +
      '<div style="color:#64748b;font-size:12px;margin-top:2px;">' + escapeHtml(p.country || '') + ' (' + escapeHtml(p.code || '') + ')</div>' +
      (p.days ? '<div style="margin-top:6px;font-size:12px;color:#2563eb;font-weight:600;">' + p.days + ' days</div>' : '') +
      '</div>';
    marker.bindPopup(popupContent);
    mapLayers.push(marker);
  });

  // Draw animated arc flight paths
  for (var i = 0; i < points.length - 1; i++) {
    (function(idx) {
      var from = points[idx];
      var to = points[idx + 1];
      var arcPoints = [];
      var steps = 50;
      for (var s = 0; s <= steps; s++) {
        var t = s / steps;
        var lat = from.lat + (to.lat - from.lat) * t;
        var lng = from.lng + (to.lng - from.lng) * t;
        var dist = Math.sqrt(Math.pow(to.lat - from.lat, 2) + Math.pow(to.lng - from.lng, 2));
        var arc = Math.sin(t * Math.PI) * dist * 0.12;
        lat += arc;
        arcPoints.push([lat, lng]);
      }
      var animatedPoints = [];
      var step = 0;
      var line = L.polyline([], { color: colors[idx % colors.length], weight: 2.5, opacity: 0.8, smoothFactor: 1 }).addTo(map);
      mapLayers.push(line);
      function animateStep() {
        if (step <= steps) {
          animatedPoints.push(arcPoints[step]);
          line.setLatLngs(animatedPoints);
          step++;
          requestAnimationFrame(animateStep);
        } else {
          var midIdx = Math.floor(steps / 2);
          var midPoint = arcPoints[midIdx];
          var angle = Math.atan2(to.lng - from.lng, to.lat - from.lat) * 180 / Math.PI;
          var planeIcon = L.divIcon({
            className: '',
            html: '<svg width="20" height="20" viewBox="0 0 24 24" fill="' + colors[idx % colors.length] + '" style="transform:rotate(' + angle + 'deg);filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3));"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>',
            iconSize: [20, 20], iconAnchor: [10, 10]
          });
          var plane = L.marker(midPoint, { icon: planeIcon, interactive: false }).addTo(map);
          mapLayers.push(plane);
        }
      }
      setTimeout(animateStep, idx * 800);
    })(i);
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

  document.getElementById('shareBtn').style.display = 'inline-flex';
  document.getElementById('printBtn').style.display = 'inline-flex';
}

function renderFlightCards(flights, liveData) {
  var container = document.getElementById('flightCards');
  container.innerHTML = '';
  if (liveData) {
    var badge = document.createElement('div');
    badge.className = 'live-badge';
    badge.innerHTML = '<span class="live-dot"></span> <span class="est-label">Estimated</span> Google Flights Data';
    container.appendChild(badge);
  }
  flights.forEach(function(f) {
    var from = encodeURIComponent(f.fromCode || f.from || '');
    var to = encodeURIComponent(f.toCode || f.to || '');
    var dateParam = f.date ? '+on+' + encodeURIComponent(f.date) : '';
    var bookUrl = 'https://www.google.com/travel/flights?q=flights+from+' + from + '+to+' + to + dateParam;
    var card = document.createElement('div');
    card.className = 'flight-card';
    card.innerHTML =
      '<div class="route"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3s-3-1-4.5.5L13 7 5 5.2 3.5 6.7l6 3.5-2 2-3-1-1.5 1.5 3.5 2 2 3.5L10 16l-1-3 2-2 3.5 6 1.5-1.5z"/></svg>' +
      escapeHtml(f.fromCode || f.from) + ' &rarr; ' + escapeHtml(f.toCode || f.to) +
      (f.date ? '<span style="margin-left:auto;font-size:10px;color:#94a3b8;font-weight:400;letter-spacing:0;">' + escapeHtml(f.date) + '</span>' : '') +
      '</div>' +
      '<div class="times">' +
        '<div class="time-point"><div class="time">' + escapeHtml(f.departureTime || '--') + '</div><div class="airport">' + escapeHtml(f.fromCode || '') + '</div></div>' +
        '<div class="time-line"><div class="line"></div><div class="stops-label">' + escapeHtml(f.duration || '') + ' · ' + escapeHtml(f.stops || '') + '</div></div>' +
        '<div class="time-point"><div class="time">' + escapeHtml(f.arrivalTime || '--') + '</div><div class="airport">' + escapeHtml(f.toCode || '') + '</div></div>' +
      '</div>' +
      '<div class="price">' + escapeHtml(f.price || 'TBD') + ' <span class="est-label">est.</span></div>' +
      '<div class="airline">' + escapeHtml((f.airlines || []).join(', ') || f.airline || '') + (f.flightNumber ? ' · ' + escapeHtml(f.flightNumber) : '') + '</div>' +
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
    var cityTag = day.city ? '<span style="font-size:11px;color:#64748b;font-weight:400;margin-left:8px;">' + escapeHtml(day.city) + '</span>' : '';
    var photoHtml = day.city ? '<img class="itin-day-photo" src="https://source.unsplash.com/800x200/?' + encodeURIComponent(day.city) + '+travel+city" alt="' + escapeHtml(day.city) + '" loading="lazy" onerror="this.style.display=\'none\'">' : '';
    var zoomBtn = day.city ? '<button class="itin-zoom-btn" data-city="' + escapeHtml(day.city) + '" title="Show on map" style="background:none;border:none;cursor:pointer;color:#2563eb;font-size:14px;padding:2px 4px;" onclick="zoomToCity(this.dataset.city)">📍</button>' : '';
    var activitiesHtml = (day.activities || []).map(function(a) {
      return '<div class="itin-activity">' +
        (a.time ? '<div class="itin-time">' + escapeHtml(a.time) + '</div>' : '') +
        '<div>' + escapeHtml(a.description || a) + '</div></div>';
    }).join('');
    div.innerHTML =
      '<div class="itin-day-header"><span><span class="day-num">Day ' + (day.day || i + 1) + '</span>' + escapeHtml(day.title || '') + cityTag + '</span><span>' + zoomBtn + '<span class="arrow">&#9660;</span></span></div>' +
      '<div class="itin-day-body">' + photoHtml + activitiesHtml + '</div>';
    container.appendChild(div);
  });
  container.querySelectorAll('.itin-day-header').forEach(function(header) {
    header.addEventListener('click', function(e) {
      if (e.target.closest('.itin-zoom-btn')) return;
      this.parentElement.classList.toggle('open');
    });
  });
}

function renderBudget(budget) {
  var container = document.getElementById('budgetBar');
  if (!budget || !budget.total) { container.innerHTML = ''; return; }
  var cats = [
    { key: 'flights', label: 'Flights', color: '#3b82f6' },
    { key: 'hotels', label: 'Hotels', color: '#8b5cf6' },
    { key: 'food', label: 'Food', color: '#f59e0b' },
    { key: 'activities', label: 'Activities', color: '#10b981' },
    { key: 'transport', label: 'Transport', color: '#06b6d4' },
  ];
  var total = budget.total || 1;
  var barHtml = cats.map(function(c) {
    var val = budget[c.key] || 0;
    var pct = Math.round((val / total) * 100);
    return pct > 0 ? '<div class="seg" style="width:' + pct + '%;background:' + c.color + ';"></div>' : '';
  }).join('');
  var itemsHtml = cats.map(function(c) {
    var val = budget[c.key] || 0;
    if (val <= 0) return '';
    return '<div class="b-item"><span class="b-dot" style="background:' + c.color + ';"></span>' + c.label + ': <strong>$' + val + '</strong></div>';
  }).join('');
  container.innerHTML =
    '<div class="budget-header"><span class="budget-title">Budget Breakdown</span><span class="budget-total-val">$' + total + '</span></div>' +
    '<div class="budget-visual">' + barHtml + '</div>' +
    '<div class="budget-items">' + itemsHtml + '</div>';
}

function renderTripSummary(trip) {
  var el = document.getElementById('tripSummary');
  if (!el) return;
  var cities = (trip.destinations || []).map(function(d) { return d.city; }).join(' → ');
  var totalDays = (trip.destinations || []).reduce(function(sum, d) { return sum + (d.days || 0); }, 0);
  var flightCount = (trip.flights || []).length;
  var totalCost = trip.budget ? '$' + trip.budget.total : '--';
  el.innerHTML =
    '<div class="summary-title">' + escapeHtml(trip.origin ? trip.origin.city + ' → ' : '') + escapeHtml(cities) + '</div>' +
    '<div class="summary-stat"><div class="stat-val">' + totalDays + '</div><div class="stat-label">Days</div></div>' +
    '<div class="summary-stat"><div class="stat-val">' + flightCount + '</div><div class="stat-label">Flights</div></div>' +
    '<div class="summary-stat"><div class="stat-val">' + escapeHtml(totalCost) + '</div><div class="stat-label">Est. Total</div></div>';
}

function showLoadingSkeleton() {
  var cards = document.getElementById('flightCards');
  cards.innerHTML = '<div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div>';
  document.getElementById('tripDetails').classList.add('open');
  document.getElementById('tripToggle').classList.add('visible');
  var mapMsg = document.getElementById('mapLoadingMsg');
  if (mapMsg) mapMsg.style.display = 'block';
}

function hideLoadingSkeleton() {
  var mapMsg = document.getElementById('mapLoadingMsg');
  if (mapMsg) mapMsg.style.display = 'none';
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
  document.getElementById('shareBtn').style.display = 'none';
  document.getElementById('printBtn').style.display = 'none';
  document.getElementById('mapOverviewBtn').style.display = 'none';
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
  showLoadingSkeleton();

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
    hideLoadingSkeleton();
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

// ==================== INTERACTIVE MAP ====================
function zoomToCity(cityName) {
  if (!map || !lastTripData) return;
  var allPoints = [];
  if (lastTripData.origin) allPoints.push(lastTripData.origin);
  (lastTripData.destinations || []).forEach(function(d) { allPoints.push(d); });
  var found = allPoints.find(function(p) { return p.city && p.city.toLowerCase() === cityName.toLowerCase(); });
  if (found && found.lat) {
    map.flyTo([found.lat, found.lng], 13, { duration: 1.5 });
    document.getElementById('mapOverviewBtn').style.display = 'block';
  }
}

function showOverview() {
  if (!map || !lastTripData) return;
  var points = [];
  if (lastTripData.origin && lastTripData.origin.lat) points.push([lastTripData.origin.lat, lastTripData.origin.lng]);
  (lastTripData.destinations || []).forEach(function(d) { if (d.lat) points.push([d.lat, d.lng]); });
  if (points.length > 0) {
    map.flyToBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 6, duration: 1.5 });
  }
  document.getElementById('mapOverviewBtn').style.display = 'none';
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
  // Expand all itinerary days for print
  document.querySelectorAll('.itin-day').forEach(function(d) { d.classList.add('open'); });
  // Open trip details
  document.getElementById('tripDetails').classList.add('open');
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
  document.getElementById('tripToggle').addEventListener('click', function() {
    document.getElementById('tripDetails').classList.toggle('open');
  });
  document.getElementById('shareBtn').addEventListener('click', shareTrip);
  document.getElementById('printBtn').addEventListener('click', printTrip);
  document.getElementById('mapOverviewBtn').addEventListener('click', showOverview);
  initMap();
})();
