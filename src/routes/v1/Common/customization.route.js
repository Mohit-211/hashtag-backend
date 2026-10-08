const express = require("express");
const router = express.Router();
const { customizationController } = require("../../../controllers/Common");

router.post("/", customizationController.createCustomizationOption);

router.get("/", customizationController.getAllCustomizationOptions);

router.get("/:id", customizationController.getCustomizationOptionById);

router.put("/:id", customizationController.updateCustomizationOption);

router.delete("/:id", customizationController.deleteCustomizationOption);

router.post(
  "/:optionId/value",
  customizationController.createCustomizationOptionValue,
);

router.put(
  "/customization-option-value/:id",
  customizationController.updateCustomizationOptionValue,
);

router.delete(
  "/customization-option-value/:id",
  customizationController.deleteCustomizationOptionValue,
);

router.get("/value/:valueId/pricing", customizationController.getPricing);

router.post("/value/:valueId/pricing", customizationController.createPricing);

router.put("/value/pricing/:pricingId", customizationController.updatePricing);

router.delete(
  "/value/pricing/:pricingId",
  customizationController.deletePricing,
);

// ============================================================
// PRODUCT CUSTOMIZATIONS
// ============================================================

router.get(
  "/product/:productId/customizations",
  customizationController.getProductCustomizations,
);

router.post(
  "/product/:productId/customizations",
  customizationController.assignProductCustomizations,
);

module.exports = router;
