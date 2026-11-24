const crypto = require("crypto");
const multer = require("multer");
const path = require("path");
const httpStatus = require("http-status");
const ApiError = require("../utils/ApiError");
const {
  isGraphicFile,
  isPictureFile,
  GRAPHIC_TYPE_MESSAGE,
  PICTURE_TYPE_MESSAGE,
} = require("../utils/graphicFileType");

const { dirs } = require("./storage");

// Customers' graphics: PNG, JPG/JPEG or SVG (see utils/graphicFileType.js), any dimensions,
// stored exactly as uploaded.
const GRAPHIC_FIELDS = ["graphic", "customization_images"];

// Set storage engine
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (GRAPHIC_FIELDS.includes(file.fieldname)) {
      cb(null, dirs.graphics);
    } else if (file.fieldname === "images" || file.fieldname === "variant_images") {
      cb(null, dirs.images);
    } else {
      cb(new ApiError(httpStatus.BAD_REQUEST, "Invalid upload field"));
    }
  },
  filename: function (req, file, cb) {
    const ext = GRAPHIC_FIELDS.includes(file.fieldname)
      ? getGraphicExtension(file)
      : getFileExtension(file);

    // Random suffix: two uploads in the same millisecond used to overwrite each other.
    cb(null, `${file.fieldname}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`);
  },
});

// Check file type
function checkFileType(file, cb) {
  const allowedFiletypes = [
    "jpeg",
    "jpg",
    "png",
    "webp",
    "avif",
    "gif",
    "mp4",
    "mov",
    "pdf",
    "mp3",
    "doc",
    "docx",
  ];

  const fileExtension = path.extname(file.originalname).toLowerCase();
  const isValidExtension = allowedFiletypes.includes(
    fileExtension.substring(1),
  );

  const isValidMimeType =
    file.mimetype.startsWith("image/") ||
    file.mimetype === "image/avif" ||
    file.mimetype.startsWith("video/") ||
    file.mimetype.startsWith("application/pdf") ||
    file.mimetype.startsWith("audio/") ||
    file.mimetype === "application/msword" ||
    file.mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (isValidExtension && isValidMimeType) {
    return cb(null, true);
  } else {
    cb(
      new ApiError(
        httpStatus.BAD_REQUEST,
        "Error: Images(.jpeg, .jpg, .png,.avif, .webp), videos(.mp4, .mov), Audio(.mp3), and File(.pdf, .doc, .docx) only allow!",
      ),
    );
  }
}

// The name is the customer's, so only a plain extension is kept.
function getGraphicExtension(file) {
  const ext = path.extname(file.originalname).toLowerCase().replace(".", "");

  return /^[a-z0-9]{1,10}$/.test(ext) ? ext : "bin";
}

function getFileExtension(file) {
  const mimeToExtMap = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/mov": "mov",
    // what browsers report for .mov files
    "video/quicktime": "mov",
    "application/pdf": "pdf",
    "audio/mpeg": "mp3",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "docx",
  };
  return mimeToExtMap[file.mimetype] || "txt";
}

// Per request: up to 40 files of at most 20 MB each.
const limits = {
  fileSize: 20 * 1024 * 1024,
  files: 40,
  fields: 200,
  fieldSize: 2 * 1024 * 1024,
};

// A graphic can be up to 100 MB (client decision Q21).
const graphicLimits = { ...limits, fileSize: 100 * 1024 * 1024 };

// Graphics: the name and type are checked here, before saving; upload.middleware.js checks the
// saved file's contents.
const fileFilter = function (req, file, cb) {
  if (GRAPHIC_FIELDS.includes(file.fieldname)) {
    return isGraphicFile(file)
      ? cb(null, true)
      : cb(new ApiError(httpStatus.BAD_REQUEST, GRAPHIC_TYPE_MESSAGE));
  }

  return checkFileType(file, cb);
};

const uploadFields = [
  { name: "images", maxCount: 10 },
  { name: "variant_images", maxCount: 20 },
  { name: "customization_images", maxCount: 10 },
];

// Init upload
const upload = multer({ storage, limits, fileFilter }).fields(uploadFields);

// POST /product/cart: customization_images are graphics.
const cartUpload = multer({ storage, limits: graphicLimits, fileFilter }).fields(uploadFields);

// POST /graphics
const graphicUpload = multer({ storage, limits: graphicLimits, fileFilter }).fields([
  { name: "graphic", maxCount: 1 },
]);

// POST /product/import, /pricing-template/import and their /preview: one CSV file, read in memory and never
// written to disk.
const CSV_FIELD = "file";
const csvLimits = { fileSize: 2 * 1024 * 1024, files: 1, fields: 20, fieldSize: 1024 * 1024 };
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: csvLimits,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (file.fieldname === CSV_FIELD && [".csv", ".txt", ".tsv"].includes(ext)) {
      return cb(null, true);
    }
    return cb(
      new ApiError(
        httpStatus.BAD_REQUEST,
        "Upload a .csv file. In Excel, Google Sheets or Numbers, save or download the sheet as CSV.",
      ),
    );
  },
}).single(CSV_FIELD);

// Order approvals: the team's proofs and the pictures customers add to their rejections, in their
// own folder (served like /graphics, app.js) with 128-bit random names, because the approval page
// needs no sign-in. A picture is saved again by approvalFiles.js, so its upload is only a working
// copy.
const APPROVAL_PROOF_FIELD = "approval_proof";
const APPROVAL_PICTURE_FIELD = "approval_picture";
const PROOF_TYPE_MESSAGE = "Artwork previews must be PNG, JPG, JPEG or SVG files.";

const approvalStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, dirs.approvals),
  filename: (req, file, cb) => {
    // "artwork", the customers' word: the name shows when they save an image.
    const kind = file.fieldname === APPROVAL_PROOF_FIELD ? "artwork" : "upload";
    cb(null, `${kind}-${crypto.randomBytes(16).toString("hex")}.${getGraphicExtension(file)}`);
  },
});

// One proof of up to 20 MB per request; up to 5 pictures of 10 MB with a rejection.
const approvalProofLimits = { ...limits, files: 1 };
const approvalPictureLimits = { ...limits, fileSize: 10 * 1024 * 1024, files: 5 };

// POST order/admin/:id/approval/lines/:lineId/proofs
const approvalProofUpload = multer({
  storage: approvalStorage,
  limits: approvalProofLimits,
  fileFilter: (req, file, cb) =>
    isGraphicFile(file) ? cb(null, true) : cb(new ApiError(httpStatus.BAD_REQUEST, PROOF_TYPE_MESSAGE)),
}).fields([{ name: APPROVAL_PROOF_FIELD, maxCount: 1 }]);

// POST approval/lines/:lineId/reject
const approvalPictureUpload = multer({
  storage: approvalStorage,
  limits: approvalPictureLimits,
  fileFilter: (req, file, cb) =>
    isPictureFile(file) ? cb(null, true) : cb(new ApiError(httpStatus.BAD_REQUEST, PICTURE_TYPE_MESSAGE)),
}).fields([{ name: APPROVAL_PICTURE_FIELD, maxCount: 5 }]);

module.exports = {
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
};
