const express = require("express");
const router = express.Router();
const { roleController } = require("../../../controllers");
const { adminAuthMiddleware } = require("../../../middlewares");

const { requireAdmin } = adminAuthMiddleware;
const { requireSuperAdmin } = adminAuthMiddleware;

router.use(requireAdmin);

router.post("/", requireSuperAdmin, roleController.createRole);
router.get("/:id", roleController.findRoleById);
router.get("/", roleController.getAllRoles);
router.put("/:id", requireSuperAdmin, roleController.updateRole);
router.delete("/:id", requireSuperAdmin, roleController.deleteRole);

module.exports = router;
