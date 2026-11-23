const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const responseWrapper = require("../../config/responseWrapper");
const approvalPublicService = require("../../services/Common/approvalPublic.service");

// The customer's approval page (approval/...). approvalGate has found the approval behind the
// link's key (req.approval). Answers are never cached: they change with every click.
const noStore = (res) => res.set("Cache-Control", "no-store");

// Kept on the customer's events: who acted, as far as the request tells.
const visitor = (req) => ({ ip: req.ip, userAgent: req.get("user-agent") || null });

const answer = (handler) =>
  catchAsync(async (req, res) => {
    noStore(res);
    const data = await handler(req);
    return responseWrapper(res, data, "", httpStatus.OK);
  });

const getView = answer((req) => approvalPublicService.getView(req.approval));

const approveLine = answer((req) =>
  approvalPublicService.approveLine(req.approval, visitor(req), req.params.lineId, req.body),
);

const approveAll = answer((req) => approvalPublicService.approveAll(req.approval, visitor(req), req.body));

const undo = answer((req) => approvalPublicService.undo(req.approval, visitor(req), req.body));

const addNote = answer((req) =>
  approvalPublicService.addNote(req.approval, visitor(req), req.params.lineId, req.body, req.files),
);

const removeNote = answer((req) => approvalPublicService.removeNote(req.approval, visitor(req), req.params.eventId));

const restoreNote = answer((req) => approvalPublicService.restoreNote(req.approval, visitor(req), req.params.eventId));

module.exports = {
  getView,
  approveLine,
  approveAll,
  undo,
  addNote,
  removeNote,
  restoreNote,
};
