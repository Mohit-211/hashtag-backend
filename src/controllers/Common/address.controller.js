const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const responseWrapper = require("../../config/responseWrapper");
const { addressService } = require("../../services");

const addAddress = catchAsync(async (req, res) => {
  const data = await addressService.addAddress(req.body);
  return responseWrapper(res, data, "Address Created", httpStatus.CREATED);
});

const getAddresses = catchAsync(async (req, res) => {
  const data = await addressService.getAddresses(req.body);
  return responseWrapper(res, data, "", httpStatus.OK);
});

const updateAddress = catchAsync(async (req, res) => {
  const data = await addressService.updateAddress(req.body);
  return responseWrapper(res, data, "Address Updated", httpStatus.OK);
});



const deleteAddress = catchAsync(async (req, res) => {
  await addressService.deleteAddress(req.body, req.params.id);
  return responseWrapper(res, null, "Address Deleted", httpStatus.OK);
});



module.exports = {
	addAddress,
	getAddresses,
	updateAddress,
	deleteAddress,
};