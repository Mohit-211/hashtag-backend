const express = require("express");
const router = express.Router();
const { sageController } = require("../../../controllers");
const { adminAuthMiddleware } = require("../../../middlewares");

const { requireAdmin } = adminAuthMiddleware;

// Supplier search, import and delete use the company's SAGE account: admins only.
router.use(requireAdmin);

router.get("/supplier-truth/:prodEId", sageController.getSageSupplierTruth);
router.post("/categories", sageController.getCategories);
router.post("/sync/category", sageController.syncSageCategories);
router.post("/suppliers-by-category", sageController.getSuppliersByCategory);
router.get("/get/categories", sageController.getAllSageCategories);
router.post("/supplier", sageController.getSuppliers);
router.post("/search", sageController.searchProducts);
router.get("/product/:prodEId", sageController.getProductDetails);
router.post("/import", sageController.importProduct);
router.post("/import/selected", sageController.importSelectedSageProducts);
router.post("/delete", sageController.deleteSageProducts);

module.exports = router;
