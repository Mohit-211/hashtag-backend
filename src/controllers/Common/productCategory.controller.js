const httpStatus = require('http-status');
const pick = require('../../utils/pick');
const catchAsync = require('../../utils/catchAsync');
const { productCategoryService } = require('../../services/Common');
const responseWrapper = require('../../config/responseWrapper');


const createCategory = catchAsync(async (req, res) => {
    const body = pick(req.body, ['title']);
    const categoryDoc = await productCategoryService.createCategory(body);
    return responseWrapper(res, categoryDoc, 'New category Created Successfully', httpStatus.CREATED);
});

const getAllCategories = catchAsync(async (req, res) => {
   
    const categorys = await productCategoryService.getAllCategories(req.query);
    return responseWrapper(res, categorys, '');
});

const updateCategory = catchAsync(async (req, res) => {
    const body = pick(req.body, ['title', 'description']);
    const categoryDoc = await productCategoryService.updateCategory(body, req.params.id);
    return responseWrapper(res, categoryDoc, 'Category Update Successfully');
});

const findCategoryById = catchAsync(async (req, res) => {

    const categoryDoc = await productCategoryService.findCategoryById(req.params.id);
    return responseWrapper(res, categoryDoc, '');
});

const deleteCategory = catchAsync(async (req, res) => {

    await productCategoryService.deleteCategory(req.body);
    return responseWrapper(res, '', 'Delete Successfull.', httpStatus.OK);
});

const syncSSCategories = catchAsync(async (req, res) => {
   
    const categorys = await productCategoryService.syncSSCategories();
    return responseWrapper(res, categorys, '');
});

const getProductsWithoutParentCategory = catchAsync(async (req, res) => {
   
    const categorys = await productCategoryService.getProductsWithoutParentCategory();
    return responseWrapper(res, categorys, '');
});

module.exports = {
    findCategoryById,
    createCategory,
    getAllCategories,
    updateCategory,
    deleteCategory,
    syncSSCategories,
    getProductsWithoutParentCategory
};