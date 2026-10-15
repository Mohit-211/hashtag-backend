const rateLimit = require('express-rate-limit');

// Per-IP limits on endpoints that can be guessed at or used to send email.
// Counters live in memory, which is fine for the single PM2 process this app runs as.
const limiter = (windowMinutes, max, message, options = {}) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) =>
      res.status(429).json({ success: false, status: 429, message, data: '' }),
    ...options,
  });

// Sign-in: failed attempts only.
const loginLimiter = limiter(15, 10, 'Too many sign-in attempts. Please try again in 15 minutes.', {
  skipSuccessfulRequests: true,
});

// Anything that sends an email (forgot password, resend verification, register).
const emailLimiter = limiter(60, 5, 'Too many requests. Please try again later.');

// Submitting a token from an emailed link.
const tokenLimiter = limiter(15, 20, 'Too many attempts. Please try again in 15 minutes.');

// Public forms (contact us, sourcing requests).
const publicFormLimiter = limiter(60, 10, 'Too many submissions. Please try again later.');

module.exports = {
  loginLimiter,
  emailLimiter,
  tokenLimiter,
  publicFormLimiter,
};
