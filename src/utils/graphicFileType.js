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

// multer reads the name as latin1; browsers send UTF-8.
const shownName = (file) => Buffer.from(file.originalname || "", "latin1").toString("utf8").slice(0, 100);

// After saving: every graphic in the request must really be a PNG, a JPEG or an SVG, and an .svg
// name must hold an SVG (a .png or .jpg name may hold either picture format). The saved type is
// set to the real one. Throws a 400 for the first file that fails. typeMessage: what's allowed,
// for files that aren't customers' graphics (order approval proofs).
const checkGraphicContents = async (files, typeMessage = GRAPHIC_TYPE_MESSAGE) => {
  for (const file of files) {
    const type = detectGraphicType(await readSample(file.path));
    const isSvgName = extensionOf(file) === "svg";

    if (!type || (type === "svg") !== isSvgName) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `"${shownName(file)}" isn't a real ${isSvgName ? "SVG" : "PNG or JPG"} file. ${typeMessage}`,
      );
    }

    file.mimetype = CANONICAL_MIME[type];
  }
};

// Pictures customers add to their notes on the approval page: PNG or JPEG only, no SVG, because
// anyone with the page's link can upload them.
const PICTURE_EXTENSIONS = ["png", "jpg", "jpeg"];
const PICTURE_TYPE_MESSAGE = "Pictures must be PNG or JPG files.";

const isPictureFile = (file) => PICTURE_EXTENSIONS.includes(extensionOf(file)) && isGraphicFile(file);

// After saving, like checkGraphicContents: each picture must really be a PNG or a JPEG.
// typeMessage: what's allowed, for pictures that aren't on the approval page (the cart's preview).
const checkPictureContents = async (files, typeMessage = PICTURE_TYPE_MESSAGE) => {
  for (const file of files) {
    const type = detectGraphicType(await readSample(file.path));
    if (type !== "png" && type !== "jpeg") {
      throw new ApiError(httpStatus.BAD_REQUEST, `"${shownName(file)}" isn't a real PNG or JPG file. ${typeMessage}`);
    }
    file.mimetype = CANONICAL_MIME[type];
  }
};

// Photos saved from shops, social apps and phones are often WebP, AVIF, HEIC or GIF under a .jpg
// or .png name, and browsers show them all. These are the major brands of AVIF and HEIC files (an
// MP4 or MOV video has its own).
const HEIF_BRANDS = ["avif", "avis", "heic", "heix", "heim", "heis", "hevc", "hevx", "hevm", "hevs", "mif1", "msf1"];

// The picture format from the first bytes: "png", "jpeg", "gif", "webp", "heif", or null.
const detectPictureType = (sample) => {
  const type = detectGraphicType(sample);
  if (type === "png" || type === "jpeg") return type;

  const text = (start, end) => sample.subarray(start, end).toString("latin1");
  if (["GIF87a", "GIF89a"].includes(text(0, 6))) return "gif";
  if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return "webp";
  if (text(4, 8) === "ftyp" && HEIF_BRANDS.includes(text(8, 12))) return "heif";
  return null;
};

const PICTURE_MIME = { ...CANONICAL_MIME, gif: "image/gif", webp: "image/webp", heif: "image/heif" };

// After saving, for the sourcing form's logos and reference images: an .svg name must hold an SVG,
// and a .png, .jpg or .jpeg name a picture (PNG, JPEG, GIF, WebP, AVIF or HEIC), as the form has
// always taken them. ZIP files, PDFs, web pages and videos are refused. typeMessage: what's allowed.
const checkReferenceContents = async (files, typeMessage) => {
  for (const file of files) {
    const sample = await readSample(file.path);
    const isSvgName = extensionOf(file) === "svg";
    const type = isSvgName ? (detectGraphicType(sample) === "svg" ? "svg" : null) : detectPictureType(sample);

    if (!type) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `"${shownName(file)}" isn't a real ${isSvgName ? "SVG" : "PNG or JPG"} file. ${typeMessage}`,
      );
    }

    file.mimetype = PICTURE_MIME[type];
  }
};

module.exports = {
  GRAPHIC_EXTENSIONS,
  GRAPHIC_TYPE_MESSAGE,
  PICTURE_TYPE_MESSAGE,
  isGraphicFile,
  isPictureFile,
  shownName,
  detectGraphicType,
  checkGraphicContents,
  checkPictureContents,
  checkReferenceContents,
};
