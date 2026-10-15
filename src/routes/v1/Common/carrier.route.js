const express = require("express");
const router = express.Router();
const { CarrierController } = require("../../../controllers");
const { adminAuthMiddleware } = require("../../../middlewares");

const { requireAdmin } = adminAuthMiddleware;

router.post("/sync", requireAdmin, CarrierController.syncCarriers);
router.post("/sync/services", requireAdmin, CarrierController.syncServices);
router.get("/", CarrierController.getCarriers);
router.get("/:carrier_id", CarrierController.getServicesByCarrier);

module.exports = router;
