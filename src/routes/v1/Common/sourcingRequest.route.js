const express = require("express");
const router = express.Router();
const { sourcingRequestController } = require("../../../controllers");

router.post("/create", sourcingRequestController.createSourcingRequest);
router.put("/:id", sourcingRequestController.updateSourcingRequest);
router.get("/admin", sourcingRequestController.getAllSourcingRequests);

module.exports = router;
