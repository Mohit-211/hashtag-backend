const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const { graphicService } = require("../../services/Common");
const responseWrapper = require("../../config/responseWrapper");

const uploadGraphic = catchAsync(async (req, res) => {
  const graphic = await graphicService.uploadGraphic(req.body.user, req.files);
  return responseWrapper(res, graphic, "Graphic saved", httpStatus.CREATED);
});

const getGraphics = catchAsync(async (req, res) => {
  const graphics = await graphicService.getGraphics(req.body.user, req.query);
  return responseWrapper(res, graphics, "", httpStatus.OK);
});

module.exports = {
  uploadGraphic,
  getGraphics,
};
