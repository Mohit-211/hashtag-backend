const express = require("express");
const router = express.Router();
const { sizeController } = require("../../../controllers");
const { adminAuthMiddleware } = require("../../../middlewares");
const { listLimits } = require("../../../middlewares/listLimits");

const { requireAdmin, identifyAdmin } = adminAuthMiddleware;

router.post("/create", requireAdmin, sizeController.createSize);
router.get("/", identifyAdmin, listLimits({ search: false }), sizeController.getAllSizes);
router.get("/:id", sizeController.getSizeById);
router.put("/:id", requireAdmin, sizeController.updateSize);
router.delete("/:id", requireAdmin, sizeController.deleteSize);

module.exports = router;
