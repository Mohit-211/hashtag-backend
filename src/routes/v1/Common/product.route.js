const express = require("express");
const router = express.Router();
const { productController, pricingController, productImportController } = require("../../../controllers");
const { adminAuthMiddleware } = require("../../../middlewares");
const { userAuthMiddleware } = require("../../../middlewares");
const { listLimits } = require("../../../middlewares/listLimits");

const { requireAdmin, identifyAdmin } = adminAuthMiddleware;

// admin: product management
router.post("/create-product", requireAdmin, productController.createProduct);
// Several products from one CSV file (upload field "file", see upload.middleware.js).
router.get("/import/format", requireAdmin, productImportController.getImportFormat);
router.post("/import/preview", requireAdmin, productImportController.previewImport);
router.post("/import", requireAdmin, productImportController.importProducts);
router.post("/add-product-variants", requireAdmin, productController.addProductVariants);
router.post("/duplicate/:id", requireAdmin, productController.duplicateProduct);
router.put("/manual/full", requireAdmin, productController.updateManualProductFull);
router.get("/get-brand-assignment", requireAdmin, productController.getProductsForBrandMapping);
router.post("/brand-assignment", requireAdmin, productController.assignBrandToProducts);
router.post("/update", requireAdmin, productController.updateProduct);
router.post("/delete", requireAdmin, productController.deleteProduct);

// storefront
router.get("/", identifyAdmin, listLimits(), productController.getAllProducts);
router.get("/grand-category-products", identifyAdmin, listLimits(), productController.getAllProductsByGrandCategory);
router.get("/product-by-brand", identifyAdmin, listLimits(), productController.getProductsByBrand);
router.get("/:id", [userAuthMiddleware.verifyAuthJWTToken], productController.getProductById);
router.get("/variant/:id", productController.getVariantById);
router.get("/guest/:id", productController.getGuestProductById);
router.post("/get-variant", productController.getProductVariant);

// s&s product management routes
router.get("/ss/styles/:brand", requireAdmin, productController.getSSStylesByBrand);
router.get("/ss/style/:styleId", requireAdmin, productController.getSSProductByStyle);
router.post("/sync/ss/:styleId", requireAdmin, productController.syncSingleStyle);
router.delete("/ss/delete/:styleId", requireAdmin, productController.deleteSSProductByStyle);

// admin apis
router.get("/admin/stats", requireAdmin, productController.getAdminStats);
router.get("/get/variant", requireAdmin, productController.getProductVariantByAdmin);
router.get("/admin/variant/:id", requireAdmin, productController.getProductVariantByIdAdmin);
router.put("/admin/weight", requireAdmin, productController.setAdminWeight);
router.get("/admin/get/all", requireAdmin, productController.getAllProductsAdmin);
router.get("/pricing/markup", requireAdmin, pricingController.getAllPricingMarkup);
router.put("/pricing/:id", requireAdmin, pricingController.updatePricingMarkup);
router.get("/admin/:id", requireAdmin, productController.getProductByIdAdmin);

module.exports = router;
