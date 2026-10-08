const express = require("express");
const router = express.Router();

const { addonProductController } = require("../../../controllers/Common");


router.post("/addon-product", addonProductController.createAddOnProduct);
router.get("/addon-product", addonProductController.getAllAddOnProducts);
router.get("/addon-product/:id", addonProductController.getAddOnProductById);
router.put("/addon-product/:id",addonProductController.updateAddOnProduct);
router.delete("/addon-product/:id", addonProductController.deleteAddOnProduct);
router.get("/product/:productId/addons",addonProductController.getProductAddOns);
router.post("/product/:productId/addons",addonProductController.assignProductAddOns);

module.exports = router;
