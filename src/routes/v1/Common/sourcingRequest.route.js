const express = require("express");
const router = express.Router();
const { sourcingRequestController } = require("../../../controllers");
const { adminAuthMiddleware } = require("../../../middlewares");
const { publicFormLimiter } = require("../../../middlewares/rateLimiter");

const { requireAdmin } = adminAuthMiddleware;

router.post("/create", publicFormLimiter, sourcingRequestController.createSourcingRequest);
router.put("/:id", requireAdmin, sourcingRequestController.updateSourcingRequest);
router.get("/admin", requireAdmin, sourcingRequestController.getAllSourcingRequests);

module.exports = router;
