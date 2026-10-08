const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const responseWrapper = require("../../config/responseWrapper");
const { sourcingRequestService } = require("../../services/Common");


const createSourcingRequest = catchAsync(async (req, res) => {
  const data = await sourcingRequestService.createSourcingRequest(
    req.body,
    req.files,
  );

  return responseWrapper(
    res,
    data,
    "Sourcing request submitted successfully.",
    httpStatus.CREATED,
  );
});

const getAllSourcingRequests = catchAsync(async (req, res) => {
  const data = await sourcingRequestService.getAllSourcingRequests(req.query);

  return responseWrapper(
    res,
    data,
    "Sourcing requests fetched successfully.",
    httpStatus.OK,
  );
});

const updateSourcingRequest = catchAsync(async (req, res) => {
  const data = await sourcingRequestService.updateSourcingRequest(
    req.params.id,
    req.body,
  );

  return responseWrapper(
    res,
    data,
    "Sourcing request updated successfully.",
    httpStatus.OK,
  );
});

module.exports = {
  createSourcingRequest,
  getAllSourcingRequests,
  updateSourcingRequest,
};
