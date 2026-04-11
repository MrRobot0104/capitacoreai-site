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
  "origin": {"city":"Miami","country":"US","code":"MIA","lat":25.76,"lng":-80.19},
  "destinations": [{"city":"London","country":"UK","code":"LHR","lat":51.51,"lng":-0.13,"days":3}],
  "flights": [
    {"from":"Miami","fromCode":"MIA","to":"London","toCode":"LHR","price":"$423","duration":"9h 15m","airlines":["British Airways"],"stops":"nonstop","departureTime":"6:30 PM","arrivalTime":"7:45 AM+1","flightNumber":"BA208"}
  ],
  "itinerary": [
    {"day":1,"title":"Arrive in London","city":"London","activities":[
      {"time":"Afternoon","description":"Check into hotel. Walk along the Thames."},
      {"time":"Evening","description":"Dinner at Dishoom in Covent Garden."}
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
- Generate FULL day-by-day itinerary for every day
- Real neighborhoods, landmarks, restaurants
- Realistic hotel and daily budget estimates
- Real visa, currency, weather info
Start with { end with }.`;

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
    api_key: serpKey,
  });

  try {
    const res = await fetch('https://serpapi.com/search?' + params.toString());
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

      const intent = extractJson(intentData.content[0].text);
      if (!intent || !intent.origin || !intent.destinations) {
        return res.status(500).json({ error: 'Could not parse trip details. Please be more specific about your cities and dates.' });
      }

      // ===== STEP 2: Fetch real flights from Google via SerpAPI =====
      const flightDate = intent.departure_date || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
      const travelers = intent.travelers || 1;
      const allLegs = [intent.origin, ...intent.destinations];
      const realFlights = {};
      let currentDate = flightDate;

      for (let i = 0; i < allLegs.length - 1; i++) {
        const from = allLegs[i];
        const to = allLegs[i + 1];
        const key = from.code + '-' + to.code;

        const results = await searchFlights(from.code, to.code, currentDate, travelers);
        if (results) {
          realFlights[key] = results;
        }

        // Advance date by the number of days at this destination
        if (from.days) {
          const d = new Date(currentDate);
          d.setDate(d.getDate() + from.days);
          currentDate = d.toISOString().split('T')[0];
        }
      }

      // ===== STEP 3: Build trip plan with Sonnet + real flight data =====
      const flightContext = Object.keys(realFlights).length > 0
        ? '\n\nREAL FLIGHT DATA FROM GOOGLE FLIGHTS (use these exact prices and airlines):\n' +
          Object.entries(realFlights).map(([route, flights]) =>
            route + ':\n' + flights.slice(0, 5).map(f =>
              '  ' + f.airline + ' ' + f.flightNumber + ' | ' + f.price + ' | ' + f.duration + ' | ' + f.stops + ' | Depart: ' + f.departureTime + ' Arrive: ' + f.arrivalTime
            ).join('\n')
          ).join('\n\n')
        : '';

      const userRequest = (messages[messages.length - 1]?.content || '').substring(0, 2000);

      const planRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 8000,
          system: PLAN_PROMPT,
          messages: [{
            role: 'user',
            content: 'Trip request: ' + userRequest + '\n\nExtracted intent: ' + JSON.stringify(intent) + flightContext,
          }],
        }),
      });

      const planData = await safeJson(planRes, 'Sonnet');
      if (!planData || !planRes.ok) {
        return res.status(500).json({ error: 'Trip planning failed. Try again.' });
      }

      const tripPlan = extractJson(planData.content[0].text);
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

      res.status(200).json({ trip: tripPlan });
    } else {
      res.status(400).json({ error: 'Invalid action' });
    }
  } catch (err) {
    console.error('VoyagePilot error:', err.message);
    res.status(500).json({ error: 'Trip planning failed: ' + err.message });
  }
};
