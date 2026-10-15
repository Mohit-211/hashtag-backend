const express = require("express");
const router = express.Router();
const { contactUsController } = require("../../../controllers");
const { adminAuthMiddleware } = require("../../../middlewares");
const { publicFormLimiter } = require("../../../middlewares/rateLimiter");

const { requireAdmin } = adminAuthMiddleware;

router.post("/", publicFormLimiter, contactUsController.createContactUs);
router.put("/:id", requireAdmin, contactUsController.updateContactUs);
router.get("/", requireAdmin, contactUsController.getAllContactUs);
router.delete("/:id", requireAdmin, contactUsController.deleteContactUs);

module.exports = router;
