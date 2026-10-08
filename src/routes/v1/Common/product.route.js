const express = require('express');
const router = express.Router();

const { productController, pricingController } = require('../../../controllers');
const { userAuthMiddleware } = require('../../../middlewares');


router.post('/create-product' , productController.createProduct);
router.post('/add-product-variants' , productController.addProductVariants);
router.post('/duplicate/:id' , productController.duplicateProduct);
router.put('/manual/full' , productController.updateManualProductFull);
router.get('/' , productController.getAllProducts);
router.get("/grand-category-products",productController.getAllProductsByGrandCategory);
router.get('/product-by-brand' , productController.getProductsByBrand);
router.get("/get-brand-assignment", productController.getProductsForBrandMapping);
router.post("/brand-assignment", productController.assignBrandToProducts);
router.get('/:id', [userAuthMiddleware.verifyAuthJWTToken], productController.getProductById);
router.get('/variant/:id', productController.getVariantById);
router.get('/guest/:id', productController.getGuestProductById);
router.post('/get-variant' , productController.getProductVariant);
router.post('/update' , productController.updateProduct);
router.post('/delete' , productController.deleteProduct);



// s&s product management routes
router.get("/ss/styles/:brand", productController.getSSStylesByBrand);
router.get("/ss/style/:styleId", productController.getSSProductByStyle);
router.post("/sync/ss/:styleId", productController.syncSingleStyle);
router.delete("/ss/delete/:styleId", productController.deleteSSProductByStyle);



// admin apis
router.get("/admin/stats", productController.getAdminStats);
router.get("/get/variant", productController.getProductVariantByAdmin);
router.get("/admin/get/all", productController.getAllProductsAdmin);
router.get("/pricing/markup", pricingController.getAllPricingMarkup);
router.put("/pricing/:id", pricingController.updatePricingMarkup);
router.get('/admin/:id', productController.getProductByIdAdmin);

module.exports = router;