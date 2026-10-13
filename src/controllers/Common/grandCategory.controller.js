const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const responseWrapper = require("../../config/responseWrapper");
const { grandCategoryService } = require("../../services");

const createGrandCategory = catchAsync(async (req, res) => {
  const data = await grandCategoryService.createGrandCategory(req.body);

  return responseWrapper(
    res,
    data,
    "Grand Category Created Successfully",
    httpStatus.CREATED
  );
});

const getAllGrandCategories = catchAsync(async (req, res) => {
  const data = await grandCategoryService.getAllGrandCategories(req.query);

  return responseWrapper(res, data, "");
});

const findGrandCategoryById = catchAsync(async (req, res) => {
  const data = await grandCategoryService.findGrandCategoryById(
    req.params.id
  );

  return responseWrapper(res, data, "");
});

const updateGrandCategory = catchAsync(async (req, res) => {
  const data = await grandCategoryService.updateGrandCategory(
    req.body,
    req.params.id
  );

  return responseWrapper(
    res,
    data,
    "Grand Category Updated Successfully"
  );
});

const deleteGrandCategory = catchAsync(async (req, res) => {
  await grandCategoryService.deleteGrandCategory(req.body);

  return responseWrapper(
    res,
    "",
    "Delete Successful",
    httpStatus.OK
  );
});

const mapParentsToGrand = catchAsync(async (req, res) => {
  const data = await grandCategoryService.mapParentsToGrand(req.body);

  return responseWrapper(
    res,
    data,
    "Parent Categories mapped successfully"
  );
});

const getGrandCategoriesForParents = catchAsync(async (req, res) => {
  // GET /grand-category/for-parents?ids=3,7
  const ids = (req.query.ids || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const data = await grandCategoryService.getGrandCategoriesForParents(ids);

  return responseWrapper(res, data, "");
});

const addParentToGrand = catchAsync(async (req, res) => {
  const data = await grandCategoryService.addParentToGrand(req.body);

  return responseWrapper(res, data, "Parent Category added to Grand Category");
});

const removeParentFromGrand = catchAsync(async (req, res) => {
  const data = await grandCategoryService.removeParentFromGrand(req.body);

  return responseWrapper(res, data, "Parent Category removed from Grand Category");
});


module.exports = {
  createGrandCategory,
  getAllGrandCategories,
  findGrandCategoryById,
  updateGrandCategory,
  deleteGrandCategory,
  mapParentsToGrand,
    getGrandCategoriesForParents,
  addParentToGrand,
  removeParentFromGrand
};