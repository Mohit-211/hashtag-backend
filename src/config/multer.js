const crypto = require("crypto");
const multer = require("multer");
const path = require("path");
const httpStatus = require("http-status");
const ApiError = require("../utils/ApiError");

const { dirs } = require("./storage");

// Customers' graphics: any format, any dimensions, stored exactly as uploaded.
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

const fileFilter = function (req, file, cb) {
  if (GRAPHIC_FIELDS.includes(file.fieldname)) {
    return cb(null, true);
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

module.exports = { upload, cartUpload, graphicUpload, limits, graphicLimits, GRAPHIC_FIELDS };
