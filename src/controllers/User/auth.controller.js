const httpStatus = require('http-status');

const validatePassword = require('../../helpers/validatePassword');
const catchAsync = require('../../utils/catchAsync');
const ApiError = require('../../utils/ApiError');
const { userAuthService } = require('../../services');
const pick = require('../../utils/pick');
const responseWrapper = require('../../config/responseWrapper');


const sendOTP = catchAsync(async (req, res) => {

    const body = pick(req.body, ['email', 'type']);
    const headers = pick(req.headers, ['role_id']);
    let response = await userAuthService.sendOTP(body, headers);
    return responseWrapper(res, response, 'OTP has been Sent To Your Email');
});

const verifyOTP = catchAsync(async (req, res) => {

    const status = await userAuthService.verifyOTP(req.body.email, req.body.otp, req.body.type, req.headers.role_id);
    if (!status) {
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Ineternal Server Error');
    };
    return responseWrapper(res, status, 'OTP has been verified. Please Create Your Profile.', httpStatus.OK);

});

const register = catchAsync(async (req, res) => {

    const body = pick(req.body, ['name', 'email', 'mobile', 'password', 'confirm_password']);
    const headers = pick(req.headers, ['role_id']);
    let response = await userAuthService.register(body, req.files, headers);
    return responseWrapper(res, response, 'User Created Successfully. Please Check Your Email to verify Your Account.', httpStatus.CREATED);
});

const login = catchAsync(async (req, res) => {
    const response = await userAuthService.login(req.body, req.headers);
    return responseWrapper(res, response, 'Successfully Logged in.');
});

const resetPassword = catchAsync(async (req, res) => {
    const { new_password, confirm_password } = req.body;

    if (!validatePassword(new_password)) {

        return responseWrapper(res, '', 'Password should have a minimum length of 8 characters and must have at least 2 digits and No Blank Space', httpStatus.BAD_REQUEST);
    };

    if (new_password !== confirm_password) {
        return responseWrapper(res, '', 'Password and Confirm Password must be equal', httpStatus.BAD_REQUEST);
    };

    const response = await userAuthService.resetPassword(req.body);
    return responseWrapper(res, response, 'Password changed Successfully.');
});

const forgotPassword = catchAsync(async (req, res) => {

    const response = await userAuthService.forgotPassword(req.body);
    return responseWrapper(res, response, 'Password changed Successfully.');
});

const logout = catchAsync(async (req, res) => {
    const response = await userAuthService.logout(req.body, req.headers);
    return responseWrapper(res, response, 'Successfully Logged out.');
});


module.exports = {
    register,
    login,
    resetPassword,
    sendOTP,
    verifyOTP,
    forgotPassword,
    logout
};