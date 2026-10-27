const express = require("express");
const router = express.Router();

const { settingsController } = require("../../../controllers");
const { adminAuthMiddleware } = require("../../../middlewares");
const { emailLimiter, settingsKeyLimiter } = require("../../../middlewares/rateLimiter");

// The Settings page. Any admin can read it (secrets masked); revealing and saving take the
// settings key from .env.
router.use(adminAuthMiddleware.requireAdmin);

router.get("/", settingsController.getSettings);
router.post("/unlock", settingsKeyLimiter, settingsController.unlockSettings);
router.put("/", settingsKeyLimiter, settingsController.updateSettings);
router.post("/test-email", emailLimiter, settingsController.sendTestEmail);

module.exports = router;
