const httpStatus = require('http-status');
const { Video } = require('../../models');
const ApiError = require('../../utils/ApiError');

const createVideo = async (body) => {
    const video = await Video.create(body);
    if (!video) throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Video upload failed');
    return video;
};

const getAllVideos = async () => {
    return Video.findAll({ where: { is_active: true } });
};

module.exports = {
    createVideo,
    getAllVideos
};
