
const { Size } = require("../../models");
const ApiError = require("../../utils/ApiError");
const httpStatus = require("http-status");


const createSize = async (body) => {
  if (!body.product_id) {
    throw new Error("product_id is required");
  }

  return await Size.create(body);
};

const getAllSizes = async () => {
  return await Size.findAll({ where: { is_active: true } });
};

const getSizeById = async (id) => {
  const size = await Size.findByPk(id);
  if (!size) throw new ApiError(httpStatus.NOT_FOUND, "Size not found");
  return size;
};

const updateSize = async (body) => {
  const size = await Size.findByPk(body.id);
  if (!size) throw new ApiError(httpStatus.NOT_FOUND, "Size not found");

  await size.update(body);
  return size;
};

const deleteSize = async (id) => {
  const size = await Size.findByPk(id);
  if (!size) throw new ApiError(httpStatus.NOT_FOUND, "Size not found");

  await size.destroy();
  return true;
};

module.exports = {
  createSize,
  getAllSizes,
  getSizeById,
  updateSize,
  deleteSize,
};