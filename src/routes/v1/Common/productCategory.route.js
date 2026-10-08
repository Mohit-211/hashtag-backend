const express = require('express');
const router = express.Router();

const {  productCategoryController, parentCategoryController, grandCategoryController } = require('../../../controllers');

router.get('/get-parent-categories', parentCategoryController.getAllParentCategories);
router.get("/get-grand-categories", grandCategoryController.getAllGrandCategories);

router.post("/add-category-to-parent", parentCategoryController.addCategoryToParent);
router.post("/add-parent-to-grand", grandCategoryController.addParentToGrand);

router.post("/remove-category-from-parent", parentCategoryController.removeCategoryFromParent);
router.post("/remove-parent-from-grand", grandCategoryController.removeParentFromGrand);

router.get("/unassigned",productCategoryController.getProductsWithoutParentCategory);

router.get("/for-categories", parentCategoryController.getParentCategoriesForCategories);
router.get("/for-parents", grandCategoryController.getGrandCategoriesForParents);

router.post('/', productCategoryController.createCategory);
router.get('/', productCategoryController.getAllCategories);
router.get('/:id', productCategoryController.findCategoryById);
router.put('/:id', productCategoryController.updateCategory);
router.post('/delete', productCategoryController.deleteCategory);


// import categories from ss activewear
router.get('/sync/ss', productCategoryController.syncSSCategories);



// parent category apis
router.post('/create-parent-category', parentCategoryController.createParentCategory);
router.get('/get-parent-category/:id', parentCategoryController.findParentCategoryById);
router.put('/update-parent-category/:id', parentCategoryController.updateParentCategory);
router.delete('/delete-parent-category', parentCategoryController.deleteParentCategory);
router.post('/map-parent-categories', parentCategoryController.mapCategoriesToParent);





// grand-categroy apis

router.post("/createGrandCategory", grandCategoryController.createGrandCategory);

router.get("/findGrandCategoryById/:id", grandCategoryController.findGrandCategoryById);
router.put("/updateGrandCategory/:id", grandCategoryController.updateGrandCategory);
router.delete("/deleteGrandCategory", grandCategoryController.deleteGrandCategory);
router.post("/map-grand-categories",grandCategoryController.mapParentsToGrand);




module.exports = router;