const express = require("express");
const router = express.Router();
const { departmentController } = require("../../../controllers");
const { adminAuthMiddleware } = require("../../../middlewares");

const { requireAdmin } = adminAuthMiddleware;
const { requireSuperAdmin } = adminAuthMiddleware;

router.use(requireAdmin);

router.post("/", requireSuperAdmin, departmentController.createDepartment);
router.get("/", departmentController.getAllDeparments);
router.get("/:id", departmentController.findDepartmentById);
router.put("/:id", requireSuperAdmin, departmentController.updateDepartment);
router.delete("/:id", requireSuperAdmin, departmentController.deleteDepartment);

module.exports = router;
