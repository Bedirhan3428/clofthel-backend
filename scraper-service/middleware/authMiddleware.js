/**
 * Authentication Middleware for Internal Scraper & Ingestion Service
 */
function verifyApiKey(req, res, next) {
  const apiKey = req.headers['x-internal-api-key'] || req.headers['api-key'] || req.query.apiKey;
  const expectedKey = process.env.INTERNAL_API_KEY;

  if (!expectedKey) {
    console.warn('⚠️ [AuthMiddleware] INTERNAL_API_KEY is not defined in environment variables.');
    // Allow request in development if INTERNAL_API_KEY is not configured
    return next();
  }

  if (!apiKey || apiKey !== expectedKey) {
    console.warn(`🔒 [AuthMiddleware] Unauthorized access attempt from IP: ${req.ip}`);
    return res.status(403).json({
      success: false,
      error: 'Unauthorized access. Valid internal API key required.'
    });
  }

  next();
}

module.exports = { verifyApiKey };
