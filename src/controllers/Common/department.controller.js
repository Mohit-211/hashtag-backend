const httpStatus = require('http-status');

const catchAsync = require('../../utils/catchAsync');
const ApiError = require('../../utils/ApiError');
const { departmentService } = require('../../services/Common');
const responseWrapper = require('../../config/responseWrapper');

const getAllDeparments = catchAsync(async (req, res) => {

    const departments = await departmentService.getAllDeparments();
    return responseWrapper(res, departments, '');
});

const createDepartment = catchAsync(async (req, res) => {

    const department = await departmentService.createDepartment(req.body);
    return responseWrapper(res, department, 'New department Created Successfully', httpStatus.CREATED);
});

const updateDepartment = catchAsync(async (req, res) => {

    const departmentDoc = await departmentService.updateDepartment(req.body, req.params.id);
    return responseWrapper(res, departmentDoc, 'Department Update Successfully');
});

const findDepartmentById = catchAsync(async (req, res) => {

    const departmentDoc = await departmentService.findDepartmentById(req.params.id);
    return responseWrapper(res, departmentDoc, '');
});

const deleteDepartment = catchAsync(async (req, res) => {

    await departmentService.deleteDepartment(req.params.id);
    return responseWrapper(res, '', 'Delete Successfull.', httpStatus.OK);
});

module.exports = {
    getAllDeparments,
    createDepartment,
    updateDepartment,
    findDepartmentById,
    deleteDepartment
};