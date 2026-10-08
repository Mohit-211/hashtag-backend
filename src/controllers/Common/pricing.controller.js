const catchAsync = require("../../utils/catchAsync");
const { pricingService } = require("../../services");
const responseWrapper = require("../../config/responseWrapper");

const getAllPricingMarkup = catchAsync(async (req, res) => {
  const data = await pricingService.getAllPricingMarkup();
  return responseWrapper(res, data, "");
});


const updatePricingMarkup = catchAsync(async (req, res) => {
  const pricingDoc = await pricingService.updatePricingMarkup(
    req.params.id,
    req.body,
  );

  return responseWrapper(
    res,
    pricingDoc,
    "Pricing Markup Updated Successfully",
  );
});

module.exports = {
  getAllPricingMarkup,
  updatePricingMarkup,
};
