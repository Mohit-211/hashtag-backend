/** @format */
const express = require("express");
const router = express.Router();
const { tierController } = require("../../../controllers/Common");
const { adminAuthMiddleware } = require("../../../middlewares");

const { requireAdmin } = adminAuthMiddleware;

router.post("/", requireAdmin, tierController.createTier);
router.get("/", tierController.getAllTiers);
router.get("/:id/parent-categories", tierController.getTierParentCategories);
router.put("/:id/parent-categories", requireAdmin, tierController.updateTierParentCategories);
router.get("/:id/products", tierController.getTierProducts);
router.post("/:id/products/add", requireAdmin, tierController.addProductsToTier);
// IMPORTANT: this must stay ABOVE /products/:productId or Express will
// try to match "current" as a productId.
router.get("/products/current", tierController.getCurrentTiersForProducts);
router.post("/products/bulk-remove", requireAdmin, tierController.bulkClearProductTierOverrides);
router.patch("/products/:productId", requireAdmin, tierController.setProductTier);
router.delete("/products/:productId/exclude", requireAdmin, tierController.excludeProductFromAllTiers);
router.delete("/products/:productId/override", requireAdmin, tierController.clearProductTierOverride);

module.exports = router;
