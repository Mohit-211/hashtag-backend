/** @format */

const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const responseWrapper = require("../../config/responseWrapper");
const { sageService } = require("../../services");

const getSageSupplierTruth = catchAsync(async (req, res) => {
  const { prodEId } = req.params;

  const data = await sageService.getSageSupplierTruth(prodEId);

  if (!data) {
    return responseWrapper(res, null, "Product not found on supplier", httpStatus.NOT_FOUND);
  }

  return responseWrapper(res, data, "", httpStatus.OK);
});

const getCategories = catchAsync(async (req, res) => {
  const data = await sageService.getCategories();
  return responseWrapper(res, data, "", httpStatus.OK);
});

const syncSageCategories = catchAsync(async (req, res) => {
  const data = await sageService.syncSageCategories();
  return responseWrapper(res, data, "", httpStatus.OK);
});

const getSuppliersByCategory = catchAsync(async (req, res) => {
  const data = await sageService.getSuppliersByCategory(req.body);
  return responseWrapper(res, data, "", httpStatus.OK);
});

const getAllSageCategories = catchAsync(async (req, res) => {
  const data = await sageService.getAllSageCategories();
  return responseWrapper(res, data, "", httpStatus.OK);
});

const getSuppliers = catchAsync(async (req, res) => {
  const data = await sageService.getSuppliers();
  return responseWrapper(res, data, "", httpStatus.OK);
});

const searchProducts = catchAsync(async (req, res) => {
  const { page = 1, maxItems = 100 } = req.body;

  const data = await sageService.searchProducts({
    ...req.body,
    page,
    maxItems,
  });

  return responseWrapper(
    res,
    {
      products: data.products,
      pagination: {
        total: data.totalFound,
        page: data.page,
        limit: data.limit,
        totalPages: Math.ceil(data.totalFound / data.limit),
      },
    },
    "Products fetched successfully",
    httpStatus.OK,
  );
});

const getProductDetails = catchAsync(async (req, res) => {
  const { prodEId } = req.params;
  const data = await sageService.getProductDetails(prodEId);
  return responseWrapper(res, data, "", httpStatus.OK);
});

const importProduct = catchAsync(async (req, res) => {
  const data = await sageService.importSageProducts(req.body);
  return responseWrapper(res, data, "", httpStatus.CREATED);
});

const importSelectedSageProducts = catchAsync(async (req, res) => {
  const { prodEIds = [], batchNotes = "" } = req.body;

  const data = await sageService.importSelectedSageProducts(
    prodEIds,
    batchNotes,
  );

  return responseWrapper(
    res,
    data,
    "Products imported successfully",
    httpStatus.CREATED,
  );
});

const deleteSageProducts = catchAsync(async (req, res) => {
  const data = await sageService.deleteSageProducts(req.body);
  return responseWrapper(res, data, "", httpStatus.CREATED);
});

module.exports = {
  getSageSupplierTruth,
  getCategories,
  syncSageCategories,
  getAllSageCategories,
  getSuppliersByCategory,
  getSuppliers,
  searchProducts,
  getProductDetails,
  importProduct,
  importSelectedSageProducts,
  deleteSageProducts,
};
