const express = require("express");
const router = express.Router();
const { brandController } = require("../../../controllers");
const { adminAuthMiddleware } = require("../../../middlewares");
const { listLimits } = require("../../../middlewares/listLimits");

const { requireAdmin, identifyAdmin } = adminAuthMiddleware;

// The website's categories page loads every published brand at once (limit=1000) for its brand
// filter, so shoppers keep up to 1,000 here.
router.get("/website-brands", identifyAdmin, listLimits({ max: 1000 }), brandController.getPublishedBrands);
router.post("/", requireAdmin, brandController.createBrand);
router.get("/", identifyAdmin, listLimits(), brandController.getAllBrands);
router.get("/ss", identifyAdmin, listLimits(), brandController.getAllSSBrands);
// import from s&s
router.get("/sync/ss", requireAdmin, brandController.syncSSBrands);
router.get("/:id", brandController.getBrandById);
router.put("/:id", requireAdmin, brandController.updateBrand);
router.delete("/:id", requireAdmin, brandController.deleteBrand);
router.post("/publish", requireAdmin, brandController.publishBrands);
router.post("/manual-brand", requireAdmin, brandController.createManualBrand);

module.exports = router;
