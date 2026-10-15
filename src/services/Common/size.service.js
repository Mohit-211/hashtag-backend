
const { Size } = require("../../models");
const ApiError = require("../../utils/ApiError");
const httpStatus = require("http-status");
const pick = require("../../utils/pick");

// Fields an admin may set on a size; anything else in the request body is ignored.
const SIZE_FIELDS = ["product_id", "name", "type", "display_style", "measurements", "is_active"];


const createSize = async (body) => {
  if (!body.product_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, "product_id is required");
  }

  return await Size.create(pick(body, SIZE_FIELDS));
};

const getAllSizes = async () => {
  return await Size.findAll({ where: { is_active: true } });
};

const getSizeById = async (id) => {
  const size = await Size.findByPk(id);
  if (!size) throw new ApiError(httpStatus.NOT_FOUND, "Size not found");
  return size;
};

// The size to update comes from the URL (PUT /size/:id), not the body.
const updateSize = async (id, body) => {
  const size = await Size.findByPk(id);
  if (!size) throw new ApiError(httpStatus.NOT_FOUND, "Size not found");

  await size.update(pick(body, SIZE_FIELDS));
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