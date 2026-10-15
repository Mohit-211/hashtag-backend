const express = require("express");
const { ottocapController, imageController } = require("../../../controllers/Common");
const { adminAuthMiddleware } = require("../../../middlewares");

const router = express.Router();
const { requireAdmin } = adminAuthMiddleware;

// Public: the storefront loads OttoCap images through this.
router.get("/otto-image", imageController.getOttoImage);

router.post("/import-inventory", requireAdmin, ottocapController.importOttoCapInventory);
router.post("/import-catalog", requireAdmin, ottocapController.importOttoCapCatalog);
router.get("/products", requireAdmin, ottocapController.getOttoProducts);
router.get("/products/:skuNo", requireAdmin, ottocapController.getOttoProductDetails);
router.post("/import-products", requireAdmin, ottocapController.importOttoProduct);
router.post("/import-selected-variants", requireAdmin, ottocapController.importSelectedOttoVariants);

module.exports = router;
