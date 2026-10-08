const ApiError = require('./ApiError');
const httpStatus = require('http-status');

const errorHandler = (err, req, res, next) => {
    next(err)
    if (err instanceof ApiError) {
        
        return res.status(err.statusCode).json(
            {
                success: false,
                status: err.statusCode,
                message: err.message,
                data: '',
            }
        );
    } else {
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json(
            {
                success: false,
                status: httpStatus.INTERNAL_SERVER_ERROR,
                message: 'An internal server error occurred.',
                data: '',
            }
        );
    }
};

module.exports = errorHandler;