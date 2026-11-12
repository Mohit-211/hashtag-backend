const express = require("express");
const router = express.Router();
const { pricingTemplateController } = require("../../../controllers");
const { adminAuthMiddleware } = require("../../../middlewares");

const { requireAdmin } = adminAuthMiddleware;

// Pricing templates (panel F29), shared by every admin.
router.get("/", requireAdmin, pricingTemplateController.getPricingTemplates);
router.post("/", requireAdmin, pricingTemplateController.createPricingTemplate);
router.put("/:id", requireAdmin, pricingTemplateController.updatePricingTemplate);
router.delete("/:id", requireAdmin, pricingTemplateController.deletePricingTemplate);

module.exports = router;
