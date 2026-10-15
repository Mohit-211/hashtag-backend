const express = require("express");
const router = express.Router();
const { customizationController } = require("../../../controllers/Common");
const { adminAuthMiddleware } = require("../../../middlewares");

const { requireAdmin } = adminAuthMiddleware;

router.post("/", requireAdmin, customizationController.createCustomizationOption);
router.get("/", customizationController.getAllCustomizationOptions);
router.get("/:id", customizationController.getCustomizationOptionById);
router.put("/:id", requireAdmin, customizationController.updateCustomizationOption);
router.delete("/:id", requireAdmin, customizationController.deleteCustomizationOption);

router.post("/:optionId/value", requireAdmin, customizationController.createCustomizationOptionValue);
router.put("/customization-option-value/:id", requireAdmin, customizationController.updateCustomizationOptionValue);
router.delete("/customization-option-value/:id", requireAdmin, customizationController.deleteCustomizationOptionValue);

router.get("/value/:valueId/pricing", customizationController.getPricing);
router.post("/value/:valueId/pricing", requireAdmin, customizationController.createPricing);
router.put("/value/pricing/:pricingId", requireAdmin, customizationController.updatePricing);
router.delete("/value/pricing/:pricingId", requireAdmin, customizationController.deletePricing);

// ============================================================
// PRODUCT CUSTOMIZATIONS
// ============================================================

router.get("/product/:productId/customizations", customizationController.getProductCustomizations);
router.post("/product/:productId/customizations", requireAdmin, customizationController.assignProductCustomizations);

module.exports = router;
