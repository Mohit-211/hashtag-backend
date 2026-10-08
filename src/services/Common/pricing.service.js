const httpStatus = require("http-status");
const ApiError = require("../../utils/ApiError");
const { PricingMarkup } = require("../../models");


const getAllPricingMarkup = async () => {
  try {
    return await PricingMarkup.findAll({
      where: {
        is_active: true,
      },

      order: [["supplier", "ASC"]],
    });
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};


const updatePricingMarkup = async (id, body) => {
  try {
    const pricing = await PricingMarkup.findOne({
      where: {
        id,
        is_active: true,
      },
    });

    if (!pricing) {
      throw new ApiError(httpStatus.NOT_FOUND, "Pricing markup not found");
    }

    await pricing.update({
      markup_percent: body.markup_percent,
    });

    return pricing;
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};



module.exports = {
  getAllPricingMarkup,
  updatePricingMarkup,

};