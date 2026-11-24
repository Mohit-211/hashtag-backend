const express = require("express");
const router = express.Router();
const { addonProductController } = require("../../../controllers/Common");
const { adminAuthMiddleware } = require("../../../middlewares");
const { listLimits } = require("../../../middlewares/listLimits");

const { requireAdmin, identifyAdmin } = adminAuthMiddleware;

router.post("/addon-product", requireAdmin, addonProductController.createAddOnProduct);
router.get("/addon-product", identifyAdmin, listLimits(), addonProductController.getAllAddOnProducts);
router.get("/addon-product/:id", addonProductController.getAddOnProductById);
router.put("/addon-product/:id", requireAdmin, addonProductController.updateAddOnProduct);
router.delete("/addon-product/:id", requireAdmin, addonProductController.deleteAddOnProduct);
router.get("/product/:productId/addons", addonProductController.getProductAddOns);
router.post("/product/:productId/addons", requireAdmin, addonProductController.assignProductAddOns);

module.exports = router;
