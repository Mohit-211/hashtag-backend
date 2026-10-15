const express = require("express");
const router = express.Router();
const { productCategoryController, parentCategoryController, grandCategoryController } = require("../../../controllers");
const { adminAuthMiddleware } = require("../../../middlewares");

const { requireAdmin } = adminAuthMiddleware;

router.get("/get-parent-categories", parentCategoryController.getAllParentCategories);
router.get("/get-grand-categories", grandCategoryController.getAllGrandCategories);
router.post("/add-category-to-parent", requireAdmin, parentCategoryController.addCategoryToParent);
router.post("/add-parent-to-grand", requireAdmin, grandCategoryController.addParentToGrand);
router.post("/remove-category-from-parent", requireAdmin, parentCategoryController.removeCategoryFromParent);
router.post("/remove-parent-from-grand", requireAdmin, grandCategoryController.removeParentFromGrand);
router.get("/unassigned", requireAdmin, productCategoryController.getProductsWithoutParentCategory);
router.get("/for-categories", parentCategoryController.getParentCategoriesForCategories);
router.get("/for-parents", grandCategoryController.getGrandCategoriesForParents);

router.post("/", requireAdmin, productCategoryController.createCategory);
router.get("/", productCategoryController.getAllCategories);
// import categories from ss activewear
router.get("/sync/ss", requireAdmin, productCategoryController.syncSSCategories);
router.get("/:id", productCategoryController.findCategoryById);
router.put("/:id", requireAdmin, productCategoryController.updateCategory);
router.post("/delete", requireAdmin, productCategoryController.deleteCategory);

// parent category apis
router.post("/create-parent-category", requireAdmin, parentCategoryController.createParentCategory);
router.get("/get-parent-category/:id", parentCategoryController.findParentCategoryById);
router.put("/update-parent-category/:id", requireAdmin, parentCategoryController.updateParentCategory);
router.delete("/delete-parent-category", requireAdmin, parentCategoryController.deleteParentCategory);
router.post("/map-parent-categories", requireAdmin, parentCategoryController.mapCategoriesToParent);

// grand-category apis
router.post("/createGrandCategory", requireAdmin, grandCategoryController.createGrandCategory);
router.get("/findGrandCategoryById/:id", grandCategoryController.findGrandCategoryById);
router.put("/updateGrandCategory/:id", requireAdmin, grandCategoryController.updateGrandCategory);
router.delete("/deleteGrandCategory", requireAdmin, grandCategoryController.deleteGrandCategory);
router.post("/map-grand-categories", requireAdmin, grandCategoryController.mapParentsToGrand);

module.exports = router;
