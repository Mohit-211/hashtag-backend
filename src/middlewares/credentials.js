const allowedOrigins = require('../helpers/accessDomains');

const credentials = (req, res, next) => {
    const origin = req.headers.origin;

    // Set headers for preflight requests (OPTIONS)
    res.setHeader('Access-Control-Allow-Methods', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');

    // Check if the origin is allowed
    if (allowedOrigins.includes(origin)) {
        // Only set the Access-Control-Allow-Origin header if the origin is allowed
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.header('Access-Control-Allow-Credentials', true);
    };
    next();
};

module.exports = credentials;
