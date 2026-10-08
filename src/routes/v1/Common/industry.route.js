const express = require("express");
const router = express.Router();
const { industryController } = require("../../../controllers");



router.get("/use-case", industryController.getAllUseCases); 
router.get("/use-case/products", industryController.getProductsForMultipleUseCases);

router.post("/", industryController.createIndustry);
router.get("/", industryController.getAllIndustries);
router.get("/:id", industryController.getIndustryById);
router.put("/:id", industryController.updateIndustry);
router.delete("/:id", industryController.deleteIndustry);


router.post("/use-case", industryController.createUseCase);
router.get("/use-case/all", industryController.getAllUseCasesDropdown);

router.get("/use-case/:id", industryController.getUseCaseById);
router.get(
  "/:industry_id/use-cases",
  industryController.getUseCasesByIndustry,
);
router.put("/use-case/:id", industryController.updateUseCase);
router.delete("/use-case/:id", industryController.deleteUseCase);

router.put(
  "/use-case/:id/parent-categories",
  industryController.updateUseCaseParentCategories
);

router.get(
  "/use-case/:id/parent-categories",
  industryController.getUseCaseParentCategories
);


router.get("/use-case/:id/products", industryController.getUseCaseProducts);
router.post("/use-case/:id/products/add", industryController.addProductsToUseCase);
router.post("/use-case/:id/products/exclude", industryController.excludeProductsFromUseCase);
router.delete("/use-case/:id/products/:productId/override", industryController.clearProductOverride);
router.post("/use-case/products/move", industryController.moveProductsBetweenUseCases);
router.get("/products/:productId/use-cases", industryController.getUseCasesForProduct);


module.exports = router;
