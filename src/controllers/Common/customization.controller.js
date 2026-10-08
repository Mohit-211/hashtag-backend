const responseWrapper = require("../../config/responseWrapper");
const { customizationService } = require("../../services/Common");
const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");

/*
|--------------------------------------------------------------------------
| CUSTOMIZATION OPTIONS
|--------------------------------------------------------------------------
*/

const createCustomizationOption = catchAsync(async (req, res) => {
  const data = await customizationService.createCustomizationOption(req.body);

  return responseWrapper(
    res,
    data,
    "Customization option created successfully",
    httpStatus.CREATED,
  );
});

const getAllCustomizationOptions = catchAsync(async (req, res) => {
  const data = await customizationService.getAllCustomizationOptions(req.query);

  return responseWrapper(
    res,
    data,
    "Customization options fetched successfully",
    httpStatus.OK,
  );
});

const getCustomizationOptionById = catchAsync(async (req, res) => {
  const data = await customizationService.getCustomizationOptionById(
    req.params.id,
  );

  return responseWrapper(
    res,
    data,
    "Customization option fetched successfully",
    httpStatus.OK,
  );
});

const updateCustomizationOption = catchAsync(async (req, res) => {
  const data = await customizationService.updateCustomizationOption(
    req.params.id,
    req.body,
  );

  return responseWrapper(
    res,
    data,
    "Customization option updated successfully",
    httpStatus.OK,
  );
});

const deleteCustomizationOption = catchAsync(async (req, res) => {
  const data = await customizationService.deleteCustomizationOption(
    req.params.id,
  );

  return responseWrapper(
    res,
    data,
    data.message || "Customization option deleted successfully",
    httpStatus.OK,
  );
});

/*
|--------------------------------------------------------------------------
| VALUES
|--------------------------------------------------------------------------
*/

const createCustomizationOptionValue = catchAsync(async (req, res) => {
  const data = await customizationService.createCustomizationOptionValue(
    req.params.optionId,
    req.body,
  );

  return responseWrapper(
    res,
    data,
    "Customization option value created successfully",
    httpStatus.CREATED,
  );
});

const updateCustomizationOptionValue = catchAsync(async (req, res) => {
  const data = await customizationService.updateCustomizationOptionValue(
    req.params.id,
    req.body,
  );

  return responseWrapper(
    res,
    data,
    "Customization option value updated successfully",
    httpStatus.OK,
  );
});

const deleteCustomizationOptionValue = catchAsync(async (req, res) => {
  const data = await customizationService.deleteCustomizationOptionValue(
    req.params.id,
  );

  return responseWrapper(
    res,
    data,
    data.message || "Customization option value deleted successfully",
    httpStatus.OK,
  );
});

/*
|--------------------------------------------------------------------------
| VALUE PRICING
|--------------------------------------------------------------------------
| Previously these called `pricingService` (never imported -> ReferenceError
| -> 500 on every pricing request) and passed responseWrapper arguments in
| the wrong order. Pricing lives in customizationService.
*/

const getPricing = catchAsync(async (req, res) => {
  const data = await customizationService.getPricingByValueId(
    Number(req.params.valueId),
  );

  return responseWrapper(
    res,
    data,
    "Pricing fetched successfully",
    httpStatus.OK,
  );
});

const createPricing = catchAsync(async (req, res) => {
  const data = await customizationService.createPricing(
    Number(req.params.valueId),
    req.body,
  );

  return responseWrapper(
    res,
    data,
    "Pricing created successfully",
    httpStatus.CREATED,
  );
});

const updatePricing = catchAsync(async (req, res) => {
  const data = await customizationService.updatePricing(
    Number(req.params.pricingId),
    req.body,
  );

  return responseWrapper(
    res,
    data,
    "Pricing updated successfully",
    httpStatus.OK,
  );
});

const deletePricing = catchAsync(async (req, res) => {
  const data = await customizationService.deletePricing(
    Number(req.params.pricingId),
  );

  return responseWrapper(
    res,
    data,
    "Pricing deleted successfully",
    httpStatus.OK,
  );
});

/*
|--------------------------------------------------------------------------
| PRODUCT CUSTOMIZATIONS
|--------------------------------------------------------------------------
*/

const assignProductCustomizations = catchAsync(async (req, res) => {
  const data = await customizationService.assignProductCustomizations(
    req.params.productId,
    req.body.customizations,
  );

  return responseWrapper(
    res,
    data,
    "Product customizations updated successfully",
    httpStatus.OK,
  );
});

const getProductCustomizations = catchAsync(async (req, res) => {
  const data = await customizationService.getProductCustomizations(
    req.params.productId,
  );

  return responseWrapper(
    res,
    data,
    "Product customizations fetched successfully",
    httpStatus.OK,
  );
});

module.exports = {
  createCustomizationOption,
  getAllCustomizationOptions,
  getCustomizationOptionById,
  updateCustomizationOption,
  deleteCustomizationOption,
  createCustomizationOptionValue,
  updateCustomizationOptionValue,
  deleteCustomizationOptionValue,
  getPricing,
  createPricing,
  updatePricing,
  deletePricing,
  assignProductCustomizations,
  getProductCustomizations,
};