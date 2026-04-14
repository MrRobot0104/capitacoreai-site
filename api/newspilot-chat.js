const { applyRateLimit } = require('./_rateLimit');

const MSGS_PER_CREDIT = 5;

const SYSTEM_PROMPT = `You are NewsPilot — an AI-powered news curator built by CapitaCoreAI. You interview users about their interests, then fetch and curate personalized news digests.

## CONVERSATION FLOW

1. ONBOARDING: Ask what topics, companies, industries, or people they want to track. Be conversational, not robotic. Ask 2-3 short follow-up questions to narrow down their interests.

2. GENERATING: Once you have enough context (usually 2-3 exchanges), tell them you're ready to generate their digest. Include a <search> tag with the query.

3. CURATING: When you receive search results in <search_results> tags, write a professional, personalized news digest styled like a premium newsletter.

## SEARCH

When ready to fetch news, include ONE <search> tag per topic:
<search>{"query":"AI startups funding 2026","topic":"AI Startups"}</search>
<search>{"query":"Tesla stock price analysis April 2026","topic":"Tesla"}</search>

You can include up to 5 search tags. Each should be a specific, recent news query. Always include the current year (2026) or "latest" in queries.

When results come back, DO NOT search again. Write the digest immediately.

## DIGEST FORMAT

Write the digest as a professional newsletter. For each article:
- **Bold headline** that hooks the reader
- Source name and date
- 2-3 sentence AI summary personalized to why this matters to the user
- Link to the original article

Group articles by topic. Add a "What This Means For You" section at the end with 2-3 personalized insights.

Open with a brief editorial intro: "Here's what matters for you this week in [their topics]."

## SUBSCRIPTION

If the user says they want to subscribe for weekly updates, respond confirming their preferences and include a <subscribe> tag:
<subscribe>{"prompt":"their interests summarized","topics":["topic1","topic2"]}</subscribe>

If they want to edit their subscription, include an <edit_sub> tag:
<edit_sub>{"prompt":"updated interests","topics":["new topics"]}</edit_sub>

If they want to cancel, include:
<cancel_sub>{}</cancel_sub>

## STYLE
- Write like a premium newsletter editor (Morning Brew, The Hustle style)
- Concise, sharp, no fluff
- Use bold headers and bullet points
- Keep the full digest under 2000 words
- Be opinionated — give the user YOUR take on what matters`;

