const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const responseWrapper = require("../../config/responseWrapper");
const { brandService } = require("../../services");

const createBrand = catchAsync(async (req, res) => {
  const data = await brandService.createBrand(req.body,req.files);
  return responseWrapper(res, data, "Brand Created", httpStatus.CREATED);
});

const getAllBrands = catchAsync(async (req, res) => {
  const data = await brandService.getAllBrands(req.query);
  return responseWrapper(res, data, "", httpStatus.OK);
});

const getAllSSBrands = catchAsync(async (req, res) => {
  const data = await brandService.getAllSSBrands(req.query);
  return responseWrapper(res, data, "", httpStatus.OK);
});

const getBrandById = catchAsync(async (req, res) => {
  const data = await brandService.getBrandById(req.params.id);
  return responseWrapper(res, data, "", httpStatus.OK);
});

const updateBrand = catchAsync(async (req, res) => {
  const data = await brandService.updateBrand(req.body, req.params.id);
  return responseWrapper(res, data, "Brand Updated", httpStatus.OK);
});

const deleteBrand = catchAsync(async (req, res) => {
  await brandService.deleteBrand(req.params.id);
  return responseWrapper(res, "", "Brand Deleted", httpStatus.OK);
});

const publishBrands = catchAsync(async (req, res) => {
  await brandService.publishBrand(req.body,req.files);
  return responseWrapper(
    res,
    "",
    "Brands published successfully",
    httpStatus.OK,
  );
});

const getPublishedBrands = catchAsync(async (req, res) => {
  const data = await brandService.getPublishedBrands(req.query);
  return responseWrapper(res, data, "", httpStatus.OK);
});

const createManualBrand = catchAsync(async (req, res) => {
  const data = await brandService.createManualBrand(req.body,req.files);
  return responseWrapper(res, data, "Brand Created", httpStatus.CREATED);
});

// import brands from s&s
const syncSSBrands = catchAsync(async (req, res) => {
  const data = await brandService.syncSSBrands();
  return responseWrapper(res, data, "Brands Synced from S&S", httpStatus.OK);
});

module.exports = {
  createBrand,
  getAllBrands,
  getAllSSBrands,
  getBrandById,
  updateBrand,
  deleteBrand,
  publishBrands,
  getPublishedBrands,
  createManualBrand,
  syncSSBrands,
};
