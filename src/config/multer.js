const crypto = require("crypto");
const fs = require("fs");
const multer = require("multer");
const path = require("path");
const httpStatus = require("http-status");
const ApiError = require("../utils/ApiError");
const {
  isGraphicFile,
  isCustomerGraphicFile,
  checkCustomerGraphicContents,
  isPictureFile,
  shownName,
  checkPictureContents,
  checkReferenceContents,
  GRAPHIC_TYPE_MESSAGE,
  PICTURE_TYPE_MESSAGE,
} = require("../utils/graphicFileType");

const { dirs } = require("./storage");

const MB = 1024 * 1024;

// Customers' graphics: PNG, JPG/JPEG, SVG or WebP (see utils/graphicFileType.js), any dimensions,
// stored exactly as uploaded.
const GRAPHIC_FIELDS = ["graphic", "customization_images"];

// The saved name: the field, the time and a random part. Random suffix: two uploads in the same
// millisecond used to overwrite each other.
const uploadName = (file, ext) => `${file.fieldname}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;

// POST /graphics: multer's disk storage, as since F21.
const graphicStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, dirs.graphics),
  filename: (req, file, cb) => cb(null, uploadName(file, getGraphicExtension(file))),
});

// The routes that list their own fields (UPLOADS below) save through this storage: multer's disk
// storage plus what it lacks.
// - Each file stops at its own field's size (maxBytes), so one request can take a small preview
//   and big graphics: busboy's fileSize is one size for every file in the request.
// - Each file is recorded on the request as soon as it's opened, so discardUploads can delete
//   what was written. A sender who goes away part way leaves multer waiting: it never calls back.
// - A request that's been refused, or whose sender has gone, starts no more files.
// destination(file) and filename(file) work like diskStorage's, but return their value.
const WRITTEN = Symbol("uploads written");
const STOPPED = Symbol("uploads stopped");

// Deletes a file once it's closed: deleting it while it's still being opened would leave it there.
const removeWhenClosed = (out, filePath) => {
  const remove = () => fs.promises.unlink(filePath).catch(() => {});
  if (out.closed) return remove();
  out.once("close", remove);
  return out.destroy();
};

const trackedDiskStorage = ({ destination, filename, maxBytes }) => ({
  _handleFile(req, file, cb) {
    if (req[STOPPED]) {
      file.stream.resume();
      return cb(new Error("This upload was stopped."));
    }

    let filePath;
    try {
      filePath = path.join(destination(file), filename(file));
    } catch (error) {
      file.stream.resume();
      return cb(error);
    }

    const out = fs.createWriteStream(filePath);
    if (!req[WRITTEN]) req[WRITTEN] = [];
    req[WRITTEN].push({ path: filePath, out });

    const limit = maxBytes(file);
    let size = 0;
    let settled = false;

    // Stops writing, deletes the part written and tells multer, which then refuses the request.
    const fail = (error) => {
      if (settled) return;
      settled = true;
      file.stream.unpipe(out);
      file.stream.resume();
      removeWhenClosed(out, filePath);
      cb(error);
    };

    file.stream.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        const error = new multer.MulterError("LIMIT_FILE_SIZE", file.fieldname);
        error.fileName = shownName(file);
        fail(error);
      }
    });
    out.on("error", fail);
    out.on("finish", () => {
      if (settled) return;
      settled = true;
      cb(null, {
        destination: path.dirname(filePath),
        filename: path.basename(filePath),
        path: filePath,
        size: out.bytesWritten,
      });
    });
    return file.stream.pipe(out);
  },

  // multer hands over no path for a file it stopped itself.
  _removeFile(req, file, cb) {
    if (!file.path) return cb(null);
    return fs.unlink(file.path, () => cb(null));
  },
});

// Deletes every file this request wrote, except the paths in keep, closing any still open, and
// stops it from starting more. For the routes in UPLOADS (see upload.middleware.js).
const discardUploads = (req, keep = new Set()) => {
  req[STOPPED] = true;
  for (const { path: filePath, out } of req[WRITTEN] || []) {
    if (!keep.has(filePath)) removeWhenClosed(out, filePath);
  }
};

// The admin panel's images: what it sends (its src/lib/uploads.ts), and nothing else.
const ADMIN_IMAGE_EXTENSIONS = ["jpeg", "jpg", "png", "webp", "avif", "gif"];

const isAdminImage = (file) =>
  ADMIN_IMAGE_EXTENSIONS.includes(path.extname(file.originalname || "").toLowerCase().replace(".", "")) &&
  String(file.mimetype || "").toLowerCase().startsWith("image/");

// The name is the customer's, so only a plain extension is kept.
function getGraphicExtension(file) {
  const ext = path.extname(file.originalname).toLowerCase().replace(".", "");

  return /^[a-z0-9]{1,10}$/.test(ext) ? ext : "bin";
}

// The admin's images are saved under the type the browser reports: the panel sends crops as PNG
// or JPEG under the original file's name.
function getFileExtension(file) {
  const mimeToExtMap = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
    "image/gif": "gif",
  };
  return mimeToExtMap[file.mimetype] || "txt";
}

// The defaults each upload below narrows: 20 MB per file, 40 files, 200 text fields of up to 2 MB.
const limits = {
  fileSize: 20 * MB,
  files: 40,
  fields: 200,
  fieldSize: 2 * MB,
};

// A graphic can be up to 100 MB (client decision Q21).
const graphicLimits = { ...limits, fileSize: 100 * MB };

// Graphics: the name and type are checked here, before saving; upload.middleware.js checks the
// saved file's contents.
const graphicFileFilter = (req, file, cb) =>
  isCustomerGraphicFile(file) ? cb(null, true) : cb(new ApiError(httpStatus.BAD_REQUEST, GRAPHIC_TYPE_MESSAGE));

// POST /graphics
const graphicUpload = multer({ storage: graphicStorage, limits: graphicLimits, fileFilter: graphicFileFilter }).fields([
  { name: "graphic", maxCount: 1 },
]);

// What each kind of file is: where it's saved and under which extension, the check of its name and
// type before it's saved (accepts, typeMessage), and of the saved file (check; none for the
// admin's images, as before).
const REFERENCE_TYPE_MESSAGE = "Logo and reference images must be PNG, JPG or SVG files.";
const PREVIEW_TYPE_MESSAGE = "The design preview must be a PNG or JPG picture.";

const KINDS = {
  // Customers' graphics for a pre-made product's options (F21's rules, as on POST /graphics).
  graphic: {
    folder: dirs.graphics,
    extension: getGraphicExtension,
    accepts: isCustomerGraphicFile,
    typeMessage: () => GRAPHIC_TYPE_MESSAGE,
    check: (files) => checkCustomerGraphicContents(files),
  },
  // The sourcing form's logos and reference images: PNG, JPG or SVG, as the form says. An SVG is
  // served from /images only as a download (app.js).
  referenceImage: {
    folder: dirs.images,
    extension: getGraphicExtension,
    accepts: isGraphicFile,
    typeMessage: (file) => `"${shownName(file)}" can't be uploaded. ${REFERENCE_TYPE_MESSAGE}`,
    check: (files) => checkReferenceContents(files, REFERENCE_TYPE_MESSAGE),
  },
  // A cart line's design preview: the website's 500x500 PNG of the customizer.
  designPreview: {
    folder: dirs.images,
    extension: getGraphicExtension,
    accepts: isPictureFile,
    typeMessage: () => PREVIEW_TYPE_MESSAGE,
    check: (files) => checkPictureContents(files, PREVIEW_TYPE_MESSAGE),
  },
  // The admin panel's product, variant, brand, industry, use case, add-on and gallery images.
  adminImage: {
    folder: dirs.images,
    extension: getFileExtension,
    accepts: isAdminImage,
    typeMessage: (file) => `"${shownName(file)}" can't be uploaded. Images must be JPG, PNG, WebP, AVIF or GIF files.`,
    check: null,
  },
};