module.exports = async (req, res) => {
  var allowedOrigins = ['https://capitacoreai.io', 'https://www.capitacoreai.io'];
  var origin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', allowedOrigins.includes(origin) ? origin : 'https://capitacoreai.io');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (applyRateLimit(req, res, 'newspilot', 20, 60000)) return;

  try {
    var supabaseUrl = process.env.SUPABASE_URL;
    var supabaseAnon = process.env.SUPABASE_ANON_KEY;
    var serviceKey = process.env.SUPABASE_SERVICE_KEY;
    var apiKey = process.env.ANTHROPIC_API_KEY;
    var serpKey = process.env.SERPAPI_KEY;

    // ── Auth ────────────────────────────────────────────
    var authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    var token = authHeader.split(' ')[1];
    var userRes = await fetch(supabaseUrl + '/auth/v1/user', {
      headers: { 'Authorization': 'Bearer ' + token, 'apikey': supabaseAnon },
    });
    if (!userRes.ok) return res.status(401).json({ error: 'Invalid session' });
    var user = await userRes.json();

    var adminCheck = await fetch(
      supabaseUrl + '/rest/v1/profiles?id=eq.' + user.id + '&select=is_admin,token_balance',
      { headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey } }
    );
    var adminData = await adminCheck.json();
    var isAdmin = adminData[0]?.is_admin === true;
    var balance = adminData[0]?.token_balance || 0;

    var body = req.body || {};
    var action = body.action;

    // ── Start conversation (deduct 1 credit) ────────────
    if (action === 'start_conversation') {
      if (isAdmin) return res.status(200).json({ ok: true, remaining: 9999, cost: 1 });
      var deductRes = await fetch(supabaseUrl + '/rest/v1/rpc/deduct_credits', {
        method: 'POST',
        headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_uuid: user.id, amount: 1 }),
      });
      if (!deductRes.ok) {
        var fallbackRes = await fetch(supabaseUrl + '/rest/v1/rpc/deduct_token', {
          method: 'POST',
          headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_uuid: user.id }),
        });
        if (!fallbackRes.ok) return res.status(500).json({ error: 'Failed to check credits' });
        var fb = await fallbackRes.json();
        if (fb === -1) return res.status(402).json({ error: 'No credits remaining.' });
        return res.status(200).json({ ok: true, remaining: fb, cost: 1 });
      }
      var newBalance = await deductRes.json();
      if (newBalance === -1) return res.status(402).json({ error: 'No credits remaining.' });
      return res.status(200).json({ ok: true, remaining: newBalance, cost: 1 });
    }

    // ── Subscribe ───────────────────────────────────────
    if (action === 'subscribe') {
      var prompt = body.prompt;
      var topics = body.topics || [];
      if (!prompt) return res.status(400).json({ error: 'Missing subscription prompt' });

      // Deduct 1 credit for subscription
      if (!isAdmin) {
        var subDeduct = await fetch(supabaseUrl + '/rest/v1/rpc/deduct_credits', {
          method: 'POST',
          headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_uuid: user.id, amount: 1 }),
        });
        if (!subDeduct.ok) return res.status(402).json({ error: 'No credits to subscribe.' });
        var subBal = await subDeduct.json();
        if (subBal === -1) return res.status(402).json({ error: 'No credits to subscribe.' });
      }

      var insertRes = await fetch(supabaseUrl + '/rest/v1/news_subscriptions', {
        method: 'POST',
        headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({ user_id: user.id, prompt_text: prompt.substring(0, 2000), topics: topics.slice(0, 10), schedule: 'weekly', active: true }),
      });

      if (!insertRes.ok) {
        var insErr = await insertRes.text();
        return res.status(500).json({ error: 'Failed to create subscription.' });
      }
      var sub = await insertRes.json();
      return res.status(200).json({ ok: true, subscription: sub[0] || sub });
    }

    // ── Edit subscription ───────────────────────────────
    if (action === 'edit_sub') {
      var subId = body.subId;
      var newPrompt = body.prompt;
      var newTopics = body.topics;
      if (!subId) return res.status(400).json({ error: 'Missing subscription ID' });

      var updateFields = {};
      if (newPrompt) updateFields.prompt_text = newPrompt.substring(0, 2000);
      if (newTopics) updateFields.topics = newTopics.slice(0, 10);
      updateFields.updated_at = new Date().toISOString();

      var updateRes = await fetch(supabaseUrl + '/rest/v1/news_subscriptions?id=eq.' + subId + '&user_id=eq.' + user.id, {
        method: 'PATCH',
        headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(updateFields),
      });
      return res.status(200).json({ ok: true });
    }

    // ── Cancel subscription ─────────────────────────────
    if (action === 'cancel_sub') {
      var cancelId = body.subId;
      if (!cancelId) return res.status(400).json({ error: 'Missing subscription ID' });

      await fetch(supabaseUrl + '/rest/v1/news_subscriptions?id=eq.' + cancelId + '&user_id=eq.' + user.id, {
        method: 'PATCH',
        headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: false, updated_at: new Date().toISOString() }),
      });
      return res.status(200).json({ ok: true });
    }

    // ── Get subscriptions ───────────────────────────────
    if (action === 'get_subs') {
      var subsRes = await fetch(supabaseUrl + '/rest/v1/news_subscriptions?user_id=eq.' + user.id + '&order=created_at.desc', {
        headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey },
      });
      var subs = await subsRes.json();
      return res.status(200).json({ subscriptions: subs });
    }

    // ── Chat ────────────────────────────────────────────
    if (action === 'chat') {
      var messages = body.messages;
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'No messages' });
      }
      if (messages.length > 50) return res.status(400).json({ error: 'Too many messages' });

      if (!isAdmin && balance <= 0) {
        return res.status(402).json({ error: 'No credits remaining.' });
      }

      // Inject current date
      var now = new Date();
      var dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

      var safeMessages = messages.slice(-15).map(function(m) {
        if (!m || !['user', 'assistant'].includes(m.role)) return null;
        return { role: m.role, content: (typeof m.content === 'string' ? m.content : '').substring(0, 8000) };
      }).filter(Boolean);

      var claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 8000,
          system: SYSTEM_PROMPT + '\n\nToday is ' + dateStr + '. When searching, focus on news from 2025-2026.',
          messages: safeMessages,
        }),
      });

      if (!claudeRes.ok) {
        console.error('Claude API error:', claudeRes.status);
        return res.status(500).json({ error: 'AI service error. Try again.' });
      }

      var claudeData = await claudeRes.json();
      var text = claudeData.content.filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('');

      // Extract search tags
      var searches = [];
      var searchRegex = /<search>([\s\S]*?)<\/search>/g;
      var sm;
      while ((sm = searchRegex.exec(text)) !== null) {
        try { searches.push(JSON.parse(sm[1])); } catch (e) {}
      }

      // Extract subscribe/edit/cancel tags
      var subAction = null;
      var subMatch = text.match(/<subscribe>([\s\S]*?)<\/subscribe>/);
      if (subMatch) { try { subAction = { type: 'subscribe', data: JSON.parse(subMatch[1]) }; } catch (e) {} }
      var editMatch = text.match(/<edit_sub>([\s\S]*?)<\/edit_sub>/);
      if (editMatch) { try { subAction = { type: 'edit_sub', data: JSON.parse(editMatch[1]) }; } catch (e) {} }
      var cancelMatch = text.match(/<cancel_sub>/);
      if (cancelMatch) subAction = { type: 'cancel_sub' };

      // Clean display text
      var displayText = text
        .replace(/<search>[\s\S]*?<\/search>/g, '')
        .replace(/<subscribe>[\s\S]*?<\/subscribe>/g, '')
        .replace(/<edit_sub>[\s\S]*?<\/edit_sub>/g, '')
        .replace(/<cancel_sub>[\s\S]*?<\/cancel_sub>/g, '')
        .trim();

      // Execute searches if present
      var searchResults = null;
      if (searches.length > 0 && serpKey) {
        var results = {};
        var searchPromises = searches.slice(0, 5).map(function(s) {
          // Use regular Google search with news tab — more reliable than google_news engine
          var searchUrl = 'https://serpapi.com/search.json?engine=google&tbm=nws&q=' + encodeURIComponent(s.query) + '&num=8&api_key=' + serpKey;
          return fetch(searchUrl, { signal: AbortSignal.timeout(15000) })
            .then(function(r) { return r.json(); })
            .then(function(data) {
              if (data.error) {
                console.error('SerpAPI error:', data.error);
                results[s.topic || s.query] = [{ title: 'Search error: ' + data.error, source: '', date: '', link: '', snippet: '' }];
                return;
              }
              var articles = (data.news_results || []).slice(0, 6).map(function(a) {
                return { title: a.title, source: a.source, date: a.date, link: a.link, snippet: a.snippet || '' };
              });
              if (articles.length === 0 && data.organic_results) {
                articles = data.organic_results.slice(0, 6).map(function(a) {
                  return { title: a.title, source: a.source || a.displayed_link, date: a.date || '', link: a.link, snippet: a.snippet || '' };
                });
              }
              if (articles.length === 0) {
                console.error('SerpAPI: no results for query:', s.query, 'Keys in response:', Object.keys(data).join(', '));
              }
              results[s.topic || s.query] = articles;
            })
            .catch(function(e) {
              console.error('SerpAPI error for query:', s.query, e.message);
              results[s.topic || s.query] = [];
            });
        });
        await Promise.all(searchPromises);
        searchResults = results;
      }

      // Log usage
      fetch(supabaseUrl + '/rest/v1/usage_log', {
        method: 'POST',
        headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ user_id: user.id, prompt: 'newspilot_chat' }),
      }).catch(function() {});

      return res.status(200).json({
        response: displayText,
        searches: searches,
        searchResults: searchResults,
        subAction: subAction,
      });
    }

    return res.status(400).json({ error: 'Invalid action.' });
  } catch (err) {
    console.error('NewsPilot error:', err.message);
    return res.status(500).json({ error: 'Something went wrong. Try again.' });
  }
};
