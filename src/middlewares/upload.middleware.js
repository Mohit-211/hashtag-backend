const fs = require("fs");
const multer = require("multer");
const httpStatus = require("http-status");

const {
  upload,
  cartUpload,
  graphicUpload,
  csvUpload,
  approvalProofUpload,
  approvalPictureUpload,
  limits,
  graphicLimits,
  csvLimits,
  approvalPictureLimits,
  GRAPHIC_FIELDS,
  CSV_FIELD,
  APPROVAL_PROOF_FIELD,
  APPROVAL_PICTURE_FIELD,
  PROOF_TYPE_MESSAGE,
} = require("../config/multer");
const { requireAdmin } = require("./adminAuth.middleware");
const { verifyAuthJWTToken } = require("./userAuth.middleware");
const { approvalUploadGate } = require("./approvalGate.middleware");
const { emailLimiter, publicFormLimiter } = require("./rateLimiter");
const ApiError = require("../utils/ApiError");
const { checkGraphicContents, checkPictureContents } = require("../utils/graphicFileType");

// Routes that accept file uploads (paths relative to /api/v1). Admin and customer
// routes are authenticated before any file is written to disk. The two public routes
// are rate-limited here, before the upload (not in their route files), and files from
// a request that's refused are deleted. So are those of the order approval routes
// (discardRefused); the customer's approval page has no sign-in, so its gate checks the
// link's key and counts the request first.
const FILE_ROUTES = [
  { method: "POST", path: /^\/user\/auth\/register\/?$/, limit: emailLimiter },
  { method: "POST", path: /^\/sourcing-requests\/create\/?$/, limit: publicFormLimiter },
  { method: "POST", path: /^\/product\/cart\/?$/, auth: verifyAuthJWTToken, upload: cartUpload },
  { method: "POST", path: /^\/graphics\/?$/, auth: verifyAuthJWTToken, upload: graphicUpload },

  { method: "POST", path: /^\/product\/create-product\/?$/, auth: requireAdmin },
  { method: "POST", path: /^\/product\/import(\/preview)?\/?$/, auth: requireAdmin, upload: csvUpload },
  { method: "POST", path: /^\/pricing-template\/import(\/preview)?\/?$/, auth: requireAdmin, upload: csvUpload },
  { method: "POST", path: /^\/product\/add-product-variants\/?$/, auth: requireAdmin },
  { method: "PUT", path: /^\/product\/manual\/full\/?$/, auth: requireAdmin },
  { method: "POST", path: /^\/product\/update\/?$/, auth: requireAdmin },
  { method: "POST", path: /^\/brand\/?$/, auth: requireAdmin },
  { method: "POST", path: /^\/brand\/publish\/?$/, auth: requireAdmin },
  { method: "POST", path: /^\/brand\/manual-brand\/?$/, auth: requireAdmin },
  { method: "POST", path: /^\/industry\/?$/, auth: requireAdmin },
  { method: "PUT", path: /^\/industry\/[^/]+\/?$/, auth: requireAdmin },
  { method: "POST", path: /^\/industry\/use-case\/?$/, auth: requireAdmin },
  { method: "PUT", path: /^\/industry\/use-case\/[^/]+\/?$/, auth: requireAdmin },
  { method: "POST", path: /^\/add-on\/addon-product\/?$/, auth: requireAdmin },
  { method: "PUT", path: /^\/add-on\/addon-product\/[^/]+\/?$/, auth: requireAdmin },
  { method: "POST", path: /^\/gallery\/?$/, auth: requireAdmin },
  { method: "PUT", path: /^\/gallery\/[^/]+\/?$/, auth: requireAdmin },

  // Order approval: the team's proofs, and the pictures with a customer's rejection (tooMany: the
  // customer's words when they send more than the route takes).
  { method: "POST", path: /^\/order\/admin\/[^/]+\/approval\/lines\/[^/]+\/proofs\/?$/, auth: requireAdmin, upload: approvalProofUpload, discardRefused: true },
  { method: "POST", path: /^\/approval\/lines\/[^/]+\/reject\/?$/, auth: approvalUploadGate, upload: approvalPictureUpload, discardRefused: true, tooMany: "You can add up to 5 pictures." },
];

// Everywhere else multipart forms are still parsed, but files are refused.
const textFieldsOnly = multer({ limits }).none();

