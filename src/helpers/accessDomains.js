const config = require('../config/config');

// ACCESSDOMAINS is a comma-separated list of exact origins (scheme + host [+ port], no path).
// Spaces and trailing slashes are tolerated, since "https://a.com, https://b.com/" used to
// silently reject b.com.
const allowedOrigins = String(config.accessDomains || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);

module.exports = allowedOrigins;
