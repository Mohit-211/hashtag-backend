const ApiError = require('./ApiError');
const httpStatus = require('http-status');
const logger = require('../config/logger');
const { uploadErrorMessage } = require('../middlewares/upload.middleware');

// Sends one JSON error response. It no longer passes the error on to Express's
// default handler, which logged every 4xx and closed the connection.
const errorHandler = (err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    };

    const error = uploadErrorMessage(err) || err;

    if (error instanceof ApiError) {
        if (error.statusCode >= 500) {
            logger.error(`${req.method} ${req.originalUrl}: ${error.stack}`);
        };
        return res.status(error.statusCode).json(
            {
                success: false,
                status: error.statusCode,
                message: error.message,
                data: '',
            }
        );
    };

    // Malformed JSON body.
    if (error?.type === 'entity.parse.failed') {
        return res.status(httpStatus.BAD_REQUEST).json(
            {
                success: false,
                status: httpStatus.BAD_REQUEST,
                message: 'Invalid JSON in request body.',
                data: '',
            }
        );
    };

    logger.error(`${req.method} ${req.originalUrl}: ${error?.stack || error}`);
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json(
        {
            success: false,
            status: httpStatus.INTERNAL_SERVER_ERROR,
            message: 'An internal server error occurred.',
            data: '',
        }
    );
};

module.exports = errorHandler;
