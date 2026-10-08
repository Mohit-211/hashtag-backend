const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const responseWrapper = require("../../config/responseWrapper");
const { sizeService } = require("../../services");

const createSize = catchAsync(async (req, res) => {
  const data = await sizeService.createSize(req.body);
  return responseWrapper(res, data, "Size Created", httpStatus.CREATED);
});

const getAllSizes = catchAsync(async (req, res) => {
  const data = await sizeService.getAllSizes();
  return responseWrapper(res, data, "", httpStatus.OK);
});

const getSizeById = catchAsync(async (req, res) => {
  const data = await sizeService.getSizeById(req.params.id);
  return responseWrapper(res, data, "", httpStatus.OK);
});

const updateSize = catchAsync(async (req, res) => {
  const data = await sizeService.updateSize (req.body);
  return responseWrapper(res, data, "Size Updated", httpStatus.OK);
});

const deleteSize = catchAsync(async (req, res) => {
  await sizeService.deleteSize(req.params.id);
  return responseWrapper(res, "", "Size Deleted", httpStatus.OK);
});

module.exports = {
  createSize,
  getAllSizes,
  getSizeById,
  updateSize,
  deleteSize,
};