const httpStatus = require("http-status");
const pick = require("../../utils/pick");
const catchAsync = require("../../utils/catchAsync");
const responseWrapper = require("../../config/responseWrapper");
const { parentCategoryService } = require("../../services");

const createParentCategory = catchAsync(async (req, res) => {
  const data = await parentCategoryService.createParentCategory(req.body);
  return responseWrapper(
    res,
    data,
    "Parent Category Created Successfully",
    httpStatus.CREATED,
  );
});

const getAllParentCategories = catchAsync(async (req, res) => {
  const data = await parentCategoryService.getAllParentCategories(req.query);

  return responseWrapper(res, data, "");
});

const findParentCategoryById = catchAsync(async (req, res) => {
  const data = await parentCategoryService.findParentCategoryById(
    req.params.id,
  );

  return responseWrapper(res, data, "");
});

const updateParentCategory = catchAsync(async (req, res) => {
  const data = await parentCategoryService.updateParentCategory(
    req.body,
    req.params.id,
  );

  return responseWrapper(res, data, "Parent Category Updated Successfully");
});

const deleteParentCategory = catchAsync(async (req, res) => {
  await parentCategoryService.deleteParentCategory(req.body);

  return responseWrapper(res, "", "Delete Successful", httpStatus.OK);
});

const mapCategoriesToParent = catchAsync(async (req, res) => {
  const data = await parentCategoryService.mapCategoriesToParent(req.body);

  return responseWrapper(res, data, "Categories mapped successfully");
});

const getParentCategoriesForCategories = catchAsync(async (req, res) => {
  // GET /parent-category/for-categories?ids=12,45,90
  const ids = (req.query.ids || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const data =
    await parentCategoryService.getParentCategoriesForCategories(ids);

  return responseWrapper(res, data, "");
});

const addCategoryToParent = catchAsync(async (req, res) => {
  const data = await parentCategoryService.addCategoryToParent(req.body);

  return responseWrapper(res, data, "Category added to Parent Category");
});

const removeCategoryFromParent = catchAsync(async (req, res) => {
  const data = await parentCategoryService.removeCategoryFromParent(req.body);

  return responseWrapper(res, data, "Category removed from Parent Category");
});

module.exports = {
  createParentCategory,
  getAllParentCategories,
  findParentCategoryById,
  updateParentCategory,
  deleteParentCategory,
  mapCategoriesToParent,
  getParentCategoriesForCategories,
  addCategoryToParent,
  removeCategoryFromParent
};
