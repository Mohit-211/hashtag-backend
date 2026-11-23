// The files of an order's approval: the team's proofs (PNG, JPG or SVG, kept as uploaded, with a
// WebP preview for the pages) and the customer's pictures (PNG or JPEG, saved again by sharp,
// which drops their location and camera data). They live in storage/approvals, served at
// /approvals like /graphics (app.js), and never touch user_graphics or customization_config, so
// the $35 graphic fee never sees them. upload.middleware.js has already checked each file's real
// type when these run.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const httpStatus = require("http-status");
const sharp = require("sharp");

const logger = require("../../config/logger");
const { dirs } = require("../../config/storage");
const ApiError = require("../../utils/ApiError");
const { toFullImageUrl } = require("../../utils/orderFormat");
const { hashFile } = require("./graphic.service");
const { clip } = require("./approvalStore");

const PREVIEW_SIZE = 1600;
const PICTURE_SIZE = 2400;
// A bigger picture is refused rather than decoded (a small file can unpack to a huge one).
const MAX_INPUT_PIXELS = 50_000_000;

// <kind>-<128 random bits>.<ext>: nobody can guess another file's address.
const storedName = (kind, ext) => `${kind}-${crypto.randomBytes(16).toString("hex")}.${ext}`;
const storedPath = (name) => path.join(dirs.approvals, path.basename(name));

const fileUrl = (name) => (name ? toFullImageUrl(`/approvals/${name}`) : null);

// A line's customer artwork (approvalLines.js keeps the paths as stored) as links.
const artworkLinks = (artwork) =>
  (Array.isArray(artwork) ? artwork : []).map((entry) => ({ url: toFullImageUrl(entry?.path), name: entry?.name || null }));

const removeStoredFiles = (names) => {
  for (const name of names.filter(Boolean)) fs.promises.unlink(storedPath(name)).catch(() => {});
};

// multer reads file names as latin1; browsers send UTF-8.
const uploadName = (file) => clip(Buffer.from(file.originalname || "", "latin1").toString("utf8"), 255) || "file";

// A WebP of at most 1600 px for the admin panel and the customer's page, or null when sharp can't
// draw the file (the pages then show the original). An SVG is drawn at the density that makes it
// about that size, so a small one isn't blurred.
const makePreview = async (file) => {
  const name = storedName("preview", "webp");
  try {
    let density = null;
    if (file.mimetype === "image/svg+xml") {
      const { width, height } = await sharp(file.path, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
      const longest = Math.max(width || 0, height || 0);
      density = longest ? Math.min(Math.max((72 * PREVIEW_SIZE) / longest, 1), 1200) : 150;
    }

    await sharp(file.path, { limitInputPixels: MAX_INPUT_PIXELS, ...(density && { density }) })
      .timeout({ seconds: 30 })
      .rotate()
      .resize(PREVIEW_SIZE, PREVIEW_SIZE, { fit: "inside", withoutEnlargement: !density })
      .webp({ quality: 82 })
      .toFile(storedPath(name));
    return name;
  } catch (error) {
    logger.warn(`Approval proof ${file.filename}: no preview (${error.message})`);
    removeStoredFiles([name]);
    return null;
  }
};

// The team's proof as multer saved it (field approval_proof): the values for its record.
const saveProof = async (file) => ({
  stored_name: file.filename,
  preview_name: await makePreview(file),
  original_name: uploadName(file),
  mime: file.mimetype,
  bytes: file.size,
  sha256: await hashFile(file.path),
});

// The customer's pictures as multer saved them (field approval_picture): each saved again upright,
// at most 2400 px, in its own format and without metadata, and the upload deleted. Returns the
// values for their records. A file sharp can't read is a 400, and nothing is kept.
const savePictures = async (files) => {
  const saved = [];
  let writing = null;
  try {
    for (const file of files) {
      const png = file.mimetype === "image/png";
      writing = storedName("picture", png ? "png" : "jpg");
      const pipeline = sharp(file.path, { limitInputPixels: MAX_INPUT_PIXELS })
        .timeout({ seconds: 30 })
        .rotate()
        .resize(PICTURE_SIZE, PICTURE_SIZE, { fit: "inside", withoutEnlargement: true });

      try {
        await (png ? pipeline.png() : pipeline.jpeg({ quality: 85 })).toFile(storedPath(writing));
      } catch (error) {
        logger.warn(`Approval picture ${file.filename} couldn't be read: ${error.message}`);
        const name = clip(uploadName(file), 100);
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          /pixel limit/i.test(error.message)
            ? `"${name}" is too big (over 50 megapixels). Try a smaller photo or a screenshot.`
            : `"${name}" couldn't be read as a picture. Try another PNG or JPG.`,
        );
      }

      saved.push({
        stored_name: writing,
        original_name: uploadName(file),
        mime: png ? "image/png" : "image/jpeg",
        bytes: (await fs.promises.stat(storedPath(writing))).size,
        sha256: await hashFile(storedPath(writing)),
      });
      writing = null;
    }
  } catch (error) {
    removeStoredFiles([...saved.map((picture) => picture.stored_name), writing]);
    throw error;
  } finally {
    for (const file of files) fs.promises.unlink(file.path).catch(() => {});
  }
  return saved;
};

module.exports = {
  fileUrl,
  artworkLinks,
  removeStoredFiles,
  saveProof,
  savePictures,
};
