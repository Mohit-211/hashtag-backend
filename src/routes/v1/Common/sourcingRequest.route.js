const express = require("express");
const router = express.Router();
const { sourcingRequestController } = require("../../../controllers");
const { adminAuthMiddleware } = require("../../../middlewares");
const { requireAdmin } = adminAuthMiddleware;

// Rate-limited (publicFormLimiter) in upload.middleware, before any uploaded file is saved.
router.post("/create", sourcingRequestController.createSourcingRequest);
router.put("/:id", requireAdmin, sourcingRequestController.updateSourcingRequest);
router.get("/admin", requireAdmin, sourcingRequestController.getAllSourcingRequests);

module.exports = router;