// A file in a field the route doesn't take.
const OTHER_FIELD_MESSAGE = "This form doesn't take that kind of file. Remove it and try again.";

// The words for a file over its field's size: its name when known, then the rule.
const tooBigWords = (maxBytes, rule) => (name) => (name ? `"${name}" is over ${maxBytes / MB} MB. ${rule}` : rule);

// An upload that takes only these fields: [{ name, kind, maxCount, maxBytes, tooMany, tooBig }].
// tooMany: the words for more files than the field takes; tooBig(name): for a bigger one;
// tooManyFiles: for more files than the whole request takes. upload.middleware.js uses them.
const fieldsUpload = (fields, { tooManyFiles } = {}) => {
  const fieldOf = (file) => fields.find((field) => field.name === file.fieldname);
  const largest = Math.max(...fields.map((field) => field.maxBytes));

  const handle = multer({
    storage: trackedDiskStorage({
      destination: (file) => fieldOf(file).kind.folder,
      filename: (file) => uploadName(file, fieldOf(file).kind.extension(file)),
      maxBytes: (file) => fieldOf(file).maxBytes,
    }),
    limits: {
      ...limits,
      // busboy's limit is one size for every file, and refuses a file of exactly that size. It's
      // set above every field's own size, so the storage above decides, and names the file.
      fileSize: largest + MB,
      // One more file than the fields take: a file over its field's count, or in a field the route
      // doesn't take, is refused by its field's count, with that field's words, before it's
      // saved. busboy's count only backs that up.
      files: fields.reduce((sum, field) => sum + field.maxCount, 0) + 1,
    },
    fileFilter: (req, file, cb) => {
      const { kind } = fieldOf(file);
      return kind.accepts(file) ? cb(null, true) : cb(new ApiError(httpStatus.BAD_REQUEST, kind.typeMessage(file)));
    },
  }).fields(fields.map(({ name, maxCount }) => ({ name, maxCount })));

  return { handle, fields, tooManyFiles: tooManyFiles || fields[0].tooMany, otherField: OTHER_FIELD_MESSAGE };
};

