// ============ STEP 1: Extract travel intent ============
const INTENT_PROMPT = `Extract the travel request into JSON. Output ONLY JSON.

{"origin":{"city":"Miami","code":"MIA","lat":25.76,"lng":-80.19},"destinations":[{"city":"London","code":"LHR","lat":51.51,"lng":-0.13,"days":3},{"city":"Tirana","code":"TIA","lat":41.33,"lng":19.82,"days":5}],"departure_date":"2026-06-15","travelers":1,"budget":"mid-range","flexible":false}

Rules: Use IATA codes. Real lat/lng. If no date, use 2 weeks from now (today is ${new Date().toISOString().split('T')[0]}). Default budget "mid-range", travelers 1. Start with { end with }.`;

// ============ STEP 2: Build trip with real flight data ============
const PLAN_PROMPT = `You are a travel planning AI. You receive REAL flight data from Google Flights plus the user's preferences. Build a complete trip plan as JSON. Output ONLY JSON.

Use the REAL flight prices and airlines provided — do NOT make up prices. Pick the best option for the user's budget level from the real results.

Structure:
{
  "title": "Miami to London to Tirana",
  "origin": {"city":"Miami","country":"US","code":"MIA","lat":25.76,"lng":-80.19,"photoQuery":"miami skyline biscayne bay"},
  "destinations": [{"city":"London","country":"UK","code":"LHR","lat":51.51,"lng":-0.13,"days":3,"photoQuery":"london tower bridge skyline"}],
  "flights": [
    {"from":"Miami","fromCode":"MIA","to":"London","toCode":"LHR","price":"$423","duration":"9h 15m","airlines":["British Airways"],"stops":"nonstop","departureTime":"6:30 PM","arrivalTime":"7:45 AM+1","flightNumber":"BA208","date":"2026-06-15","isReturn":false},
    {"from":"Tirana","fromCode":"TIA","to":"Miami","toCode":"MIA","price":"$580","duration":"14h 30m","airlines":["Turkish Airlines"],"stops":"1 stop","departureTime":"10:00 AM","arrivalTime":"6:30 PM","flightNumber":"TK1078","date":"2026-06-23","isReturn":true}
  ],
  "itinerary": [
    {"day":1,"title":"Arrive in London","city":"London","activities":[
      {"time":"Afternoon","description":"Check into hotel. Walk along the Thames.","mapsUrl":"https://www.google.com/maps/search/?api=1&query=Thames+River+Walk+London"},
      {"time":"Evening","description":"Dinner at Dishoom in Covent Garden.","rating":4.5,"reviews":12000,"mapsUrl":"https://www.google.com/maps/search/?api=1&query=Dishoom+Covent+Garden+London"}
    ]}
  ],
  "hotels": [{"city":"London","name":"Mid-range hotel in South Kensington","pricePerNight":"$120-180","nights":3}],
  "budget": {"flights":500,"hotels":850,"food":400,"activities":200,"transport":100,"total":2050,"currency":"USD","perDay":256},
  "tips": ["UK requires no visa for US citizens.","London weather in June: 15-22C."],
  "dates": {"departure":"2026-06-15","return":"2026-06-23"},
  "travelers": 1,
  "budgetLevel": "mid-range"
}

Rules:
- Use the REAL flight data provided (prices, airlines, times, stops)
- Include ALL flights shown in the data including the RETURN flight home
- Mark the return flight with "isReturn":true
- Include a "date" field on every flight with the actual date
- Generate FULL day-by-day itinerary for every day
- Use REAL places from the Google Maps data provided — include exact names, ratings, review counts
- Each activity MUST include a "mapsUrl" field: https://www.google.com/maps/search/?api=1&query={Place+Name}+{City}
- Include "rating" and "reviews" fields on activities when available from the Google Maps data
- Realistic hotel and daily budget estimates — budget total must include ALL flights (outbound + return)
- Real visa, currency, weather info
- For each destination, include a "photoQuery" field with a good search term for that city (e.g. "london skyline", "tirana city center", "paris eiffel tower")
- For the origin, also include a "photoQuery" field
- Label all flight prices as estimates (prefix with "~" e.g. "~$423")
Start with { end with }.`;

