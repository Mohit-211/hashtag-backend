const express = require("express");
const router = express.Router();

const { dashboardController } = require("../../../controllers");
const { adminAuthMiddleware } = require("../../../middlewares");

// The admin panel's Dashboard page. Every route takes `range` (a preset) or `from` and `to`
// (YYYY-MM-DD, on the store's clock) except activity. docs/admin-panel-changes.md#2026-11-19-dashboard
router.use(adminAuthMiddleware.requireAdmin);

router.get("/overview", dashboardController.getOverview);
router.get("/trend", dashboardController.getTrend);
router.get("/top", dashboardController.getTop);
router.get("/customers", dashboardController.getCustomers);
router.get("/activity", dashboardController.getActivity);

module.exports = router;
