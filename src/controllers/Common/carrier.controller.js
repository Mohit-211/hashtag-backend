const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const responseWrapper = require("../../config/responseWrapper");
const { carrierService } = require("../../services");

const syncCarriers = catchAsync(async (req, res) => {
  const data = await carrierService.syncCarriers();
  return responseWrapper(res, data, "Carriers Synced", httpStatus.OK);
});

const syncServices = catchAsync(async (req, res) => {
  const data = await carrierService.syncServices();
  return responseWrapper(res, data, "Services Synced", httpStatus.OK);
});

const getCarriers = catchAsync(async (req, res) => {
  const data = await carrierService.getCarriers();
  return responseWrapper(res, data, "", httpStatus.OK);
});

const getServicesByCarrier = catchAsync(async (req, res) => {
  const data = await carrierService.getServicesByCarrier(req.params.carrier_id);
  return responseWrapper(res, data, "", httpStatus.OK);
});



module.exports = {
  syncCarriers,
  syncServices,
  getCarriers,
  getServicesByCarrier,
};