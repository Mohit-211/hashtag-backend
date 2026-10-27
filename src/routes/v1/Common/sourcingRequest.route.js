const express = require("express");
const router = express.Router();
const { sourcingRequestController } = require("../../../controllers");
const { adminAuthMiddleware } = require("../../../middlewares");
const { verifyTurnstile } = require("../../../middlewares/turnstile");
const { requireAdmin } = adminAuthMiddleware;

// Rate-limited (publicFormLimiter) in upload.middleware, before any uploaded file is saved.
// A refused Turnstile check is a 400, so upload.middleware deletes the request's files.
router.post("/create", verifyTurnstile, sourcingRequestController.createSourcingRequest);
router.put("/:id", requireAdmin, sourcingRequestController.updateSourcingRequest);
router.get("/admin", requireAdmin, sourcingRequestController.getAllSourcingRequests);

module.exports = router;
