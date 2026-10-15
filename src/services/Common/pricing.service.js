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

    // A negative markup sells below cost (-100 makes every product of the supplier free).
    const markupPercent = Number(body.markup_percent);
    if (body.markup_percent === "" || body.markup_percent === null || !Number.isFinite(markupPercent) || markupPercent < 0 || markupPercent > 1000) {
      throw new ApiError(httpStatus.BAD_REQUEST, "markup_percent must be a number from 0 to 1000");
    }

    await pricing.update({
      markup_percent: markupPercent,
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