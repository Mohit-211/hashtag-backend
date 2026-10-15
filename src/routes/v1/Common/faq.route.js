const express = require("express");
const router = express.Router();
const { faqController } = require("../../../controllers");
const { adminAuthMiddleware } = require("../../../middlewares");

const { requireAdmin } = adminAuthMiddleware;

router.post("/", requireAdmin, faqController.createFaq);
router.get("/", faqController.getAllFaq);
router.put("/:id", requireAdmin, faqController.updateFaq);
router.delete("/:id", requireAdmin, faqController.deleteFaq);

module.exports = router;
