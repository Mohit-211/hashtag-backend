const responseWrapper = require("../../config/responseWrapper");
const { addonProductService } = require("../../services");

const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");

const createAddOnProduct = catchAsync(async (req, res) => {
  const addon = await addonProductService.createAddOnProduct(
    req.body,
    req.files
  );

  return responseWrapper(
    res,
    addon,
    "Add-on Product Created Successfully",
    httpStatus.CREATED
  );
});

const getAllAddOnProducts = catchAsync(async (req, res) => {
  const data = await addonProductService.getAllAddOnProducts(
    req.query
  );

  return responseWrapper(
    res,
    data,
    "Add-on Products Fetched Successfully",
    httpStatus.OK
  );
});

const getAddOnProductById = catchAsync(async (req, res) => {
  const addon = await addonProductService.getAddOnProductById(
    req.params.id
  );

  return responseWrapper(
    res,
    addon,
    "Add-on Product Fetched Successfully",
    httpStatus.OK
  );
});

const updateAddOnProduct = catchAsync(async (req, res) => {
  const addon = await addonProductService.updateAddOnProduct(
    req.params.id,
    req.body,
    req.files
  );

  return responseWrapper(
    res,
    addon,
    "Add-on Product Updated Successfully",
    httpStatus.OK
  );
});

const deleteAddOnProduct = catchAsync(async (req, res) => {
  const result = await addonProductService.deleteAddOnProduct(
    req.params.id
  );

  return responseWrapper(
    res,
    result,
    "Add-on Product Deleted Successfully",
    httpStatus.OK
  );
});

const assignProductAddOns = catchAsync(async (req, res) => {
  const data = await addonProductService.assignProductAddOns(
    req.params.productId,
    req.body.addons
  );

  return responseWrapper(
    res,
    data,
    "Product Add-ons Updated Successfully",
    httpStatus.OK
  );
});

const getProductAddOns = catchAsync(async (req, res) => {
  const data = await addonProductService.getProductAddOns(
    req.params.productId
  );

  return responseWrapper(
    res,
    data,
    "Product Add-ons Fetched Successfully",
    httpStatus.OK
  );
});

module.exports = {
  createAddOnProduct,
  getAllAddOnProducts,
  getAddOnProductById,
  updateAddOnProduct,
  deleteAddOnProduct,
  assignProductAddOns,
  getProductAddOns,
};