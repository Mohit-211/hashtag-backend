const fs = require("fs");
const multer = require("multer");
const httpStatus = require("http-status");

const {
  UPLOADS,
  graphicUpload,
  csvUpload,
  approvalProofUpload,
  approvalPictureUpload,
  discardUploads,
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
const { checkGraphicContents, checkCustomerGraphicContents, checkPictureContents } = require("../utils/graphicFileType");
const { isKept } = require("../utils/keptUploads");

// Routes that accept file uploads (paths relative to /api/v1). Admin and customer
// routes are authenticated before any file is written to disk. The two public routes
// are rate-limited here, before the upload (not in their route files).
// Most routes take only the fields their form sends (config/multer.js UPLOADS). Once one of them
// has answered, whatever the answer, every file the route didn't keep is deleted: the service
// marks a file with keepUpload (utils/keptUploads.js) right after saving the record that points
// to it. So is everything a request wrote when its sender goes away before the upload finishes.
// POST graphics, the CSV imports and the order approval routes keep their own uploads; files from
// a refused approval request are deleted (discardRefused). The customer's approval page has no
// sign-in, so its gate checks the link's key and counts the request first.
const FILE_ROUTES = [
  { method: "POST", path: /^\/user\/auth\/register\/?$/, limit: emailLimiter, upload: UPLOADS.signUp },
  { method: "POST", path: /^\/sourcing-requests\/create\/?$/, limit: publicFormLimiter, upload: UPLOADS.sourcingRequest },
  { method: "POST", path: /^\/product\/cart\/?$/, auth: verifyAuthJWTToken, upload: UPLOADS.cart },
  { method: "POST", path: /^\/graphics\/?$/, auth: verifyAuthJWTToken, upload: graphicUpload },

  { method: "POST", path: /^\/product\/create-product\/?$/, auth: requireAdmin, upload: UPLOADS.productImages },
  { method: "POST", path: /^\/product\/import(\/preview)?\/?$/, auth: requireAdmin, upload: csvUpload },
  { method: "POST", path: /^\/pricing-template\/import(\/preview)?\/?$/, auth: requireAdmin, upload: csvUpload },
  { method: "POST", path: /^\/product\/add-product-variants\/?$/, auth: requireAdmin, upload: UPLOADS.variantImages },
  { method: "PUT", path: /^\/product\/manual\/full\/?$/, auth: requireAdmin, upload: UPLOADS.productAndVariantImages },
  { method: "POST", path: /^\/product\/update\/?$/, auth: requireAdmin, upload: UPLOADS.productAndVariantImages },
  { method: "POST", path: /^\/brand\/?$/, auth: requireAdmin, upload: UPLOADS.oneImage },
  { method: "POST", path: /^\/brand\/publish\/?$/, auth: requireAdmin, upload: UPLOADS.oneImage },
  { method: "POST", path: /^\/brand\/manual-brand\/?$/, auth: requireAdmin, upload: UPLOADS.oneImage },
  { method: "POST", path: /^\/industry\/?$/, auth: requireAdmin, upload: UPLOADS.oneImage },
  { method: "PUT", path: /^\/industry\/[^/]+\/?$/, auth: requireAdmin, upload: UPLOADS.oneImage },
  { method: "POST", path: /^\/industry\/use-case\/?$/, auth: requireAdmin, upload: UPLOADS.oneImage },
  { method: "PUT", path: /^\/industry\/use-case\/[^/]+\/?$/, auth: requireAdmin, upload: UPLOADS.oneImage },
  { method: "POST", path: /^\/add-on\/addon-product\/?$/, auth: requireAdmin, upload: UPLOADS.oneImage },
  { method: "PUT", path: /^\/add-on\/addon-product\/[^/]+\/?$/, auth: requireAdmin, upload: UPLOADS.oneImage },
  { method: "POST", path: /^\/gallery\/?$/, auth: requireAdmin, upload: UPLOADS.galleryImage },
  { method: "PUT", path: /^\/gallery\/[^/]+\/?$/, auth: requireAdmin, upload: UPLOADS.galleryImage },

  // Order approval: the team's proofs, and the pictures with a customer's rejection (tooMany: the
  // customer's words when they send more than the route takes).
  { method: "POST", path: /^\/order\/admin\/[^/]+\/approval\/lines\/[^/]+\/proofs\/?$/, auth: requireAdmin, upload: approvalProofUpload, discardRefused: true },
  { method: "POST", path: /^\/approval\/lines\/[^/]+\/reject\/?$/, auth: approvalUploadGate, upload: approvalPictureUpload, discardRefused: true, tooMany: "You can add up to 5 pictures." },
];

// Everywhere else multipart forms are still parsed, but files are refused.
const textFieldsOnly = multer({ limits }).none();

const uploadedFiles = (req) => Object.values(req.files || {}).flat();

// Deletes the files multer saved for this request.
const removeUploadedFiles = (req) => {
  for (const file of uploadedFiles(req)) {
    fs.promises.unlink(file.path).catch(() => {});
  }
};

// A refused request (400-499) has no use for its files.
const discardWhenRefused = (req, res) => {
  res.on("finish", () => {
    if (res.statusCode >= 400 && res.statusCode < 500) removeUploadedFiles(req);
  });
};

// How the saved files of each field are checked for what they really are. The routes in UPLOADS
// name each field's own check instead.
const CONTENT_CHECKS = [
  // Customers' graphics: PNG, JPEG or SVG.
  { fields: GRAPHIC_FIELDS, check: checkCustomerGraphicContents },
  // Order approval proofs: the same formats.
  { fields: [APPROVAL_PROOF_FIELD], check: (files) => checkGraphicContents(files, PROOF_TYPE_MESSAGE) },
  // Pictures on the approval page: PNG or JPEG only.
  { fields: [APPROVAL_PICTURE_FIELD], check: checkPictureContents },
];

const contentChecksOf = (upload) =>
  upload.fields.filter((field) => field.kind.check).map((field) => ({ fields: [field.name], check: field.kind.check }));

const checkContents = async (files, checks = CONTENT_CHECKS) => {
  for (const { fields, check } of checks) {
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

// POST graphics, the CSV imports and the approval routes: runs the upload, then checks that every
// saved graphic really is a PNG, JPEG or SVG (and every approval picture a PNG or JPEG). A request
// with one that isn't is refused (400) before the route sees it, and all its files are deleted.
const runUpload = (route, req, res, next) =>
  route.upload(req, res, (error) => {
    if (isTooMany(route, error)) return next(new ApiError(httpStatus.BAD_REQUEST, route.tooMany));
    if (error) return next(error);

    const files = uploadedFiles(req);
    if (!files.length) return next();

    return checkContents(files).then(
      () => next(),
      (refusal) => {
        removeUploadedFiles(req);
        next(refusal);
      },
    );
  });

// Calls back once the route has answered, even when the sender has gone by then: "finish" never
// fires on a closed connection.
const whenAnswered = (res, callback) => {
  const end = res.end;
  res.end = function (...args) {
    res.end = end;
    const result = end.apply(this, args);
    callback();
    return result;
  };
};

// The words for a file one of UPLOADS refuses: in a field the route doesn't take, or more files or
// a bigger one than a field takes. null leaves the error to uploadErrorMessage.
const refusalFor = (upload, error) => {
  if (!(error instanceof multer.MulterError)) return null;
  const refuse = (message) => new ApiError(httpStatus.BAD_REQUEST, message);

  if (!upload.fields.length) {
    return ["LIMIT_UNEXPECTED_FILE", "LIMIT_FILE_COUNT"].includes(error.code) ? refuse(upload.noFiles) : null;
  }

  const field = upload.fields.find((candidate) => candidate.name === error.field);
  if (error.code === "LIMIT_UNEXPECTED_FILE") return refuse(field ? field.tooMany : upload.otherField);
  if (error.code === "LIMIT_FILE_COUNT") return refuse(upload.tooManyFiles);
  if (error.code === "LIMIT_FILE_SIZE" && field) return refuse(field.tooBig(error.fileName));
  return null;
};

// The routes in UPLOADS: runs the upload, which takes only the route's fields, then checks what
// each saved file really is where its field asks for that (the sourcing form's images, the cart's
// preview and graphics). A refused request keeps no file. Once the route has answered, the files it
// didn't keep are deleted.
const runFieldsUpload = (route, req, res, next) => {
  const { upload } = route;
  let settled = false;
  let abandoned = false;

  // The sender went away before the upload finished: multer then never calls back, and what was
  // written would stay, half written and open.
  res.once("close", () => {
    if (settled) return;
    abandoned = true;
    discardUploads(req);
  });

  whenAnswered(res, () => {
    const kept = new Set(uploadedFiles(req).filter(isKept).map((file) => file.path));
    discardUploads(req, kept);
  });

  // The answer waits until the rest of the request has been read and dropped. Answered while the
  // sender is still sending, it can be lost: on a connection that closes after the answer, the
  // unread data makes the close a reset.
  const refuse = (refusal) => {
    discardUploads(req);
    if (req.readableEnded) return next(refusal);
    req.once("end", () => next(refusal));
    return req.resume();
  };

  return upload.handle(req, res, (error) => {
    // Nobody is waiting for an answer, and what was written is already gone.
    if (abandoned) return;
    settled = true;

    if (error) return refuse(refusalFor(upload, error) || error);

    const files = uploadedFiles(req);
    if (!files.length) return next();

    return checkContents(files, contentChecksOf(upload)).then(() => next(), refuse);
  });
};

const runRouteUpload = (route, req, res, next) =>
  route.upload.fields ? runFieldsUpload(route, req, res, next) : runUpload(route, req, res, next);

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
      return runRouteUpload(route, req, res, next);
    });
  }

  if (!route.auth) {
    return runRouteUpload(route, req, res, next);
  }

  // The route's own auth middleware runs again after the upload (multer replaces
  // req.body); requireAdmin reuses req.admin, so the admin isn't looked up twice, and the
  // approval gate reuses req.approval.
  return route.auth(req, res, (error) => {
    if (error) return next(error);
    if (route.discardRefused) discardWhenRefused(req, res);
    return runRouteUpload(route, req, res, next);
  });
};

// Turns upload errors into 400 responses with a readable message: POST graphics, the CSV imports,
// the approval routes, and every route that takes no files.
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
