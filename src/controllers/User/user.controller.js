const httpStatus = require('http-status');

const catchAsync = require('../../utils/catchAsync');
const ApiError = require('../../utils/ApiError');
const { userOpService } = require('../../services');
const pick = require('../../utils/pick');
const responseWrapper = require('../../config/responseWrapper');


const getProfile = catchAsync(async (req, res) => {
    const response = await userOpService.getProfile(req.body, req.headers);
    return responseWrapper(res, response, '');
});

const deactivateAccount = catchAsync(async (req, res) => {
    const response = await userOpService.deactivateAccount(req.body);
    return responseWrapper(res, response, 'Account Successfully Deactivated.');
});

const notificationToogle = catchAsync(async (req, res) => {
    const body = pick(req.body, ['user']);
    const response = await userOpService.notificationToogle(body);
    message = (response.notification_status === true) ? 'Notification turned On!' : 'Notification turned Off!';
    return responseWrapper(res, '', message);
});


module.exports = {
    getProfile,
    deactivateAccount,
    notificationToogle,
};