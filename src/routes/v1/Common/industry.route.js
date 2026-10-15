const express = require("express");
const router = express.Router();
const { industryController } = require("../../../controllers");
const { adminAuthMiddleware } = require("../../../middlewares");

const { requireAdmin } = adminAuthMiddleware;

router.get("/use-case", industryController.getAllUseCases);
router.get("/use-case/products", industryController.getProductsForMultipleUseCases);
router.post("/", requireAdmin, industryController.createIndustry);
router.get("/", industryController.getAllIndustries);
router.get("/:id", industryController.getIndustryById);
router.put("/:id", requireAdmin, industryController.updateIndustry);
router.delete("/:id", requireAdmin, industryController.deleteIndustry);

router.post("/use-case", requireAdmin, industryController.createUseCase);
router.get("/use-case/all", industryController.getAllUseCasesDropdown);
router.get("/use-case/:id", industryController.getUseCaseById);
router.get("/:industry_id/use-cases", industryController.getUseCasesByIndustry);
router.put("/use-case/:id", requireAdmin, industryController.updateUseCase);
router.delete("/use-case/:id", requireAdmin, industryController.deleteUseCase);
router.put("/use-case/:id/parent-categories", requireAdmin, industryController.updateUseCaseParentCategories);
router.get("/use-case/:id/parent-categories", industryController.getUseCaseParentCategories);
router.get("/use-case/:id/products", industryController.getUseCaseProducts);
router.post("/use-case/:id/products/add", requireAdmin, industryController.addProductsToUseCase);
router.post("/use-case/:id/products/exclude", requireAdmin, industryController.excludeProductsFromUseCase);
router.delete("/use-case/:id/products/:productId/override", requireAdmin, industryController.clearProductOverride);
router.post("/use-case/products/move", requireAdmin, industryController.moveProductsBetweenUseCases);
router.get("/products/:productId/use-cases", industryController.getUseCasesForProduct);

module.exports = router;
