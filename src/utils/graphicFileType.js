const fs = require("fs");
const path = require("path");
const httpStatus = require("http-status");

const ApiError = require("./ApiError");

// Customers' graphics are PNG, JPG/JPEG or SVG only (decided 20 Nov 2026): ZIP, PDF, AI and every
// other format are refused. The name and the type the browser reports are checked before the file
// is saved, and the file's first bytes after, because the name and the type can say anything.

const GRAPHIC_EXTENSIONS = ["png", "jpg", "jpeg", "svg"];

const GRAPHIC_TYPE_MESSAGE =
  "Graphics must be PNG, JPG, JPEG or SVG files. ZIP, PDF and other files can't be uploaded.";

// The types browsers and tools report for those files. A generic type (or none) is left to the
// check of the contents.
const MIME_TYPES = {
  png: ["image/png", "image/x-png"],
  jpg: ["image/jpeg", "image/jpg", "image/pjpeg"],
  jpeg: ["image/jpeg", "image/jpg", "image/pjpeg"],
  svg: ["image/svg+xml", "text/xml", "application/xml"],
};
const GENERIC_MIME_TYPES = ["", "application/octet-stream", "binary/octet-stream"];

const extensionOf = (file) => path.extname(file.originalname || "").toLowerCase().replace(".", "");

// Before saving: a .png, .jpg, .jpeg or .svg name, and a type that doesn't say it's something else.
const isGraphicFile = (file) => {
  const ext = extensionOf(file);
  if (!GRAPHIC_EXTENSIONS.includes(ext)) return false;

  const mime = String(file.mimetype || "").toLowerCase();
  return GENERIC_MIME_TYPES.includes(mime) || MIME_TYPES[ext].includes(mime);
};

// Enough of the file to find an SVG's root element after its XML declaration, comments and DOCTYPE.
const SAMPLE_BYTES = 64 * 1024;

const readSample = async (filePath) => {
  const handle = await fs.promises.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(SAMPLE_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, SAMPLE_BYTES, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// An SVG is text whose first element is <svg>. An HTML page with an <svg> inside it isn't one.
const isSvgText = (sample) => {
  if (sample.includes(0)) return false;

  let text = sample.toString("utf8").replace(/^﻿/, "");
  for (;;) {
    text = text.trimStart();
    if (text.startsWith("<?")) {
      const end = text.indexOf("?>");
      if (end < 0) return false;
      text = text.slice(end + 2);
    } else if (text.startsWith("<!--")) {
      const end = text.indexOf("-->");
      if (end < 0) return false;
      text = text.slice(end + 3);
    } else if (/^<!DOCTYPE/i.test(text)) {
      // Illustrator writes entity declarations inside [ ] before the closing >.
      const close = text.indexOf(">");
      const subset = text.indexOf("[");
      const end = subset >= 0 && subset < close ? text.indexOf(">", text.indexOf("]", subset)) : close;
      if (end < 0) return false;
      text = text.slice(end + 1);
    } else {
      break;
    }
  }
  return /^<(svg:)?svg[\s/>]/i.test(text);
};

// The file's real format from its first bytes: "png", "jpeg", "svg", or null for anything else.
const detectGraphicType = (sample) => {
  if (sample.length >= PNG_SIGNATURE.length && sample.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return "png";
  }
  if (sample.length >= 3 && sample[0] === 0xff && sample[1] === 0xd8 && sample[2] === 0xff) {
    return "jpeg";
  }
  return isSvgText(sample) ? "svg" : null;
};

const CANONICAL_MIME = { png: "image/png", jpeg: "image/jpeg", svg: "image/svg+xml" };

// After saving: every graphic in the request must really be a PNG, a JPEG or an SVG, and an .svg
// name must hold an SVG (a .png or .jpg name may hold either picture format). The saved type is
// set to the real one. Throws a 400 for the first file that fails.
const checkGraphicContents = async (files) => {
  for (const file of files) {
    const type = detectGraphicType(await readSample(file.path));
    const isSvgName = extensionOf(file) === "svg";

    if (!type || (type === "svg") !== isSvgName) {
      // multer reads the name as latin1; browsers send UTF-8.
      const name = Buffer.from(file.originalname || "", "latin1").toString("utf8").slice(0, 100);
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `"${name}" isn't a real ${isSvgName ? "SVG" : "PNG or JPG"} file. ${GRAPHIC_TYPE_MESSAGE}`,
      );
    }

    file.mimetype = CANONICAL_MIME[type];
  }
};

module.exports = {
  GRAPHIC_EXTENSIONS,
  GRAPHIC_TYPE_MESSAGE,
  isGraphicFile,
  detectGraphicType,
  checkGraphicContents,
};
