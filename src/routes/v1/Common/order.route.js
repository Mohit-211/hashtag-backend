const express = require('express');
const router = express.Router();

const {orderController } = require('../../../controllers');
const {userAuthMiddleware, adminAuthMiddleware} = require('../../../middlewares');


router.get("/admin", adminAuthMiddleware.requireAdmin, orderController.getAdminOrders);

router.post('/', [userAuthMiddleware.verifyAuthJWTToken], orderController.createOrder);
router.get('/', [userAuthMiddleware.verifyAuthJWTToken],orderController.getOrders);
router.get('/:id', [userAuthMiddleware.verifyAuthJWTToken], orderController.getOrderById);
router.patch('/:id', [userAuthMiddleware.verifyAuthJWTToken], orderController.cancelOrder);
router.post("/shipping/rates", [userAuthMiddleware.verifyAuthJWTToken], orderController.getShippingRatesController);
router.post("/create-shipment-label", [userAuthMiddleware.verifyAuthJWTToken], orderController.createShipmentLabel);


// routes/webhook.routes.js
router.post("/shipstation", orderController.shipstationWebhook);


module.exports = router;