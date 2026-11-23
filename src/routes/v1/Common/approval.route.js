const express = require("express");
const router = express.Router();
const { approvalController } = require("../../../controllers");
const { approvalGate, approvalUploadGate } = require("../../../middlewares/approvalGate.middleware");

// The customer's approval page (a separate static site, no sign-in). Every request carries the
// link's key in the X-Approval-Token header; the gate counts it per IP and finds the approval. A
// note's pictures (field approval_picture) are checked and saved in upload.middleware first.
router.get("/", approvalGate, approvalController.getView);
router.post("/lines/:lineId/approve", approvalGate, approvalController.approveLine);
router.post("/approve-all", approvalGate, approvalController.approveAll);
router.post("/undo", approvalGate, approvalController.undo);
router.post("/lines/:lineId/notes", approvalUploadGate, approvalController.addNote);
router.post("/notes/:eventId/remove", approvalGate, approvalController.removeNote);
router.post("/notes/:eventId/restore", approvalGate, approvalController.restoreNote);

module.exports = router;