// ============ SerpAPI Google Maps (real places) ============
async function searchPlaces(city, type, budget) {
  const serpKey = process.env.SERPAPI_KEY;
  if (!serpKey) return null;

  const budgetWord = budget === 'luxury' ? 'best' : budget === 'budget' ? 'cheap' : 'top rated';
  const queryMap = {
    attractions: budgetWord + ' things to do in ' + city,
    restaurants: budgetWord + ' restaurants in ' + city,
  };
  const query = queryMap[type] || 'top places in ' + city;

  const params = new URLSearchParams({
    engine: 'google_maps',
    q: query,
    type: 'search',
    hl: 'en',
    api_key: serpKey,
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const res = await fetch('https://serpapi.com/search?' + params.toString(), { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.local_results || data.local_results.length === 0) return null;

    return data.local_results.slice(0, 5).map(function(p) {
      return {
        name: p.title || '',
        rating: p.rating || null,
        reviews: p.reviews || null,
        address: p.address || '',
        type: (p.type || '').split(',')[0].trim(),
        priceLevel: p.price || '',
        gps: p.gps_coordinates || null,
        mapsUrl: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(p.title + ' ' + city),
      };
    });
  } catch (err) {
    console.error('SerpAPI Maps error for', city, ':', err.message);
    return null;
  }
}

// ============ SerpAPI Google Flights ============
async function searchFlights(from, to, date, travelers) {
  const serpKey = process.env.SERPAPI_KEY;
  if (!serpKey) return null;

  const params = new URLSearchParams({
    engine: 'google_flights',
    departure_id: from,
    arrival_id: to,
    outbound_date: date,
    type: '2',
    currency: 'USD',
    hl: 'en',
    adults: String(travelers || 1),
    deep_search: 'true',
    api_key: serpKey,
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(function() { controller.abort(); }, 10000);
    let res;
    try {
      res = await fetch('https://serpapi.com/search?' + params.toString(), { signal: controller.signal });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') {
        console.error('SerpAPI timeout for', from, '->', to);
      } else {
        console.error('SerpAPI fetch error:', fetchErr.message);
      }
      return null;
    }
    clearTimeout(timeoutId);
    if (!res.ok) {
      console.error('SerpAPI error:', res.status);
      return null;
    }
    const data = await res.json();

    // Extract best flights and other flights
    const flights = [];
    const sources = [
      ...(data.best_flights || []),
      ...(data.other_flights || []).slice(0, 5),
    ];

    sources.forEach(function(option) {
      if (!option.flights || option.flights.length === 0) return;
      const legs = option.flights;
      const firstLeg = legs[0];
      const lastLeg = legs[legs.length - 1];
      flights.push({
        price: option.price ? '$' + option.price : null,
        duration: option.total_duration ? Math.floor(option.total_duration / 60) + 'h ' + (option.total_duration % 60) + 'm' : '',
        airline: firstLeg.airline || '',
        flightNumber: firstLeg.flight_number || '',
        departureTime: firstLeg.departure_airport?.time || '',
        arrivalTime: lastLeg.arrival_airport?.time || '',
        stops: legs.length === 1 ? 'nonstop' : (legs.length - 1) + ' stop' + (legs.length > 2 ? 's' : ''),
        departureAirport: firstLeg.departure_airport?.name || '',
        arrivalAirport: lastLeg.arrival_airport?.name || '',
      });
    });

    // Sort by price ascending — cheapest first
    flights.sort(function(a, b) {
      var pa = a.price ? parseInt(a.price.replace(/[^0-9]/g, '')) : 99999;
      var pb = b.price ? parseInt(b.price.replace(/[^0-9]/g, '')) : 99999;
      return pa - pb;
    });

    return flights.length > 0 ? flights : null;
  } catch (err) {
    console.error('SerpAPI fetch error:', err.message);
    return null;
  }
}

// ============ MAIN HANDLER ============
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Public endpoint — no auth needed
    if (req.body && req.body.action === 'get_trip') {
      const { tripId } = req.body;
      if (!tripId) return res.status(400).json({ error: 'No trip ID' });
      const tripRes = await fetch(
        process.env.SUPABASE_URL + '/rest/v1/trips?id=eq.' + tripId + '&select=*',
        { headers: { 'apikey': process.env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_KEY } }
      );
      if (!tripRes.ok) return res.status(500).json({ error: 'Failed to load trip' });
      const trips = await tripRes.json();
      if (!trips || trips.length === 0) return res.status(404).json({ error: 'Trip not found' });
      return res.status(200).json({ trip: trips[0].trip_data });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated' });
    const token = authHeader.split(' ')[1];
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnon = process.env.SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;

    const userRes = await fetch(supabaseUrl + '/auth/v1/user', {
      headers: { 'Authorization': 'Bearer ' + token, 'apikey': supabaseAnon },
    });
    if (!userRes.ok) return res.status(401).json({ error: 'Invalid session' });
    const user = await userRes.json();

    const adminCheck = await fetch(
      supabaseUrl + '/rest/v1/profiles?id=eq.' + user.id + '&select=is_admin',
      { headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey } }
    );
    const adminData = await adminCheck.json();
    const isAdmin = adminData[0]?.is_admin === true;

    const { action, history } = req.body;

    if (action === 'start_conversation') {
      if (isAdmin) return res.status(200).json({ ok: true, remaining: 9999 });
      const deductRes = await fetch(supabaseUrl + '/rest/v1/rpc/deduct_token', {
        method: 'POST',
        headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_uuid: user.id }),
      });
      if (!deductRes.ok) return res.status(500).json({ error: 'Failed to check credits' });
      const newBalance = await deductRes.json();
      if (newBalance === -1) return res.status(402).json({ error: 'No credits remaining.' });
      return res.status(200).json({ ok: true, remaining: newBalance });
    }

    if (action === 'generate') {
      if (!Array.isArray(history) || history.length === 0) return res.status(400).json({ error: 'No conversation history.' });

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return res.status(500).json({ error: 'AI not configured' });

      const messages = history.slice(-10).map(h => ({
        role: h.role === 'assistant' ? 'assistant' : 'user',
        content: typeof h.content === 'string' ? h.content.substring(0, 20000) : String(h.content).substring(0, 20000)
      }));

      async function safeJson(response, label) {
        const text = await response.text();
        try { return JSON.parse(text); }
        catch (e) {
          console.error(label + ' non-JSON:', text.substring(0, 200));
          return null;
        }
      }

      function extractJson(text) {
        text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
        try { return JSON.parse(text); } catch (e) {}
        var m = text.match(/\{[\s\S]*\}/);
        if (m) { try { return JSON.parse(m[0]); } catch (e) {} }
        return null;
      }

      // ===== STEP 1: Extract travel intent with Haiku =====
      const intentRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2000,
          system: INTENT_PROMPT,
          messages: messages,
        }),
      });

      const intentData = await safeJson(intentRes, 'Haiku');
      if (!intentData || !intentRes.ok) {
        return res.status(500).json({ error: 'Failed to understand your trip request. Try again.' });
      }

      if (!intentData.content || !intentData.content[0]) {
        return res.status(500).json({ error: 'Could not understand your trip request. Please try again.' });
      }
      const intent = extractJson(intentData.content[0].text);
      if (!intent) {
        return res.status(500).json({ error: 'Could not parse trip details. Please be more specific about your cities and dates.' });
      }
      if (!intent.origin || !intent.origin.code) {
        return res.status(400).json({ error: 'Could not identify your origin city or airport code. Please specify a departure city.' });
      }
      if (!intent.destinations || intent.destinations.length === 0) {
        return res.status(400).json({ error: 'No destination cities found. Please specify where you want to travel.' });
      }
      const missingCodes = intent.destinations.filter(function(d) { return !d.code; });
      if (missingCodes.length > 0) {
        return res.status(400).json({ error: 'Could not find IATA codes for: ' + missingCodes.map(function(d) { return d.city || 'unknown'; }).join(', ') + '. Please use major city names.' });
      }

      // ===== STEP 2: Fetch real flights from Google via SerpAPI =====
      const flightDate = intent.departure_date || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
      const travelers = intent.travelers || 1;
      const destinations = intent.destinations || [];
      const allStops = [intent.origin, ...destinations];

      // Build all legs including RETURN flight (last dest → origin)
      const legs = [];
      let currentDate = flightDate;
      for (let i = 0; i < allStops.length - 1; i++) {
        legs.push({ from: allStops[i], to: allStops[i + 1], date: currentDate });
        // Advance date by days at the destination
        var daysHere = allStops[i + 1].days || 0;
        if (daysHere > 0) {
          var d = new Date(currentDate);
          d.setDate(d.getDate() + daysHere);
          currentDate = d.toISOString().split('T')[0];
        }
      }
      // Add return leg: last destination → origin
      var lastDest = destinations[destinations.length - 1];
      if (lastDest) {
        legs.push({ from: lastDest, to: intent.origin, date: currentDate, isReturn: true });
      }

      // Fetch flights for all legs in parallel
      const realFlights = {};
      const legDates = {};
      const searchPromises = legs.map(function(leg) {
        const key = leg.from.code + '-' + leg.to.code;
        legDates[key] = leg.date;
        return searchFlights(leg.from.code, leg.to.code, leg.date, travelers)
          .then(function(results) { if (results) realFlights[key] = results; });
      });
      await Promise.all(searchPromises);

      // ===== STEP 2b: Fetch real places from Google Maps via SerpAPI =====
      const placesData = {};
      const budgetLevel = intent.budget || 'mid-range';
      const placePromises = destinations.map(function(dest) {
        return Promise.all([
          searchPlaces(dest.city, 'attractions', budgetLevel),
          searchPlaces(dest.city, 'restaurants', budgetLevel),
        ]).then(function(results) {
          placesData[dest.city] = {
            attractions: results[0] || [],
            restaurants: results[1] || [],
          };
        });
      });
      await Promise.all(placePromises);

      // ===== STEP 3: Build trip plan with Sonnet + real flight + places data =====
      const noFlightRoutes = legs
        .filter(function(leg) { return !realFlights[leg.from.code + '-' + leg.to.code]; })
        .map(function(leg) { return leg.from.code + '-' + leg.to.code + ' (' + leg.date + ')'; });

      const flightContext = Object.keys(realFlights).length > 0
        ? '\n\nESTIMATED FLIGHT DATA FROM GOOGLE FLIGHTS (prices may vary — show as estimates):\n' +
          Object.entries(realFlights).map(([route, flights]) =>
            route + ' (date: ' + (legDates[route] || flightDate) + '):\n' + flights.slice(0, 5).map(f =>
              '  ' + f.airline + ' ' + f.flightNumber + ' | ' + f.price + ' | ' + f.duration + ' | ' + f.stops + ' | Depart: ' + f.departureTime + ' Arrive: ' + f.arrivalTime
            ).join('\n')
          ).join('\n\n') +
          '\n\nIMPORTANT: Include a "date" field in each flight object with the flight date (e.g. "2026-06-15"). Use the dates shown above.' +
          (noFlightRoutes.length > 0 ? '\n\nROUTES WITH NO LIVE DATA (estimate prices for these): ' + noFlightRoutes.join(', ') : '')
        : (noFlightRoutes.length > 0 ? '\n\nNo live flight data available. Estimate prices for all routes: ' + noFlightRoutes.join(', ') : '');

      // Build places context for Sonnet
      let placesContext = '';
      if (Object.keys(placesData).length > 0) {
        placesContext = '\n\nREAL PLACES FROM GOOGLE MAPS (use these actual places in the itinerary):\n';
        Object.entries(placesData).forEach(function([city, data]) {
          if (data.attractions.length > 0) {
            placesContext += '\n' + city + ' — Top Attractions:\n';
            data.attractions.forEach(function(p) {
              placesContext += '  • ' + p.name + (p.rating ? ' (' + p.rating + '★, ' + (p.reviews || 0) + ' reviews)' : '') + (p.type ? ' [' + p.type + ']' : '') + (p.address ? ' — ' + p.address : '') + '\n';
            });
          }
          if (data.restaurants.length > 0) {
            placesContext += '\n' + city + ' — Top Restaurants:\n';
            data.restaurants.forEach(function(p) {
              placesContext += '  • ' + p.name + (p.rating ? ' (' + p.rating + '★, ' + (p.reviews || 0) + ' reviews)' : '') + (p.priceLevel ? ' ' + p.priceLevel : '') + (p.type ? ' [' + p.type + ']' : '') + '\n';
            });
          }
        });
        placesContext += '\nIMPORTANT: Use these REAL places in the itinerary. Include the place name exactly as shown. Add a "mapsUrl" field to each activity using format: https://www.google.com/maps/search/?api=1&query={Place Name}+{City}';
      }

      const userRequest = (messages[messages.length - 1]?.content || '').substring(0, 2000);

      const planRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 16000,
          system: PLAN_PROMPT,
          messages: [{
            role: 'user',
            content: 'Trip request: ' + userRequest + '\n\nExtracted intent: ' + JSON.stringify(intent) + flightContext + placesContext,
          }],
        }),
      });

      const planData = await safeJson(planRes, 'Sonnet');
      if (!planData || !planRes.ok) {
        return res.status(500).json({ error: 'Trip planning failed. Try again.' });
      }

      const textBlocks = planData.content.filter(function(b) { return b.type === 'text'; });
      const tripPlan = extractJson(textBlocks.map(function(b) { return b.text; }).join(''));
      if (!tripPlan) {
        return res.status(500).json({ error: 'Trip data invalid. Try again.' });
      }

      // Tag whether real flight data was used
      tripPlan.liveFlights = Object.keys(realFlights).length > 0;

      // Log usage
      await fetch(supabaseUrl + '/rest/v1/usage_log', {
        method: 'POST',
        headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ user_id: user.id, prompt: userRequest.substring(0, 500) }),
      });

      // Save trip for sharing
      let shareId = null;
      try {
        const tripSaveRes = await fetch(supabaseUrl + '/rest/v1/trips', {
          method: 'POST',
          headers: {
            'apikey': serviceKey,
            'Authorization': 'Bearer ' + serviceKey,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({
            user_id: user.id,
            trip_data: tripPlan,
            title: tripPlan.title || 'Trip'
          }),
        });
        if (tripSaveRes.ok) {
          const saved = await tripSaveRes.json();
          if (saved && saved[0]) shareId = saved[0].id;
        }
      } catch (e) {
        console.error('Failed to save trip:', e.message);
      }
      tripPlan.shareId = shareId;

      res.status(200).json({ trip: tripPlan });
    } else {
      res.status(400).json({ error: 'Invalid action' });
    }
  } catch (err) {
    console.error('VoyagePilot error:', err.message);
    res.status(500).json({ error: 'Trip planning failed: ' + err.message });
  }
};
