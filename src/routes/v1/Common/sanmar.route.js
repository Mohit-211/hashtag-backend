const express = require("express");
const router = express.Router();
const { sanmarController } = require("../../../controllers");
const { adminAuthMiddleware } = require("../../../middlewares");

const { requireAdmin } = adminAuthMiddleware;

// Supplier browsing and import use the company's SanMar account: admins only.
router.use(requireAdmin);

router.get("/sync/brand", sanmarController.syncSanmarBrands);
router.get("/brands", sanmarController.getSanmarBrands);
router.get("/styles", sanmarController.getSanmarStylesByBrand);
router.get("/products", sanmarController.getSanmarProductsByStyle);
router.post("/sync/save", sanmarController.syncSanmarProduct);

module.exports = router;