// Deletes the files multer saved for this request.
const removeUploadedFiles = (req) => {
  for (const file of Object.values(req.files || {}).flat()) {
    fs.promises.unlink(file.path).catch(() => {});
  }
};

// A refused request (400-499) has no use for its files.
const discardWhenRefused = (req, res) => {
  res.on("finish", () => {
    if (res.statusCode >= 400 && res.statusCode < 500) removeUploadedFiles(req);
  });
};

// How the saved files of each field are checked for what they really are.
const CONTENT_CHECKS = [
  // Customers' graphics: PNG, JPEG or SVG.
  { fields: GRAPHIC_FIELDS, check: checkGraphicContents },
  // Order approval proofs: the same formats.
  { fields: [APPROVAL_PROOF_FIELD], check: (files) => checkGraphicContents(files, PROOF_TYPE_MESSAGE) },
  // Pictures on the approval page: PNG or JPEG only.
  { fields: [APPROVAL_PICTURE_FIELD], check: checkPictureContents },
];

const checkContents = async (files) => {
  for (const { fields, check } of CONTENT_CHECKS) {
    const matching = files.filter((file) => fields.includes(file.fieldname));
    if (matching.length) await check(matching);
  }
};

// Too many files for a route with its own words for that: over the request's file limit
// (busboy's, which names no field), or over the pictures field's count.
const isTooMany = (route, error) =>
  Boolean(route.tooMany) &&
  error instanceof multer.MulterError &&
  (error.code === "LIMIT_FILE_COUNT" || (error.code === "LIMIT_UNEXPECTED_FILE" && error.field === APPROVAL_PICTURE_FIELD));

// Runs the upload, then checks that every saved graphic really is a PNG, JPEG or SVG (and every
// approval picture a PNG or JPEG). A request with one that isn't is refused (400) before the route
// sees it, and all its files are deleted.
const runUpload = (route, uploader, req, res, next) =>
  uploader(req, res, (error) => {
    if (isTooMany(route, error)) return next(new ApiError(httpStatus.BAD_REQUEST, route.tooMany));
    if (error) return next(error);

    const files = Object.values(req.files || {}).flat();
    if (!files.length) return next();

    return checkContents(files).then(
      () => next(),
      (refusal) => {
        removeUploadedFiles(req);
        next(refusal);
      },
    );
  });

const uploadMiddleware = (req, res, next) => {
  const route = FILE_ROUTES.find(
    (candidate) => candidate.method === req.method && candidate.path.test(req.path),
  );

  if (!route) {
    return textFieldsOnly(req, res, next);
  }

  if (route.limit) {
    return route.limit(req, res, (error) => {
      if (error) return next(error);
      discardWhenRefused(req, res);
      return runUpload(route, upload, req, res, next);
    });
  }

  if (!route.auth) {
    return runUpload(route, upload, req, res, next);
  }

  // The route's own auth middleware runs again after the upload (multer replaces
  // req.body); requireAdmin reuses req.admin, so the admin isn't looked up twice, and the
  // approval gate reuses req.approval.
  return route.auth(req, res, (error) => {
    if (error) return next(error);
    if (route.discardRefused) discardWhenRefused(req, res);
    return runUpload(route, route.upload || upload, req, res, next);
  });
};

// Turns upload errors into 400 responses with a readable message.
const uploadErrorMessage = (error) => {
  if (!(error instanceof multer.MulterError)) return null;

  if (error.code === "LIMIT_UNEXPECTED_FILE") {
    return new ApiError(httpStatus.BAD_REQUEST, "File uploads aren't accepted for this field or endpoint.");
  }
  if (error.code === "LIMIT_FILE_SIZE") {
    const { fileSize } = GRAPHIC_FIELDS.includes(error.field)
      ? graphicLimits
      : error.field === CSV_FIELD
        ? csvLimits
        : error.field === APPROVAL_PICTURE_FIELD
          ? approvalPictureLimits
          : limits;
    return new ApiError(httpStatus.BAD_REQUEST, `Each file must be ${fileSize / (1024 * 1024)} MB or smaller.`);
  }
  return new ApiError(httpStatus.BAD_REQUEST, `Upload rejected: ${error.message}`);
};

module.exports = {
  uploadMiddleware,
  uploadErrorMessage,
};
