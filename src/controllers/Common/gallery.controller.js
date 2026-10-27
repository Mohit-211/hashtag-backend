const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const { galleryService } = require("../../services/Common");
const responseWrapper = require("../../config/responseWrapper");

const getGallery = catchAsync(async (req, res) => {
  const images = await galleryService.getGallery();
  return responseWrapper(res, images, "", httpStatus.OK);
});

const getGalleryAdmin = catchAsync(async (req, res) => {
  const images = await galleryService.getGalleryAdmin();
  return responseWrapper(res, images, "", httpStatus.OK);
});

const createGalleryImage = catchAsync(async (req, res) => {
  const image = await galleryService.createGalleryImage(req.body, req.files);
  return responseWrapper(res, image, "Gallery photo added", httpStatus.CREATED);
});

const updateGalleryImage = catchAsync(async (req, res) => {
  const image = await galleryService.updateGalleryImage(req.params.id, req.body, req.files);
  return responseWrapper(res, image, "Gallery photo updated", httpStatus.OK);
});

const deleteGalleryImage = catchAsync(async (req, res) => {
  await galleryService.deleteGalleryImage(req.params.id);
  return responseWrapper(res, "", "Gallery photo removed", httpStatus.OK);
});

module.exports = {
  getGallery,
  getGalleryAdmin,
  createGalleryImage,
  updateGalleryImage,
  deleteGalleryImage,
};
