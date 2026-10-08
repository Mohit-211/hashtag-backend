function responseWrapper(res, data, message, status = 200) {
    return res.status(status).json({
        success: true,
        status: status,
        message : message,
        data: data,
    });
};
module.exports = responseWrapper;