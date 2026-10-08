const httpStatus = require('http-status');
const catchAsync = require('../../utils/catchAsync');
const responseWrapper = require('../../config/responseWrapper');
const { packageService } = require('../../services');

const createPackage = catchAsync(async (req, res) => {
    const data = await packageService.createPackage(req.body);
    return responseWrapper(res, data, 'Package Created', httpStatus.CREATED);
});

const getAllPackages = catchAsync(async (req, res) => {
    const data = await packageService.getAllPackages();
    return responseWrapper(res, data, '', httpStatus.OK);
});

module.exports = {
    createPackage,
    getAllPackages
};
