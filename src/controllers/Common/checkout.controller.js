const httpStatus = require("http-status");
const { checkoutService } = require("../../services");
const responseWrapper = require("../../config/responseWrapper");
const catchAsync = require("../../utils/catchAsync");

const getSquareConfig = catchAsync(async (req, res) => {
  const data = await checkoutService.getSquareConfig();

  return responseWrapper(res, data, "Square config fetched", httpStatus.OK);
});

const createPayment = catchAsync(async (req, res) => {
  const data = await checkoutService.createPayment(req.body);

  return responseWrapper(
    res,
    data,
    "Payment created successfully",
    httpStatus.OK,
  );
});

const getSquarePaymentStatus = catchAsync(async (req, res) => {
  const data = await checkoutService.getSquarePaymentStatus(req.body);

  return responseWrapper(
    res,
    data,
    "Payment status fetched successfully",
    httpStatus.OK,
  );
});

const squareWebhook = catchAsync(async (req, res) => {
  const data = await checkoutService.squareWebhook(req.body);

  return res.status(200).json({
    success: true,
  });
});

const getPaymentHistory = catchAsync(async (req, res) => {
  const data = await checkoutService.getPaymentHistory(req.body, req.query);

  return responseWrapper(
    res,
    data,
    "Payment history fetched successfully",
    httpStatus.OK,
  );
});

const getAllPayments = catchAsync(async (req, res) => {
  const data = await checkoutService.getAllPayments(req.query);

  return responseWrapper(
    res,
    data,
    "Payments fetched successfully",
    httpStatus.OK,
  );
});

const createPayPalOrder = catchAsync(async (req, res) => {
  const data = await checkoutService.createPayPalOrder(req.body);

  return responseWrapper(
    res,
    data,
    "PayPal order created successfully",
    httpStatus.OK,
  );
});

const capturePayPalOrder = catchAsync(async (req, res) => {
  const data = await checkoutService.capturePayPalOrder(req.body);

  return responseWrapper(
    res,
    data,
    "PayPal payment captured successfully",
    httpStatus.OK,
  );
});

const paypalWebhookController = catchAsync(async (req, res) => {
  await checkoutService.paypalWebhook(req.body);

  return responseWrapper(
    res,
    true,
    "PayPal webhook received successfully",
    httpStatus.OK,
  );
});

module.exports = {
  getSquareConfig,
  createPayment,
  getSquarePaymentStatus,
  squareWebhook,
  getPaymentHistory,
  getAllPayments,

  createPayPalOrder,
  capturePayPalOrder,
  paypalWebhookController,
};
