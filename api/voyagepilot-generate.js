const EXTRACT_PROMPT = `You are a travel planning data extractor. Extract the user's travel request into structured JSON. Output ONLY valid JSON.

Output this exact structure:
{"origin":{"city":"Miami","country":"US","code":"MIA"},"destinations":[{"city":"London","country":"UK","code":"LHR","days":3},{"city":"Tirana","country":"AL","code":"TIA","days":5}],"dates":{"departure":"2026-06-15","flexible":false},"budget":"mid-range","travelers":1,"preferences":["direct flights","central hotels"],"total_days":8}

Rules:
- Use IATA airport codes for all cities
- If dates not specified, use 2 weeks from today and set flexible:true
- If budget not specified, default to "mid-range"
- If travelers not specified, default to 1
- Extract any preferences mentioned (direct flights, window seat, etc.)
- Calculate total_days from all destination stays

Your entire response must be a single JSON object. Start with { and end with }.`;

const DESIGN_PROMPT = `You create beautiful, interactive HTML travel itineraries. Output a COMPLETE HTML file. No markdown. No backticks. Start with <!DOCTYPE html>.

REQUIRED in <head>:
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

STRUCTURE:
1. HEADER — Trip title (e.g. "Miami → London → Tirana"), dates, traveler count
2. TRIP OVERVIEW — Total duration, number of cities, estimated budget range
3. ROUTE MAP — Full-width Leaflet.js interactive map showing:
   - Markers for each city with popup info
   - Curved flight path lines between cities (use L.curve or polylines with intermediate points)
   - Different colors for each leg
   - Map centered to show all destinations
4. FLIGHT CARDS — For each leg: origin → destination, estimated price range, duration, airline suggestions
5. DAY-BY-DAY ITINERARY — Expandable sections for each day with:
   - Morning/afternoon/evening activities
   - Local restaurant suggestions
   - Transit instructions between activities
   - Estimated daily budget
6. ACCOMMODATION — Hotel suggestions for each city with price ranges
7. BUDGET SUMMARY — Total estimated cost breakdown (flights, hotels, activities, food)
8. TRAVEL TIPS — Local customs, currency, weather, visa requirements
9. FOOTER — "Built with VoyagePilot by CapitaCoreAI"

LEAFLET MAP — CRITICAL:
- Initialize inside: window.addEventListener('load', function() { ... });
- Create map: var map = L.map('map').fitBounds([[lat1,lng1],[lat2,lng2]]);
- Use OpenStreetMap tiles: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {attribution: '© OpenStreetMap'}).addTo(map);
- Add markers: L.marker([lat, lng]).addTo(map).bindPopup('City Name');
- Draw flight paths: L.polyline([[lat1,lng1],[lat2,lng2]], {color: '#2563eb', weight: 3, dashArray: '10,10'}).addTo(map);
- Map div must have explicit height: #map { height: 400px; width: 100%; border-radius: 12px; }

DESIGN:
- Clean, modern design with Inter font
- Light background (#f8f9fb), white cards with subtle borders
- Use a travel-appropriate color palette (blues, teals)
- Responsive grid layout
- No emojis — use SVG icons or simple text markers
- Flight cards with departure/arrival times, price estimates
- Budget breakdown in a clean table

Generate REALISTIC data:
- Use real airport codes and approximate flight durations
- Estimate realistic flight prices based on typical routes
- Suggest real neighborhoods and landmark areas
- Include real currency and visa information for the countries
- Suggest realistic daily budgets based on the budget preference

Keep HTML compact. No comments.`;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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

    try {
      // Safe JSON parser — handles text error responses from API
      async function safeJson(response, label) {
        const text = await response.text();
        try { return JSON.parse(text); }
        catch (e) {
          console.error(label + ' returned non-JSON:', text.substring(0, 200));
          return null;
        }
      }

      // ========= STEP 1: Extract travel intent with Haiku (fast, cheap, accurate) =========
      const extractRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 4000,
          system: EXTRACT_PROMPT,
          messages: messages,
        }),
      });

      const extractData = await safeJson(extractRes, 'Haiku');
      if (!extractData) return res.status(500).json({ error: 'AI service temporarily unavailable. Please try again.' });
      if (!extractRes.ok) {
        console.error('Haiku error:', extractRes.status);
        return res.status(500).json({ error: 'Data extraction failed: ' + (extractData.error?.message || 'AI error') });
      }

      let jsonText = extractData.content[0].text;
      jsonText = jsonText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

      let travelConfig;
      try {
        travelConfig = JSON.parse(jsonText);
      } catch (e) {
        // Try to extract JSON object from surrounding text
        var jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            travelConfig = JSON.parse(jsonMatch[0]);
          } catch (e2) {
            console.error('JSON parse error:', e2.message, 'Raw:', jsonText.substring(0, 500));
            return res.status(500).json({ error: 'Data extraction returned invalid format. Try again.' });
          }
        } else {
          console.error('No JSON found in response. Raw:', jsonText.substring(0, 500));
          return res.status(500).json({ error: 'Data extraction returned invalid format. Try again.' });
        }
      }

      // ========= STEP 2: Generate HTML itinerary with Sonnet =========
      const userRequest = (messages[messages.length - 1]?.content || '').substring(0, 1000);

      const designRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 16000,
          thinking: {
            type: 'enabled',
            budget_tokens: 10000
          },
          tools: [
            { type: 'web_search_20250305', name: 'web_search', max_uses: 3 }
          ],
          system: DESIGN_PROMPT,
          messages: [{
            role: 'user',
            content: 'Travel plan data (use these exact values):\n\n' + JSON.stringify(travelConfig, null, 2) + '\n\nUser request: ' + userRequest
          }],
        }),
      });

      const designData = await safeJson(designRes, 'Sonnet');
      if (!designData) return res.status(500).json({ error: 'AI service temporarily unavailable. Please try again.' });
      if (!designRes.ok) {
        console.error('Sonnet error:', designRes.status, JSON.stringify(designData).substring(0, 300));
        return res.status(500).json({ error: 'Design generation failed: ' + (designData.error?.message || 'AI error') });
      }

      const textBlocks = designData.content.filter(b => b.type === 'text');
      let html = textBlocks.map(b => b.text).join('');
      html = html.replace(/^```(?:html)?\s*\n/i, '').replace(/\n```\s*$/i, '').trim();
      if (!html.includes('</html>')) html += '\n</body></html>';

      // Log usage
      await fetch(supabaseUrl + '/rest/v1/usage_log', {
        method: 'POST',
        headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ user_id: user.id, prompt: userRequest.substring(0, 500) }),
      });

      res.status(200).json({ html, config: travelConfig });
    } catch (err) {
      console.error('Generate error:', err.message);
      res.status(500).json({ error: 'Generation failed: ' + err.message });
    }
    return;
  }

  res.status(400).json({ error: 'Invalid action' });
};
