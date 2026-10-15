const express = require("express");
const router = express.Router();
const { brandController } = require("../../../controllers");
const { adminAuthMiddleware } = require("../../../middlewares");

const { requireAdmin } = adminAuthMiddleware;

router.get("/website-brands", brandController.getPublishedBrands);
router.post("/", requireAdmin, brandController.createBrand);
router.get("/", brandController.getAllBrands);
router.get("/ss", brandController.getAllSSBrands);
// import from s&s
router.get("/sync/ss", requireAdmin, brandController.syncSSBrands);
router.get("/:id", brandController.getBrandById);
router.put("/:id", requireAdmin, brandController.updateBrand);
router.delete("/:id", requireAdmin, brandController.deleteBrand);
router.post("/publish", requireAdmin, brandController.publishBrands);
router.post("/manual-brand", requireAdmin, brandController.createManualBrand);

module.exports = router;
