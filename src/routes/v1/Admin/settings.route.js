const express = require("express");
const router = express.Router();

const { settingsController } = require("../../../controllers");
const { adminAuthMiddleware } = require("../../../middlewares");
const { testEmailLimiter, settingsKeyLimiter } = require("../../../middlewares/rateLimiter");

// The Settings page. Any admin can read it (secrets masked); revealing and saving take the
// settings key from .env.
router.use(adminAuthMiddleware.requireAdmin);

router.get("/", settingsController.getSettings);
// The categories and suppliers the order handling fee can be limited to.
router.get("/handling-fee-options", settingsController.getHandlingFeeOptions);
router.post("/unlock", settingsKeyLimiter, settingsController.unlockSettings);
router.put("/", settingsKeyLimiter, settingsController.updateSettings);
// Body (optional): { key: a sender setting with test_email, to: an address other than the admin's }.
router.post("/test-email", testEmailLimiter, settingsController.sendTestEmail);

module.exports = router;
