const catchAsync = require('../../utils/catchAsync');
const { userOpService } = require('../../services');
const pick = require('../../utils/pick');
const responseWrapper = require('../../config/responseWrapper');


const getProfile = catchAsync(async (req, res) => {
    const response = await userOpService.getProfile(req.body, req.headers);
    return responseWrapper(res, response, '');
});

// Name and phone only, checked by validateUpdateProfileBody; the email can't be changed.
const updateProfile = catchAsync(async (req, res) => {
    const body = pick(req.body, ['user', 'name', 'mobile']);
    const response = await userOpService.updateProfile(body, req.headers);
    return responseWrapper(res, response, 'Profile updated.');
});

const deactivateAccount = catchAsync(async (req, res) => {
    const response = await userOpService.deactivateAccount(req.body);
    return responseWrapper(res, response, 'Account Successfully Deactivated.');
});

const notificationToogle = catchAsync(async (req, res) => {
    const body = pick(req.body, ['user']);
    const response = await userOpService.notificationToogle(body);
    const message = (response.notification_status === true) ? 'Notification turned On!' : 'Notification turned Off!';
    return responseWrapper(res, '', message);
});


module.exports = {
    getProfile,
    updateProfile,
    deactivateAccount,
    notificationToogle,
};