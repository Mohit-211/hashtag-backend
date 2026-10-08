
const httpStatus = require('http-status');

const catchAsync = require('../utils/catchAsync');
const { roleService } = require('../services');
const { rolesTypes } = require('../config/types');
const responseWrapper = require('../config/responseWrapper');
const ApiError = require('../utils/ApiError');


const isSuperAdmin = catchAsync(async (req, res, next) => {
    try {
        const roleDoc = await roleService.findRoleById(req.user.id);
        if (!roleDoc || roleDoc.name !== rolesTypes.SUP_ADM) {
            return responseWrapper(res, '', 'You are not authorized to access this api', httpStatus.UNAUTHORIZED);
        };
        next()

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
});

const isSubAdmin = catchAsync(async (req, res, next) => {
    try {
        const roleDoc = await roleService.findRoleById(req.user.id);
        if (roleDoc && (roleDoc.name === rolesTypes.SUP_ADM || roleDoc.name === rolesTypes.ADM)) {
            next()
        } else {
            return responseWrapper(res, '', 'You are not authorized to access this api', httpStatus.UNAUTHORIZED);
        };

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
});

const isAdmin = catchAsync(async (req, res, next) => {
    try {
        const roleDoc = await roleService.findRoleById(req.user.id);
        if (roleDoc && (roleDoc.name === rolesTypes.SUP_ADM || roleDoc.name === rolesTypes.ADM || roleDoc.name === rolesTypes.SUB_ADM)) {
            next()
        } else {
            return responseWrapper(res, '', 'You are not authorized to access this api', httpStatus.UNAUTHORIZED);
        };

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
});

const isEngineer = catchAsync(async (req, res, next) => {
    try {
        const roleDoc = await roleService.findRoleById(req.user.id);
        if (roleDoc && (roleDoc.name === rolesTypes.SUP_ADM || roleDoc.name === rolesTypes.ADM || roleDoc.name === rolesTypes.SUB_ADM || roleDoc.name === rolesTypes.ENG)) {
            return responseWrapper(res, '', 'You are not authorized to access this api', httpStatus.UNAUTHORIZED);
        };
        next()

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
});

const isEditor = catchAsync(async (req, res, next) => {
    try {
        const roleDoc = await roleService.findRoleById(req.user.id);
        if (roleDoc && (roleDoc.name === rolesTypes.SUP_ADM || roleDoc.name === rolesTypes.ADM || roleDoc.name === rolesTypes.SUB_ADM || roleDoc.name === rolesTypes.ENG || roleDoc.name === rolesTypes.EDTR)) {
            next()
        } else {
            return responseWrapper(res, '', 'You are not authorized to access this api', httpStatus.UNAUTHORIZED);
        };

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
});

module.exports = {
    isSuperAdmin,
    isSubAdmin,
    isAdmin,
    isEngineer,
    isEditor
};
