const httpStatus = require('http-status');
const { Package } = require('../../models');
const ApiError = require('../../utils/ApiError');

const createPackage = async (body) => {
    const pkg = await Package.create(body);
    if (!pkg) throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Package creation failed');
    return pkg;
};

const getAllPackages = async () => {
    return Package.findAll({ where: { is_active: true } });
};

const updatePackage = async (id, body) => {
    const pkg = await Package.findByPk(id);
    if (!pkg) throw new ApiError(httpStatus.NOT_FOUND, 'Package not found');
    await pkg.update(body);
    return pkg;
};

const deletePackage = async (id) => {
    const pkg = await Package.findByPk(id);
    if (!pkg) throw new ApiError(httpStatus.NOT_FOUND, 'Package not found');
    await pkg.destroy();
};

module.exports = {
    createPackage,
    getAllPackages,
    updatePackage,
    deletePackage
};
