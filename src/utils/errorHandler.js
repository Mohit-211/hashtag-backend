const crypto = require('crypto');
const ApiError = require('./ApiError');
const httpStatus = require('http-status');
const config = require('../config/config');
const logger = require('../config/logger');
const { uploadErrorMessage } = require('../middlewares/upload.middleware');

const GENERIC_MESSAGE = 'Something went wrong on our side. Please try again';

// 502-504 are errors we raise ourselves about a supplier or ShipStation; their text is
// written for people. Any other 5xx may carry SQL or code details, so in production its
// message is replaced and the details are logged under a short reference.
const isHidden = (statusCode) =>
    config.env === 'production' &&
    statusCode >= 500 &&
    ![httpStatus.BAD_GATEWAY, httpStatus.SERVICE_UNAVAILABLE, httpStatus.GATEWAY_TIMEOUT].includes(statusCode);

// data carries an error's details when it has any (error.details), e.g. one message per field.
const send = (res, statusCode, message, data = '') =>
    res.status(statusCode).json({ success: false, status: statusCode, message, data });

// Sends one JSON error response. It no longer passes the error on to Express's
// default handler, which logged every 4xx and closed the connection.
const errorHandler = (err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    };

    const error = uploadErrorMessage(err) || err;

    // Malformed JSON body.
    if (error?.type === 'entity.parse.failed') {
        return send(res, httpStatus.BAD_REQUEST, 'Invalid JSON in request body.');
    };

    const statusCode = error instanceof ApiError ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR;

    if (statusCode < 500) {
        return send(res, statusCode, error.message, error.details);
    };

    const reference = crypto.randomBytes(4).toString('hex');
    logger.error(`[ref ${reference}] ${req.method} ${req.originalUrl}: ${error?.stack || error}`);

    if (isHidden(statusCode) || !(error instanceof ApiError)) {
        return send(res, statusCode, `${GENERIC_MESSAGE} (reference ${reference}).`);
    };
    return send(res, statusCode, error.message);
};

module.exports = errorHandler;