const adminImages = (maxCount, tooMany) => ({
  name: "images",
  kind: KINDS.adminImage,
  maxCount,
  maxBytes: 20 * MB,
  tooMany,
  tooBig: tooBigWords(20 * MB, "Images must each be 20 MB or smaller."),
});
const adminVariantImages = {
  ...adminImages(20, "You can add up to 20 variant images per save, across all variants."),
  name: "variant_images",
};
const PRODUCT_IMAGES_TOO_MANY = "You can add up to 10 product images per save.";

// Each route's upload (upload.middleware.js FILE_ROUTES): the fields its form sends, with the
// form's own counts and sizes.
const UPLOADS = {
  // POST user/auth/register: the website sends text only; the shop has no profile photo.
  signUp: {
    handle: multer({ limits }).none(),
    fields: [],
    noFiles: "Sign-up doesn't take files. Remove the file and try again.",
  },

  // POST sourcing-requests/create: up to 10 images, as the form says. Cloudflare also caps the
  // whole request at about 100 MB (docs/deployment.md).
  sourcingRequest: fieldsUpload([
    {
      name: "images",
      kind: KINDS.referenceImage,
      maxCount: 10,
      maxBytes: 20 * MB,
      tooMany: "You can upload up to 10 images.",
      tooBig: tooBigWords(20 * MB, "Logo and reference images must each be 20 MB or smaller."),
    },
  ]),

  // POST product/cart: one design preview (supplier lines), and the graphics picked for a pre-made
  // product's options (customization_images: F21's rules, size and words).
  cart: fieldsUpload(
    [
      {
        name: "images",
        kind: KINDS.designPreview,
        maxCount: 1,
        maxBytes: 2 * MB,
        tooMany: "Send only one design preview.",
        tooBig: tooBigWords(2 * MB, "The design preview must be 2 MB or smaller."),
      },
      {
        name: "customization_images",
        kind: KINDS.graphic,
        maxCount: 10,
        maxBytes: graphicLimits.fileSize,
        tooMany: "You can upload up to 10 graphics in one add to cart, across all options.",
        tooBig: () => `Each file must be ${graphicLimits.fileSize / MB} MB or smaller.`,
      },
    ],
    { tooManyFiles: "Send one design preview and up to 10 graphics in one add to cart." },
  ),

  // Admin: POST product/create-product.
  productImages: fieldsUpload([adminImages(10, PRODUCT_IMAGES_TOO_MANY)]),
  // Admin: POST product/add-product-variants.
  variantImages: fieldsUpload([adminVariantImages]),
  // Admin: PUT product/manual/full and POST product/update.
  productAndVariantImages: fieldsUpload([adminImages(10, PRODUCT_IMAGES_TOO_MANY), adminVariantImages], {
    tooManyFiles: "You can add up to 10 product images and 20 variant images per save.",
  }),
  // Admin: a brand's logo, an industry's or use case's image, an add-on's image.
  oneImage: fieldsUpload([adminImages(1, "Send one image at a time.")]),
  // Admin: a gallery photo.
  galleryImage: fieldsUpload([adminImages(1, "Send one image per gallery photo.")]),
};

// POST /product/import, /pricing-template/import, /admin/user/import and their /preview: one CSV file, read in memory and never
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
};
