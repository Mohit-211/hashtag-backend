const { approvalLimiter, approvalUploadLimiter } = require("./rateLimiter");
const { findByToken } = require("../services/Common/approvalStore");

// The customer's approval page has no sign-in: every request carries the link's key in the
// X-Approval-Token header, never in the address, which ends up in the logs. Each request is
// counted per IP, then the key must open an approval (any bad link is the same 404), and
// req.approval is set for the route. A rejection's pictures are saved only after this passed:
// upload.middleware.js runs the gate before the upload, and the route doesn't run it twice.
const approvalGate = (req, res, next) => {
  if (req.approval) return next();

  return approvalLimiter(req, res, (error) => {
    if (error) return next(error);
    return findByToken(req.get("X-Approval-Token")).then((approval) => {
      req.approval = approval;
      next();
    }, next);
  });
};

// Rejections, which can carry pictures: also counted per hour, before anything is saved.
const approvalUploadGate = (req, res, next) => {
  if (req.approval) return next();
  return approvalUploadLimiter(req, res, (error) => (error ? next(error) : approvalGate(req, res, next)));
};

module.exports = { approvalGate, approvalUploadGate };
