const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const { dashboardService } = require("../../services/Admin");
const responseWrapper = require("../../config/responseWrapper");

// Live figures: never kept by the browser or a proxy.
const answer = (res, data) => {
  res.set("Cache-Control", "no-store");
  return responseWrapper(res, data, "", httpStatus.OK);
};

const getOverview = catchAsync(async (req, res) => answer(res, await dashboardService.getOverview(req.query)));
const getTrend = catchAsync(async (req, res) => answer(res, await dashboardService.getTrend(req.query)));
const getTop = catchAsync(async (req, res) => answer(res, await dashboardService.getTop(req.query)));
const getCustomers = catchAsync(async (req, res) => answer(res, await dashboardService.getCustomers(req.query)));
const getActivity = catchAsync(async (req, res) => answer(res, await dashboardService.getActivity(req.query)));

module.exports = { getOverview, getTrend, getTop, getCustomers, getActivity };
