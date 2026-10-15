const express = require("express");
const router = express.Router();
const { sizeController } = require("../../../controllers");
const { adminAuthMiddleware } = require("../../../middlewares");

const { requireAdmin } = adminAuthMiddleware;

router.post("/create", requireAdmin, sizeController.createSize);
router.get("/", sizeController.getAllSizes);
router.get("/:id", sizeController.getSizeById);
router.put("/:id", requireAdmin, sizeController.updateSize);
router.delete("/:id", requireAdmin, sizeController.deleteSize);

module.exports = router;
