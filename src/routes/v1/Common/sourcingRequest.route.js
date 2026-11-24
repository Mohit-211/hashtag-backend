const express = require("express");
const router = express.Router();
const { sourcingRequestController } = require("../../../controllers");
const { adminAuthMiddleware } = require("../../../middlewares");
const { verifyTurnstile } = require("../../../middlewares/turnstile");
const { requireAdmin } = adminAuthMiddleware;

// Rate-limited (publicFormLimiter) in upload.middleware, before any uploaded file is saved.
// Once the request has answered, upload.middleware deletes every file it didn't keep: all of
// them when it's refused, a refused Turnstile check included.
router.post("/create", verifyTurnstile, sourcingRequestController.createSourcingRequest);
router.put("/:id", requireAdmin, sourcingRequestController.updateSourcingRequest);
router.get("/admin", requireAdmin, sourcingRequestController.getAllSourcingRequests);

module.exports = router;
