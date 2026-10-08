const httpStatus = require("http-status");
const { Op } = require("sequelize");
const moment = require("moment");

const { Payment } = require("../../models");
const catchAsync = require("../../utils/catchAsync");
const ApiError = require("../../utils/ApiError");
const responseWrapper = require("../../config/responseWrapper");

const getNewPaymentCount = catchAsync(async (req, res) => {
    try {
        const today = moment().format('YYYY-MM-DD');
        const paymentDoc = await Payment.findAll({
            attributes: ['id'],
            where: { created_at: { [Op.between]: [`${today} 00:00:00`, `${today} 23:59:59`] }, payment_status: 'SUCCESS' }
        })
        if (!paymentDoc) throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to Fetch Count');
        return responseWrapper(res, paymentDoc.length ? paymentDoc.length : 0, "");

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
});

const getNewPaymentTotal = catchAsync(async (req, res) => {
    try {
        const today = moment().format('YYYY-MM-DD');
        const paymentDoc = await Payment.findAll({
            attributes: ['id', 'amount'],
            where: { created_at: { [Op.between]: [`${today} 00:00:00`, `${today} 23:59:59`] }, payment_status: 'SUCCESS' }
        })
        if (!paymentDoc) throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to Fetch Count');
        let totalPayment = paymentDoc.map(obj => obj.amount).reduce((a, b) => a + b, 0);;
        return responseWrapper(res, totalPayment ? totalPayment : 0, "");

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
});


module.exports = {
    getNewPaymentCount,
    getNewPaymentTotal
};
