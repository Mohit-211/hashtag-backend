const express = require("express");
const router = express.Router();
const { contactUsController } = require("../../../controllers");
const { adminAuthMiddleware } = require("../../../middlewares");
const { publicFormLimiter } = require("../../../middlewares/rateLimiter");
const { verifyTurnstile } = require("../../../middlewares/turnstile");

const { requireAdmin } = adminAuthMiddleware;

router.post("/", publicFormLimiter, verifyTurnstile, contactUsController.createContactUs);
router.put("/:id", requireAdmin, contactUsController.updateContactUs);
router.get("/", requireAdmin, contactUsController.getAllContactUs);
router.delete("/:id", requireAdmin, contactUsController.deleteContactUs);

module.exports = router;
