// Shared in-memory rate limiter for Vercel serverless functions
// Works per warm instance — stops burst abuse without external services
const rateMap = new Map();

/**
 * Check if a request is within rate limits
 * @param {string} key - Unique key (e.g., IP + endpoint)
 * @param {number} maxRequests - Max requests allowed in window
 * @param {number} windowMs - Time window in milliseconds
 * @returns {boolean} true if allowed, false if rate limited
 */
function rateLimit(key, maxRequests, windowMs) {
  var now = Date.now();
  var windowStart = now - windowMs;

  if (!rateMap.has(key)) {
    rateMap.set(key, []);
  }

  // Filter to only timestamps within the window
  var timestamps = rateMap.get(key).filter(function(t) { return t > windowStart; });
  rateMap.set(key, timestamps);

  if (timestamps.length >= maxRequests) {
    return false; // rate limited
  }

  timestamps.push(now);
  return true; // allowed
}

/**
 * Get client IP from Vercel request headers
 */
function getClientIP(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    (req.socket && req.socket.remoteAddress) ||
    'unknown';
}

/**
 * Apply rate limit to a request — returns true if blocked (caller should return 429)
 */
function applyRateLimit(req, res, endpoint, maxRequests, windowMs) {
  var ip = getClientIP(req);
  var key = ip + ':' + endpoint;

  if (!rateLimit(key, maxRequests, windowMs || 60000)) {
    res.status(429).json({ error: 'Too many requests. Please try again later.' });
    return true; // blocked
  }
  return false; // allowed
}

// Clean up stale entries every 2 minutes
setInterval(function() {
  var now = Date.now();
  rateMap.forEach(function(timestamps, key) {
    var filtered = timestamps.filter(function(t) { return t > now - 120000; });
    if (filtered.length === 0) rateMap.delete(key);
    else rateMap.set(key, filtered);
  });
}, 120000);

module.exports = { rateLimit, getClientIP, applyRateLimit };
