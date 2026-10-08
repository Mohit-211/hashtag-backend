/** @format */

const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const { tierService } = require("../../services");
const responseWrapper = require("../../config/responseWrapper");
const ApiError = require("../../utils/ApiError");

const createTier = catchAsync(async (req, res) => {
  const data = await tierService.createTier(req.body);

  return responseWrapper(res, data, "Tier Created", httpStatus.CREATED);
});

const getAllTiers = catchAsync(async (req, res) => {
  const data = await tierService.getAllTiers();

  return responseWrapper(res, data, "Tiers Fetched", httpStatus.OK);
});

const getTierParentCategories = catchAsync(async (req, res) => {
  const data = await tierService.getTierParentCategories(
  req.params.id,
  req.query.use_case_id,
);

  return responseWrapper(res, data, "Parent Categories Fetched", httpStatus.OK);
});

const updateTierParentCategories = catchAsync(async (req, res) => {
  const data = await tierService.updateTierParentCategories(
    req.params.id,
    req.body,
  );

  return responseWrapper(res, data, "Parent Categories Updated", httpStatus.OK);
});

const getTierProducts = catchAsync(async (req, res) => {
  const data = await tierService.getTierProducts(req.params.id, req.query);

  return responseWrapper(res, data, "Tier Products Fetched", httpStatus.OK);
});

const addProductsToTier = catchAsync(async (req, res) => {
  const data = await tierService.addProductsToTier(
    req.params.id,
    req.body.product_ids,
    req.body.use_case_id,
  );

  return responseWrapper(res, data, "Products Added To Tier", httpStatus.OK);
});

const setProductTier = catchAsync(async (req, res) => {
  const data = await tierService.setProductTier(
    req.params.productId,
    req.body.tier_id,
    req.body.use_case_id,
  );

  return responseWrapper(res, data, "Product Tier Updated", httpStatus.OK);
});

const excludeProductFromAllTiers = catchAsync(async (req, res) => {
  await tierService.excludeProductFromAllTiers(
    req.params.productId,
    req.body.use_case_id,
  );

  return responseWrapper(
    res,
    null,
    "Product Excluded From All Tiers",
    httpStatus.OK,
  );
});

const clearProductTierOverride = catchAsync(async (req, res) => {
  await tierService.clearProductTierOverride(
    req.params.productId,
    req.body.use_case_id,
  );

  return responseWrapper(res, null, "Override Cleared", httpStatus.OK);
});

const getCurrentTiersForProducts = catchAsync(async (req, res) => {
  const ids = String(req.query.product_ids || "")
    .split(",")
    .map(Number)
    .filter(Boolean);

  const useCaseId = Number(req.query.use_case_id);

  if (!useCaseId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "use_case_id is required");
  }

  const data = await tierService.getCurrentTiersForProducts(ids, useCaseId);

  return responseWrapper(res, data, "Current Tiers Fetched", httpStatus.OK);
});

const bulkClearProductTierOverrides = catchAsync(async (req, res) => {
  await tierService.bulkClearProductTierOverrides(
    req.body.product_ids,
    req.body.use_case_id,
  );

  return responseWrapper(
    res,
    null,
    "Tier Removed From Products",
    httpStatus.OK,
  );
});

module.exports = {
  createTier,
  getAllTiers,
  getTierParentCategories,
  updateTierParentCategories,
  getTierProducts,
  addProductsToTier,
  setProductTier,
  excludeProductFromAllTiers,
  clearProductTierOverride,
  getCurrentTiersForProducts,
  bulkClearProductTierOverrides,
};
