const EXTRACT_PROMPT = `You are a travel planning AI. Given a user's trip description, output a COMPLETE trip plan as a single JSON object. No text, no markdown — ONLY JSON.

Structure:
{
  "title": "Miami to London to Tirana",
  "origin": {"city":"Miami","country":"US","code":"MIA","lat":25.76,"lng":-80.19},
  "destinations": [
    {"city":"London","country":"UK","code":"LHR","lat":51.51,"lng":-0.13,"days":3},
    {"city":"Tirana","country":"AL","code":"TIA","lat":41.33,"lng":19.82,"days":5}
  ],
  "flights": [
    {"from":"Miami","fromCode":"MIA","to":"London","toCode":"LHR","price":"$340-420","duration":"9h 15m","airlines":["British Airways","American Airlines","Virgin Atlantic"],"stops":"nonstop"},
    {"from":"London","fromCode":"LHR","to":"Tirana","toCode":"TIA","price":"$80-150","duration":"3h 10m","airlines":["Wizz Air","British Airways"],"stops":"nonstop"}
  ],
  "itinerary": [
    {"day":1,"title":"Arrive in London","city":"London","activities":[
      {"time":"Afternoon","description":"Check into hotel in South Kensington. Walk along the Thames to Westminster."},
      {"time":"Evening","description":"Dinner at Dishoom in Covent Garden. Explore the West End."}
    ]},
    {"day":2,"title":"Explore London","city":"London","activities":[
      {"time":"Morning","description":"Tower of London and Tower Bridge. Walk through Borough Market for lunch."},
      {"time":"Afternoon","description":"British Museum (free entry). Tea at The Wolseley."},
      {"time":"Evening","description":"Dinner in Soho. Walk through Piccadilly Circus at night."}
    ]}
  ],
  "hotels": [
    {"city":"London","name":"Mid-range hotel in South Kensington","pricePerNight":"$120-180","nights":3},
    {"city":"Tirana","name":"Boutique hotel in Blloku district","pricePerNight":"$50-80","nights":5}
  ],
  "budget": {"flights":500,"hotels":850,"food":400,"activities":200,"transport":100,"total":2050,"currency":"USD","perDay":256},
  "tips": [
    "Albania uses the Lek (ALL). 1 USD ≈ 95 ALL.",
    "UK requires no visa for US citizens (up to 6 months).",
    "Albania requires no visa for US citizens (up to 1 year).",
    "London weather in June: 15-22°C, occasional rain.",
    "Tirana in June: 25-32°C, sunny and warm."
  ],
  "dates": {"departure":"2026-06-15","return":"2026-06-23","flexible":false},
  "travelers": 1,
  "budgetLevel": "mid-range"
}

Rules:
- Use REAL coordinates (lat/lng) for all cities — this drives the interactive map
- Use realistic flight prices based on typical routes and season
- Use real airline names that fly those routes
- Generate a FULL day-by-day itinerary for every single day
- Include real neighborhood names, real restaurant areas, real landmarks
- Budget breakdown must be realistic for the budget level
- Include real visa, currency, and weather info
- If dates not given, use 2 weeks from now
- If budget not specified, default to "mid-range"

Start with { and end with }.`;

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
          console.error(label + ' returned non-JSON:', text.substring(0, 200));
          return null;
        }
      }

      // Generate trip plan with Sonnet (single step — returns structured JSON)
      const tripRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 8000,
          system: EXTRACT_PROMPT,
          messages: messages,
        }),
      });

      const tripData = await safeJson(tripRes, 'Sonnet');
      if (!tripData) return res.status(500).json({ error: 'AI service temporarily unavailable. Please try again.' });
      if (!tripRes.ok) {
        console.error('Sonnet error:', tripRes.status);
        return res.status(500).json({ error: 'Trip planning failed: ' + (tripData.error?.message || 'AI error') });
      }

      let jsonText = tripData.content[0].text;
      jsonText = jsonText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

      let tripPlan;
      try {
        tripPlan = JSON.parse(jsonText);
      } catch (e) {
        var jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try { tripPlan = JSON.parse(jsonMatch[0]); }
          catch (e2) {
            console.error('JSON parse error:', e2.message, 'Raw:', jsonText.substring(0, 500));
            return res.status(500).json({ error: 'Trip data returned invalid format. Try again.' });
          }
        } else {
          console.error('No JSON found. Raw:', jsonText.substring(0, 500));
          return res.status(500).json({ error: 'Trip data returned invalid format. Try again.' });
        }
      }

      // Log usage
      const userRequest = (messages[messages.length - 1]?.content || '').substring(0, 500);
      await fetch(supabaseUrl + '/rest/v1/usage_log', {
        method: 'POST',
        headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ user_id: user.id, prompt: userRequest }),
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
