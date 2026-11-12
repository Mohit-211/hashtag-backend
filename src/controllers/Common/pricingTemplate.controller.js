const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const { pricingTemplateService } = require("../../services/Common");
const responseWrapper = require("../../config/responseWrapper");

const getPricingTemplates = catchAsync(async (req, res) => {
  const templates = await pricingTemplateService.getPricingTemplates();
  return responseWrapper(res, templates, "", httpStatus.OK);
});

const createPricingTemplate = catchAsync(async (req, res) => {
  const template = await pricingTemplateService.createPricingTemplate(req.body, req.admin?.id ?? null);
  return responseWrapper(res, template, "Pricing template saved", httpStatus.CREATED);
});

const updatePricingTemplate = catchAsync(async (req, res) => {
  const template = await pricingTemplateService.updatePricingTemplate(req.params.id, req.body);
  return responseWrapper(res, template, "Pricing template updated", httpStatus.OK);
});

const deletePricingTemplate = catchAsync(async (req, res) => {
  await pricingTemplateService.deletePricingTemplate(req.params.id);
  return responseWrapper(res, "", "Pricing template deleted", httpStatus.OK);
});

module.exports = {
  getPricingTemplates,
  createPricingTemplate,
  updatePricingTemplate,
  deletePricingTemplate,
};
