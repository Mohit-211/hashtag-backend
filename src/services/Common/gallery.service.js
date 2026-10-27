const fs = require("fs");
const path = require("path");
const httpStatus = require("http-status");

const { GalleryImage } = require("../../models");
const ApiError = require("../../utils/ApiError");
const { dirs } = require("../../config/storage");

// Gallery photos and captions (client decision Q56): the team adds, edits, orders and removes
// them in the admin panel, and the shop lists the active ones.

const MAX_CAPTION_LENGTH = 255;
const NOT_AN_IMAGE = "The gallery takes images only: JPG, PNG, WebP, AVIF or GIF.";

const toResponse = (image, forAdmin = false) => ({
  id: image.id,
  image_url: `${process.env.IMAGE_BASE_URL}/images/${image.file_name}`,
  caption: image.caption,
  sort_order: image.sort_order,
  ...(forAdmin && {
    is_active: image.is_active,
    created_at: image.created_at,
    updated_at: image.updated_at,
  }),
});

// A refused request's upload is deleted, so it doesn't stay on disk unused.
const discardUploads = (files) => {
  for (const file of Object.values(files || {}).flat()) {
    fs.promises.unlink(path.join(dirs.images, path.basename(file.filename))).catch(() => {});
  }
};

// The one image a create or update may carry, if any.
const uploadedImage = (files) => {
  const images = files?.images || [];
  if (images.length > 1) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Send one image per gallery photo.");
  }
  if (images[0] && !images[0].mimetype.startsWith("image/")) {
    throw new ApiError(httpStatus.BAD_REQUEST, NOT_AN_IMAGE);
  }
  return images[0] || null;
};

// The fields an admin may set; anything else in the body is ignored.
const pickFields = (body) => {
  const fields = {};

  if (body.caption !== undefined && body.caption !== null) {
    const caption = String(body.caption).trim();
    if (caption.length > MAX_CAPTION_LENGTH) {
      throw new ApiError(httpStatus.BAD_REQUEST, `The caption must be ${MAX_CAPTION_LENGTH} characters or fewer.`);
    }
    fields.caption = caption || null;
  }

  if (body.sort_order !== undefined && body.sort_order !== "") {
    const sortOrder = Number(body.sort_order);
    if (!Number.isInteger(sortOrder)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "sort_order must be a whole number.");
    }
    fields.sort_order = sortOrder;
  }

  if (body.is_active !== undefined) {
    fields.is_active = [true, "true", 1, "1"].includes(body.is_active);
  }

  return fields;
};

// Shop: the active photos, in the team's order.
const getGallery = async () => {
  const images = await GalleryImage.findAll({
    where: { is_active: true },
    order: [["sort_order", "ASC"], ["id", "DESC"]],
  });
  return images.map((image) => toResponse(image));
};

// Admin: every photo, hidden ones included.
const getGalleryAdmin = async () => {
  const images = await GalleryImage.findAll({
    order: [["sort_order", "ASC"], ["id", "DESC"]],
  });
  return images.map((image) => toResponse(image, true));
};

const createGalleryImage = async (body, files) => {
  try {
    const file = uploadedImage(files);
    if (!file) {
      throw new ApiError(httpStatus.BAD_REQUEST, "An image is required (form field images).");
    }

    const image = await GalleryImage.create({ ...pickFields(body), file_name: file.filename });
    return toResponse(image, true);
  } catch (error) {
    discardUploads(files);
    throw error;
  }
};

// A new image replaces the photo; the old file stays in storage.
const updateGalleryImage = async (id, body, files) => {
  try {
    const image = await GalleryImage.findByPk(id);
    if (!image) {
      throw new ApiError(httpStatus.NOT_FOUND, "Gallery photo not found");
    }

    const file = uploadedImage(files);
    const fields = pickFields(body);
    if (file) fields.file_name = file.filename;

    await image.update(fields);
    return toResponse(image, true);
  } catch (error) {
    discardUploads(files);
    throw error;
  }
};

const deleteGalleryImage = async (id) => {
  const image = await GalleryImage.findByPk(id);
  if (!image) {
    throw new ApiError(httpStatus.NOT_FOUND, "Gallery photo not found");
  }
  await image.destroy();
};

module.exports = {
  getGallery,
  getGalleryAdmin,
  createGalleryImage,
  updateGalleryImage,
  deleteGalleryImage,
};
