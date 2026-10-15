const multer = require("multer");
const httpStatus = require("http-status");

const { upload, limits } = require("../config/multer");
const { requireAdmin } = require("./adminAuth.middleware");
const { verifyAuthJWTToken } = require("./userAuth.middleware");
const ApiError = require("../utils/ApiError");

// Routes that accept file uploads (paths relative to /api/v1). Admin and customer
// routes are authenticated before any file is written to disk.
const FILE_ROUTES = [
  { method: "POST", path: /^\/user\/auth\/register\/?$/ },
  { method: "POST", path: /^\/sourcing-requests\/create\/?$/ },
  { method: "POST", path: /^\/product\/cart\/?$/, auth: verifyAuthJWTToken },

  { method: "POST", path: /^\/product\/create-product\/?$/, auth: requireAdmin },
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
];

// Everywhere else multipart forms are still parsed, but files are refused.
const textFieldsOnly = multer({ limits }).none();

const uploadMiddleware = (req, res, next) => {
  const route = FILE_ROUTES.find(
    (candidate) => candidate.method === req.method && candidate.path.test(req.path),
  );

  if (!route) {
    return textFieldsOnly(req, res, next);
  }

  if (!route.auth) {
    return upload(req, res, next);
  }

  // The route's own auth middleware runs again after the upload (multer replaces
  // req.body); requireAdmin reuses req.admin, so the admin isn't looked up twice.
  return route.auth(req, res, (error) => {
    if (error) return next(error);
    return upload(req, res, next);
  });
};

// Turns upload errors into 400 responses with a readable message.
const uploadErrorMessage = (error) => {
  if (!(error instanceof multer.MulterError)) return null;

  if (error.code === "LIMIT_UNEXPECTED_FILE") {
    return new ApiError(httpStatus.BAD_REQUEST, "File uploads aren't accepted for this field or endpoint.");
  }
  if (error.code === "LIMIT_FILE_SIZE") {
    return new ApiError(httpStatus.BAD_REQUEST, `Each file must be ${limits.fileSize / (1024 * 1024)} MB or smaller.`);
  }
  return new ApiError(httpStatus.BAD_REQUEST, `Upload rejected: ${error.message}`);
};

module.exports = {
  uploadMiddleware,
  uploadErrorMessage,
};
