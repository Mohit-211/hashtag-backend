/** @format */

const express = require("express");
const { tierController } = require("../../../controllers/Common");

const router = express.Router();

router.post("/", tierController.createTier);
router.get("/", tierController.getAllTiers);

router.get("/:id/parent-categories", tierController.getTierParentCategories);
router.put("/:id/parent-categories", tierController.updateTierParentCategories);

router.get("/:id/products", tierController.getTierProducts);
router.post("/:id/products/add", tierController.addProductsToTier);

// IMPORTANT: this must stay ABOVE /products/:productId or Express will
// try to match "current" as a productId.
router.get("/products/current", tierController.getCurrentTiersForProducts);
router.post("/products/bulk-remove", tierController.bulkClearProductTierOverrides);

router.patch("/products/:productId", tierController.setProductTier);
router.delete("/products/:productId/exclude", tierController.excludeProductFromAllTiers);
router.delete("/products/:productId/override", tierController.clearProductTierOverride);



module.exports = router;