const multer = require("multer");
const path = require("path");

const PUBLIC_DIR = path.resolve(__dirname, "../../public");

// Set storage engine
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (file.fieldname === "videos") {
      cb(null, PUBLIC_DIR + "/uploads/videos");
    } else if (
      file.fieldname === "images" ||
      file.fieldname === "variant_images" ||
      file.fieldname === "customization_images"
    ) {
      cb(null, PUBLIC_DIR + "/uploads/images");
    } else if (file.fieldname === "gifs") {
      cb(null, PUBLIC_DIR + "/uploads/gifs");
    } else if (file.fieldname === "docs") {
      cb(null, PUBLIC_DIR + "/uploads/docs");
    } else if (file.fieldname === "audios") {
      cb(null, PUBLIC_DIR + "/uploads/audios");
    } else {
      cb(new Error("Invalid fieldname"));
    }
  },
  filename: function (req, file, cb) {
    let ext;

    if (file.fieldname === "customization_images") {
      ext = path.extname(file.originalname).toLowerCase().replace(".", "");
    } else {
      ext = getFileExtension(file);
    }

    cb(null, `${file.fieldname}-${Date.now()}.${ext}`);
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
      "Error: Images(.jpeg, .jpg, .png,.avif, .webp), videos(.mp4, .mov), Audio(.mp3), and File(.pdf, .doc, .docx) only allow!",
    );
  }
}

function checkCustomizationArtworkType(file, cb) {
  const fileExtension = path.extname(file.originalname).toLowerCase();

  const allowedExtensions = [".svg", ".ai"];

  if (!allowedExtensions.includes(fileExtension)) {
    return cb(
      new Error(
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
    return cb(new Error("Error: Invalid SVG artwork file."));
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

// Init upload
const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    if (file.fieldname === "customization_images") {
      return checkCustomizationArtworkType(file, cb);
    }

    return checkFileType(file, cb);
  },
}).fields([
  { name: "gifs", maxCount: 10 },
  { name: "images", maxCount: 10 },
  { name: "videos", maxCount: 10 },
  { name: "docs", maxCount: 10 },
  { name: "audios", maxCount: 10 },
  { name: "variant_images", maxCount: 20 },
  { name: "customization_images", maxCount: 10 },
]);

module.exports = upload;
