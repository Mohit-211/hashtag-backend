const express = require("express");
const router = express.Router();
const { productController, pricingController } = require("../../../controllers");
const { adminAuthMiddleware } = require("../../../middlewares");
const { userAuthMiddleware } = require("../../../middlewares");

const { requireAdmin } = adminAuthMiddleware;

// admin: product management
router.post("/create-product", requireAdmin, productController.createProduct);
router.post("/add-product-variants", requireAdmin, productController.addProductVariants);
router.post("/duplicate/:id", requireAdmin, productController.duplicateProduct);
router.put("/manual/full", requireAdmin, productController.updateManualProductFull);
router.get("/get-brand-assignment", requireAdmin, productController.getProductsForBrandMapping);
router.post("/brand-assignment", requireAdmin, productController.assignBrandToProducts);
router.post("/update", requireAdmin, productController.updateProduct);
router.post("/delete", requireAdmin, productController.deleteProduct);

// storefront
router.get("/", productController.getAllProducts);
router.get("/grand-category-products", productController.getAllProductsByGrandCategory);
router.get("/product-by-brand", productController.getProductsByBrand);
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
router.get("/admin/get/all", requireAdmin, productController.getAllProductsAdmin);
router.get("/pricing/markup", requireAdmin, pricingController.getAllPricingMarkup);
router.put("/pricing/:id", requireAdmin, pricingController.updatePricingMarkup);
router.get("/admin/:id", requireAdmin, productController.getProductByIdAdmin);

module.exports = router;
