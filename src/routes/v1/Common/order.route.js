const express = require('express');
const router = express.Router();

const {orderController, orderApprovalController } = require('../../../controllers');
const {userAuthMiddleware, adminAuthMiddleware} = require('../../../middlewares');
const { verifyShipstationWebhook } = require('../../../middlewares/shipstationWebhook.middleware');
const { approvalSendLimiter } = require('../../../middlewares/rateLimiter');


router.get("/admin", adminAuthMiddleware.requireAdmin, orderController.getAdminOrders);
router.post("/admin/:id/label", adminAuthMiddleware.requireAdmin, orderController.retryOrderShipment);
router.post("/admin/:id/cancel", adminAuthMiddleware.requireAdmin, orderController.adminCancelOrder);
router.delete("/admin/:id", adminAuthMiddleware.requireAdmin, orderController.adminDeleteOrder);

// The order's proof approval (the admin panel's Approval page). A proof upload (field
// approval_proof) is checked and saved in upload.middleware first.
router.get("/admin/:id/approval", adminAuthMiddleware.requireAdmin, orderApprovalController.getApproval);
router.post("/admin/:id/approval", adminAuthMiddleware.requireAdmin, orderApprovalController.startApproval);
router.post("/admin/:id/approval/lines/:lineId/proofs", adminAuthMiddleware.requireAdmin, orderApprovalController.addProof);
router.delete("/admin/:id/approval/files/:fileId", adminAuthMiddleware.requireAdmin, orderApprovalController.removeProof);
router.post("/admin/:id/approval/lines/:lineId/copy", adminAuthMiddleware.requireAdmin, orderApprovalController.copyVersion);
router.post("/admin/:id/approval/lines/:lineId/no-proof", adminAuthMiddleware.requireAdmin, orderApprovalController.setNoProof);
router.post("/admin/:id/approval/send", adminAuthMiddleware.requireAdmin, approvalSendLimiter, orderApprovalController.sendApproval);
router.post("/admin/:id/approval/hold", adminAuthMiddleware.requireAdmin, orderApprovalController.setHold);
router.post("/admin/:id/approval/lock", adminAuthMiddleware.requireAdmin, orderApprovalController.lockApproval);
router.post("/admin/:id/approval/unlock", adminAuthMiddleware.requireAdmin, orderApprovalController.unlockApproval);
router.post("/admin/:id/approval/link", adminAuthMiddleware.requireAdmin, orderApprovalController.changeLink);
router.post("/admin/:id/approval/seen", adminAuthMiddleware.requireAdmin, orderApprovalController.markSeen);

router.post('/', [userAuthMiddleware.verifyAuthJWTToken], orderController.createOrder);
router.get('/', [userAuthMiddleware.verifyAuthJWTToken],orderController.getOrders);
router.get('/:id', [userAuthMiddleware.verifyAuthJWTToken], orderController.getOrderById);
router.patch('/:id', [userAuthMiddleware.verifyAuthJWTToken], orderController.cancelOrder);
router.post("/shipping/rates", [userAuthMiddleware.verifyAuthJWTToken], orderController.getShippingRatesController);
router.post("/create-shipment-label", [userAuthMiddleware.verifyAuthJWTToken], orderController.createShipmentLabel);


// routes/webhook.routes.js
router.post("/shipstation", verifyShipstationWebhook, orderController.shipstationWebhook);


module.exports = router;