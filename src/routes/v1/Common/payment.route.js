const express = require('express');
const router = express.Router();

const { paymentController, checkoutController } = require('../../../controllers');
const { userAuthMiddleware } = require('../../../middlewares');

router.use(userAuthMiddleware.setRoleIdIfNotPresent);

router.get('/count', paymentController.getNewPaymentCount);
router.get('/sum', paymentController.getNewPaymentTotal);


// Square payment routes
router.get('/square/config', [userAuthMiddleware.verifyAuthJWTToken], checkoutController.getSquareConfig);
router.post('/square/create-payment', [userAuthMiddleware.verifyAuthJWTToken], checkoutController.createPayment);
router.post('/square/payment-status', [userAuthMiddleware.verifyAuthJWTToken], checkoutController.getSquarePaymentStatus);
router.post('/webhook/square', checkoutController.squareWebhook);
router.get('/history', [userAuthMiddleware.verifyAuthJWTToken], checkoutController.getPaymentHistory);
router.get('/admin/all', checkoutController.getAllPayments);


// paypal payment routes
router.post("/paypal/create-order",[userAuthMiddleware.verifyAuthJWTToken],checkoutController.createPayPalOrder);
router.post("/paypal/capture-order",[userAuthMiddleware.verifyAuthJWTToken],checkoutController.capturePayPalOrder);
router.post("/paypal/webhook",checkoutController.paypalWebhookController);


module.exports = router;