const crypto = require("crypto");
const multer = require("multer");
const path = require("path");
const httpStatus = require("http-status");
const ApiError = require("../utils/ApiError");

const { dirs } = require("./storage");

// Set storage engine
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (
      file.fieldname === "images" ||
      file.fieldname === "variant_images" ||
      file.fieldname === "customization_images"
    ) {
      cb(null, dirs.images);
    } else {
      cb(new ApiError(httpStatus.BAD_REQUEST, "Invalid upload field"));
    }
  },
  filename: function (req, file, cb) {
    let ext;

    if (file.fieldname === "customization_images") {
      ext = path.extname(file.originalname).toLowerCase().replace(".", "");
    } else {
      ext = getFileExtension(file);
    }

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

function checkCustomizationArtworkType(file, cb) {
  const fileExtension = path.extname(file.originalname).toLowerCase();

  const allowedExtensions = [".svg", ".ai"];

  if (!allowedExtensions.includes(fileExtension)) {
    return cb(
      new ApiError(
        httpStatus.BAD_REQUEST,
        "Error: Customization artwork only allows SVG (.svg) and Adobe Illustrator (.ai) files.",
      ),
    );
  }

  /*
   * SVG normally comes as image/svg+xml.
   *
   * Illustrator files can be reported with different MIME types
   * depending on browser/OS/application, so extension is the
   * authoritative check for .ai here.
   */
  if (fileExtension === ".svg" && file.mimetype !== "image/svg+xml") {
    return cb(new ApiError(httpStatus.BAD_REQUEST, "Error: Invalid SVG artwork file."));
  }

  return cb(null, true);
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

// Init upload
const upload = multer({
  storage: storage,
  limits,
  fileFilter: function (req, file, cb) {
    if (file.fieldname === "customization_images") {
      return checkCustomizationArtworkType(file, cb);
    }

    return checkFileType(file, cb);
  },
}).fields([
  { name: "images", maxCount: 10 },
  { name: "variant_images", maxCount: 20 },
  { name: "customization_images", maxCount: 10 },
]);

module.exports = { upload, limits };
