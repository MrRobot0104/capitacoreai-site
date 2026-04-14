// NewsPilot Weekly Digest Cron
// Triggered by Vercel Cron every Monday at 8:00 AM EST
// Fetches active subscriptions, generates personalized digests, sends via Resend

module.exports = async function handler(req, res) {
  // Verify this is a cron invocation (Vercel sets this header)
  var authHeader = req.headers.authorization;
  var cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== 'Bearer ' + cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  var supabaseUrl = process.env.SUPABASE_URL;
  var serviceKey = process.env.SUPABASE_SERVICE_KEY;
  var apiKey = process.env.ANTHROPIC_API_KEY;
  var resendKey = process.env.RESEND_API_KEY;

  if (!resendKey) return res.status(500).json({ error: 'RESEND_API_KEY not configured' });

  try {
    // 1. Fetch all active subscriptions
    var subsRes = await fetch(supabaseUrl + '/rest/v1/news_subscriptions?active=eq.true&select=*,profiles(email,first_name)', {
      headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey },
    });
    var subs = await subsRes.json();
    if (!Array.isArray(subs) || subs.length === 0) {
      return res.status(200).json({ message: 'No active subscriptions', count: 0 });
    }

    var results = [];

    for (var i = 0; i < subs.length; i++) {
      var sub = subs[i];
      var email = sub.profiles && sub.profiles.email;
      var name = (sub.profiles && sub.profiles.first_name) || 'there';
      if (!email) { results.push({ id: sub.id, status: 'skipped', reason: 'no email' }); continue; }

      try {
        // Check credits first
        var balRes = await fetch(supabaseUrl + '/rest/v1/profiles?id=eq.' + sub.user_id + '&select=token_balance,is_admin', {
          headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey },
        });
        var balData = await balRes.json();
        var isAdmin = balData[0] && balData[0].is_admin === true;
        var balance = (balData[0] && balData[0].token_balance) || 0;

        if (!isAdmin && balance < 1) {
          // Send "no credits" email
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: 'NewsPilot <digest@capitacoreai.io>',
              to: [email],
              subject: 'Your NewsPilot Digest is Paused — Buy Credits to Resume',
              html: '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#111;font-family:Arial,sans-serif;"><div style="max-width:500px;margin:0 auto;padding:40px 24px;text-align:center;">' +
                '<h1 style="color:#FF6A00;font-size:22px;">Your Weekly Digest is Paused</h1>' +
                '<p style="color:#ccc;font-size:15px;line-height:1.6;">Hey ' + name + ', your NewsPilot subscription needs credits to continue. Each weekly digest costs 1 credit.</p>' +
                '<a href="https://capitacoreai.io/pricing.html" style="display:inline-block;margin:20px 0;padding:14px 32px;background:#FF6A00;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">Buy Credits</a>' +
                '<p style="color:#666;font-size:12px;margin-top:24px;">Once you have credits, your digest will automatically resume next Friday.</p>' +
                '<p style="color:#444;font-size:11px;margin-top:16px;">CapitaCoreAI &middot; <a href="https://capitacoreai.io/newspilot-app.html" style="color:#FF6A00;">Manage Subscription</a></p>' +
                '</div></body></html>',
            }),
          });
          results.push({ id: sub.id, email: email, status: 'paused', reason: 'no credits' });
          continue;
        }

        // 2. Fetch news for this subscription's topics
        var topics = sub.topics || [];
        var prompt = sub.prompt_text || topics.join(', ');
        var searchQueries = topics.length > 0 ? topics : [prompt];

        var allArticles = {};
        var fetchPromises = searchQueries.slice(0, 5).map(function(topic) {
          var rssUrl = 'https://news.google.com/rss/search?q=' + encodeURIComponent(topic + ' when:7d') + '&hl=en-US&gl=US&ceid=US:en';
          return fetch(rssUrl, { signal: AbortSignal.timeout(10000) })
            .then(function(r) { return r.text(); })
            .then(function(xml) {
              var articles = [];
              var items = xml.split('<item>').slice(1);
              items.slice(0, 5).forEach(function(item) {
                var title = (item.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
                var link = (item.match(/<link\/?>(https?:\/\/[^\s<]+)/) || [])[1] || '';
                var pubDate = (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
                var source = (item.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1] || '';
                title = title.replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').replace(/&amp;/g, '&').trim();
                source = source.replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').trim();
                var date = '';
                try { date = new Date(pubDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch(e) {}
                if (title) articles.push({ title: title, source: source, date: date, link: link });
              });
              allArticles[topic] = articles;
            })
            .catch(function() { allArticles[topic] = []; });
        });
        await Promise.all(fetchPromises);

        // 3. Generate personalized digest with Claude
        var articleContext = JSON.stringify(allArticles);
        var claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 4000,
            system: 'You are NewsPilot, an AI news curator. Write a personalized weekly email digest based on the articles provided. The subscriber is interested in: ' + prompt + '. Write in a premium newsletter style (like Morning Brew). Include article titles with source names, 2-sentence summaries of why each matters to the reader, and a "What This Means For You" section at the end. Keep it concise and sharp. Output clean HTML suitable for email — use inline styles, no external CSS. Use a dark background (#111111) with white text, orange (#FF6A00) for headers and links. Include the CapitaCoreAI branding.',
            messages: [{ role: 'user', content: 'Here are this week\'s articles for the subscriber. Their interests: ' + prompt + '\n\nArticles:\n' + articleContext + '\n\nGenerate the email digest HTML.' }],
          }),
        });

        if (!claudeRes.ok) {
          results.push({ id: sub.id, email: email, status: 'failed', reason: 'Claude API error' });
          continue;
        }

        var claudeData = await claudeRes.json();
        var digestHtml = claudeData.content.filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('');

        // Extract HTML from markdown code blocks if present
        digestHtml = digestHtml.replace(/^```html\s*/m, '').replace(/\s*```$/m, '').trim();

        // Wrap in email template if Claude didn't include full HTML
        if (!digestHtml.includes('<html') && !digestHtml.includes('<!DOCTYPE')) {
          digestHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0;padding:0;background:#111111;font-family:Arial,Helvetica,sans-serif;">' +
            '<div style="max-width:600px;margin:0 auto;padding:32px 24px;">' +
            '<div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6A00;">' +
            '<h1 style="color:#FF6A00;font-size:24px;margin:0;">NewsPilot Weekly Digest</h1>' +
            '<p style="color:#888;font-size:13px;margin:8px 0 0;">Your personalized news from CapitaCoreAI</p></div>' +
            digestHtml +
            '<div style="text-align:center;margin-top:32px;padding-top:16px;border-top:1px solid #333;color:#666;font-size:11px;">' +
            '<p>Powered by <a href="https://capitacoreai.io" style="color:#FF6A00;">CapitaCoreAI</a></p>' +
            '<p>To manage your subscription, visit <a href="https://capitacoreai.io/newspilot-app.html" style="color:#FF6A00;">NewsPilot</a></p></div>' +
            '</div></body></html>';
        }

        // 4. Send email via Resend
        var fromEmail = 'NewsPilot <digest@capitacoreai.io>';
        // Fallback if domain not verified
        var sendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: fromEmail,
            to: [email],
            subject: 'Your Weekly News Digest — ' + new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
            html: digestHtml,
          }),
        });

        var sendData = await sendRes.json();
        if (!sendRes.ok) {
          // Try with default Resend email if domain not verified
          if (sendData.message && sendData.message.includes('domain')) {
            sendRes = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: 'NewsPilot <onboarding@resend.dev>',
                to: [email],
                subject: 'Your Weekly News Digest — ' + new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
                html: digestHtml,
              }),
            });
            sendData = await sendRes.json();
          }
        }

        // 5. Update last_sent_at
        await fetch(supabaseUrl + '/rest/v1/news_subscriptions?id=eq.' + sub.id, {
          method: 'PATCH',
          headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ last_sent_at: new Date().toISOString() }),
        });

        // 6. Deduct 1 credit for the weekly digest
        await fetch(supabaseUrl + '/rest/v1/rpc/deduct_credits', {
          method: 'POST',
          headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_uuid: sub.user_id, amount: 1 }),
        });

        results.push({ id: sub.id, email: email, status: sendRes.ok ? 'sent' : 'failed', resend: sendData });

      } catch (subErr) {
        results.push({ id: sub.id, email: email, status: 'error', reason: subErr.message });
      }
    }

    return res.status(200).json({ message: 'Cron complete', processed: results.length, results: results });

  } catch (err) {
    console.error('NewsPilot cron error:', err.message);
    return res.status(500).json({ error: 'Cron failed: ' + err.message });
  }
};
