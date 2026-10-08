const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const responseWrapper = require("../../config/responseWrapper");
const { industryService } = require("../../services");

const createIndustry = catchAsync(async (req, res) => {
  const data = await industryService.createIndustry(req.body, req.files);
  return responseWrapper(res, data, "Industry Created", httpStatus.CREATED);
});

const getAllIndustries = catchAsync(async (req, res) => {
  const data = await industryService.getAllIndustries(req.query);
  return responseWrapper(res, data, "", httpStatus.OK);
});

const getIndustryById = catchAsync(async (req, res) => {
  const data = await industryService.getIndustryById(req.params.id);
  return responseWrapper(res, data, "", httpStatus.OK);
});

const updateIndustry = catchAsync(async (req, res) => {
  const data = await industryService.updateIndustry(
    req.params.id,
    req.body,
    req.files,
  );
  return responseWrapper(res, data, "Industry Updated", httpStatus.OK);
});

const deleteIndustry = catchAsync(async (req, res) => {
  await industryService.deleteIndustry(req.params.id);
  return responseWrapper(res, null, "Industry Deleted", httpStatus.OK);
});

const createUseCase = catchAsync(async (req, res) => {
  const data = await industryService.createUseCase(req.body, req.files);
  return responseWrapper(res, data, "Use Case Created", httpStatus.CREATED);
});

const getAllUseCasesDropdown = catchAsync(async (req, res) => {
  const data = await industryService.getAllUseCasesDropdown();

  return responseWrapper(res, data, "", httpStatus.OK);
});

const getAllUseCases = catchAsync(async (req, res) => {
  const data = await industryService.getAllUseCases(req.query);
  return responseWrapper(res, data, "", httpStatus.OK);
});

const getUseCaseById = catchAsync(async (req, res) => {
  const data = await industryService.getUseCaseById(req.params.id);
  return responseWrapper(res, data, "", httpStatus.OK);
});

const getUseCasesByIndustry = catchAsync(async (req, res) => {
  const data = await industryService.getUseCasesByIndustry(
    req.params.industry_id,
  );
  return responseWrapper(res, data, "", httpStatus.OK);
});

const updateUseCase = catchAsync(async (req, res) => {
  const data = await industryService.updateUseCase(
    req.params.id,
    req.body,
    req.files,
  );

  return responseWrapper(res, data, "Use Case Updated", httpStatus.OK);
});

const deleteUseCase = catchAsync(async (req, res) => {
  await industryService.deleteUseCase(req.params.id);

  return responseWrapper(res, null, "Use Case Deleted", httpStatus.OK);
});

const updateUseCaseParentCategories = catchAsync(async (req, res) => {
  const data = await industryService.updateUseCaseParentCategories(
    req.params.id,
    req.body,
  );

  return responseWrapper(res, data, "Parent Categories Updated", httpStatus.OK);
});

const getUseCaseParentCategories = catchAsync(async (req, res) => {
  const data = await industryService.getUseCaseParentCategories(req.params.id);

  return responseWrapper(res, data, "", httpStatus.OK);
});

const getProductsForMultipleUseCases = catchAsync(async (req, res) => {
  const { use_case_ids } = req.query;

  if (!use_case_ids) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "use_case_ids is required",
    );
  }

  const useCaseIds = use_case_ids
    .split(",")
    .map((id) => Number(id.trim()))
    .filter((id) => !Number.isNaN(id));

  const data = await industryService.getProductsForMultipleUseCases(
    useCaseIds,
    req.query,
  );

  return responseWrapper(res, data, "", httpStatus.OK);
});

const getUseCaseProducts = catchAsync(async (req, res) => {
  const data = await industryService.getUseCaseProducts(
    req.params.id,
    req.query,
  );
  return responseWrapper(res, data, "", httpStatus.OK);
});

const addProductsToUseCase = catchAsync(async (req, res) => {
  const data = await industryService.addProductsToUseCase(
    req.params.id,
    req.body.product_ids,
  );
  return responseWrapper(
    res,
    data,
    "Products added to use case",
    httpStatus.OK,
  );
});

const excludeProductsFromUseCase = catchAsync(async (req, res) => {
  const data = await industryService.excludeProductsFromUseCase(
    req.params.id,
    req.body.product_ids,
  );
  return responseWrapper(
    res,
    data,
    "Products excluded from use case",
    httpStatus.OK,
  );
});

const clearProductOverride = catchAsync(async (req, res) => {
  const data = await industryService.clearProductOverride(
    req.params.id,
    req.params.productId,
  );
  return responseWrapper(res, data, "Override cleared", httpStatus.OK);
});

const moveProductsBetweenUseCases = catchAsync(async (req, res) => {
  const { product_ids, from_use_case_id, to_use_case_id } = req.body;
  const data = await industryService.moveProductsBetweenUseCases(
    product_ids,
    from_use_case_id,
    to_use_case_id,
  );
  return responseWrapper(res, data, "Products moved", httpStatus.OK);
});

const getUseCasesForProduct = catchAsync(async (req, res) => {
  const data = await industryService.getUseCasesForProduct(
    req.params.productId,
  );
  return responseWrapper(res, data, "", httpStatus.OK);
});

module.exports = {
  createIndustry,
  getAllIndustries,
  getIndustryById,
  updateIndustry,
  deleteIndustry,

  createUseCase,
  getAllUseCasesDropdown,
  getAllUseCases,
  getUseCaseById,
  getUseCasesByIndustry,
  updateUseCase,
  deleteUseCase,

  updateUseCaseParentCategories,
  getUseCaseParentCategories,

  getUseCaseProducts,
  getProductsForMultipleUseCases,
  addProductsToUseCase,
  excludeProductsFromUseCase,
  clearProductOverride,
  moveProductsBetweenUseCases,
  getUseCasesForProduct

};
