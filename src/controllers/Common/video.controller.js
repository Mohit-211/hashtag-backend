const httpStatus = require('http-status');
const catchAsync = require('../../utils/catchAsync');
const responseWrapper = require('../../config/responseWrapper');
const { videoService } = require('../../services');

const createVideo = catchAsync(async (req, res) => {
    const data = await videoService.createVideo(req.body);
    return responseWrapper(res, data, 'Video Added', httpStatus.CREATED);
});

const getAllVideos = catchAsync(async (req, res) => {
    const data = await videoService.getAllVideos();
    return responseWrapper(res, data, '', httpStatus.OK);
});

module.exports = {
    createVideo,
    getAllVideos
};
