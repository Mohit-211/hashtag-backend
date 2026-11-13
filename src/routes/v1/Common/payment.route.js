const express = require('express');
const router = express.Router();

const { paymentController, checkoutController } = require('../../../controllers');
const { userAuthMiddleware, adminAuthMiddleware } = require('../../../middlewares');
const { webhookLimiter } = require('../../../middlewares/rateLimiter');

router.use(userAuthMiddleware.setRoleIdIfNotPresent);

// Today's payments: for admins only (nothing in the shop or panel calls these today).
router.get('/count', adminAuthMiddleware.requireAdmin, paymentController.getNewPaymentCount);
router.get('/sum', adminAuthMiddleware.requireAdmin, paymentController.getNewPaymentTotal);


// Square payment routes
router.get('/square/config', [userAuthMiddleware.verifyAuthJWTToken], checkoutController.getSquareConfig);
router.post('/square/create-payment', [userAuthMiddleware.verifyAuthJWTToken], checkoutController.createPayment);
router.post('/square/payment-status', [userAuthMiddleware.verifyAuthJWTToken], checkoutController.getSquarePaymentStatus);
// Square and PayPal call these. Neither trusts the event: each reads the payment back from the
// provider (checkout.service.js).
router.post('/webhook/square', webhookLimiter, checkoutController.squareWebhook);
router.get('/history', [userAuthMiddleware.verifyAuthJWTToken], checkoutController.getPaymentHistory);
// Every customer's payments: the admin panel's Payments page.
router.get('/admin/all', adminAuthMiddleware.requireAdmin, checkoutController.getAllPayments);


// paypal payment routes
router.post("/paypal/create-order",[userAuthMiddleware.verifyAuthJWTToken],checkoutController.createPayPalOrder);
router.post("/paypal/capture-order",[userAuthMiddleware.verifyAuthJWTToken],checkoutController.capturePayPalOrder);
router.post("/paypal/webhook", webhookLimiter, checkoutController.paypalWebhookController);


module.exports = router;