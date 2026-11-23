const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const responseWrapper = require("../../config/responseWrapper");
const orderApprovalService = require("../../services/Common/orderApproval.service");

// The admin panel's Artwork approval page for an order (order/admin/:id/approval/...). Every answer
// is the whole page; it carries the customer's link, so it's never cached. Messages use the
// panel's words: "artwork preview", never "proof" or "draft".
const noStore = (res) => res.set("Cache-Control", "no-store");

const answer = (handler, message = "") =>
  catchAsync(async (req, res) => {
    noStore(res);
    const data = await handler(req);
    return responseWrapper(res, data, typeof message === "function" ? message(data) : message, httpStatus.OK);
  });

const getApproval = answer((req) => orderApprovalService.getApproval(req.params.id));

const startApproval = answer(
  (req) => orderApprovalService.startApproval(req.params.id, req.admin),
  "Artwork approval started",
);

const addProof = answer(
  (req) => orderApprovalService.addProof(req.params.id, req.params.lineId, req.admin, req.files),
  "Artwork preview added",
);

const removeProof = answer(
  (req) => orderApprovalService.removeProof(req.params.id, req.params.fileId, req.admin),
  "Artwork preview removed",
);

const copyVersion = answer((req) =>
  orderApprovalService.copyVersion(req.params.id, req.params.lineId, req.admin, req.body),
);

const setNoProof = answer((req) =>
  orderApprovalService.setNoProof(req.params.id, req.params.lineId, req.admin, req.body),
);

// The email's outcome is in data.email; the versions were sent either way.
const sendApproval = answer(
  (req) => orderApprovalService.sendApproval(req.params.id, req.admin, req.body),
  (data) => (data.email.sent ? `Sent to ${data.email.to}` : `Saved, but the email to ${data.email.to} wasn't sent`),
);

const setHold = answer((req) => orderApprovalService.setHold(req.params.id, req.admin, req.body));

const lockApproval = answer((req) => orderApprovalService.lockApproval(req.params.id, req.admin), "Locked for production");

const unlockApproval = answer((req) => orderApprovalService.unlockApproval(req.params.id, req.admin), "Unlocked");

const changeLink = answer((req) => orderApprovalService.changeLink(req.params.id, req.admin, req.body));

const markSeen = answer((req) => orderApprovalService.markSeen(req.params.id, req.admin));

module.exports = {
  getApproval,
  startApproval,
  addProof,
  removeProof,
  copyVersion,
  setNoProof,
  sendApproval,
  setHold,
  lockApproval,
  unlockApproval,
  changeLink,
  markSeen,
};
