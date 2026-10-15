const httpStatus = require('http-status');
const allowedOrigins = require('../helpers/accessDomains');
const ApiError = require('../utils/ApiError');
const logger = require('./logger');

const corsConfigs = {
    origin: (origin, callback) => {
        // Requests without an Origin header (server-to-server, Postman) are allowed.
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true)
        } else {
            // Logged so it's clear what to add to ACCESSDOMAINS.
            logger.warn(`CORS: rejected origin ${origin}; add it to ACCESSDOMAINS if it's yours`);
            callback(new ApiError(httpStatus.FORBIDDEN, `Origin not allowed by CORS: ${origin}`));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200,
};
module.exports = corsConfigs
