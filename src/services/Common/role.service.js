const httpStatus = require('http-status');

const { Role } = require('../../models');
const ApiError = require('../../utils/ApiError');


const createRole = async (reqBody) => {
    try {
        const roleObj = {
            name: reqBody.name,
            abbreviation: reqBody.abbreviation
        };
        const roleDoc = await Role.create(roleObj);
        if (!roleDoc) {
            throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to create new Role');
        }
        return roleDoc ? true : false;

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
};

const updateRole = async (reqBody, id) => {
    try {
        const roleDoc = await Role.findByPk(id);
        let temp = [];
        if (!roleDoc) {
            throw new ApiError(httpStatus.NOT_FOUND, 'Role not found');
        };
        if (reqBody.name && typeof reqBody.name !== 'undefined' && reqBody.name !== '') {
            roleDoc['name'] = reqBody.name;
            temp.push(1)
        };
        if (reqBody.abbreviation && typeof reqBody.abbreviation !== 'undefined' && reqBody.abbreviation !== '') {
            roleDoc['abbreviation'] = reqBody.abbreviation
            temp.push(2)
        };
        if (temp.length > 0 && temp.length < 2) throw new ApiError(httpStatus.NOT_FOUND, 'Name and Abbreviation both needed.');
        await roleDoc.save();
        return roleDoc ? roleDoc : {};

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
};

const findRoleById = async (id) => {
    try {
        const isRoleIdValid = await Role.findByPk(id);
        return isRoleIdValid
    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
};

const getAllRoles = async () => {

    try {
        const roleDoc = await Role.findAll({ where: { is_active: 1 } });
        if (!roleDoc) {
            throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to create new Role.');
        };
        return roleDoc;
    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
};

const deleteRole = async (id) => {
    try {
        const roleDoc = await Role.findByPk(id);
        if (!roleDoc) {
            throw new ApiError(httpStatus.NOT_FOUND, 'Role not found');
        }
        await roleDoc.destroy();

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
};

module.exports = {
    findRoleById,
    createRole,
    getAllRoles,
    deleteRole,
    updateRole
};