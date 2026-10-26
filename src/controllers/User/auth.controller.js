const httpStatus = require('http-status');

const validatePassword = require('../../helpers/validatePassword');
const { PASSWORD_RULES } = require('../../helpers/validatePassword');
const catchAsync = require('../../utils/catchAsync');
const { userAuthService } = require('../../services');
const pick = require('../../utils/pick');
const responseWrapper = require('../../config/responseWrapper');
const { UNVERIFIED_ACCOUNT_HOURS } = require('../../config/accountPolicy');

const LINK_SENT = 'If an account matches that email, we\'ve sent a link to it. Please check your inbox.';

const register = catchAsync(async (req, res) => {
    const body = pick(req.body, ['name', 'email', 'mobile', 'password', 'confirm_password']);
    const headers = pick(req.headers, ['role_id']);
    const response = await userAuthService.register(body, req.files, headers);
    return responseWrapper(res, response, `Account created. Please check your email and click the verification link within ${UNVERIFIED_ACCOUNT_HOURS} hours.`, httpStatus.CREATED);
});

const verifyEmail = catchAsync(async (req, res) => {
    const response = await userAuthService.verifyEmail(req.body.token);
    return responseWrapper(res, response, 'Your email has been verified. You can now sign in.');
});

const resendVerification = catchAsync(async (req, res) => {
    await userAuthService.resendVerification(pick(req.body, ['email']), pick(req.headers, ['role_id']));
    return responseWrapper(res, '', LINK_SENT);
});

const login = catchAsync(async (req, res) => {
    const response = await userAuthService.login(req.body, req.headers);
    return responseWrapper(res, response, 'Successfully Logged in.');
});

// Signed-in password change.
const resetPassword = catchAsync(async (req, res) => {
    const { new_password, confirm_password } = req.body;

    if (!validatePassword(new_password)) {
        return responseWrapper(res, '', PASSWORD_RULES, httpStatus.BAD_REQUEST);
    };

    if (new_password !== confirm_password) {
        return responseWrapper(res, '', 'Password and Confirm Password must be equal', httpStatus.BAD_REQUEST);
    };

    const response = await userAuthService.resetPassword(req.body);
    return responseWrapper(res, response, 'Password changed Successfully.');
});

// Step 1 of "forgot password": email a reset link.
const forgotPassword = catchAsync(async (req, res) => {
    await userAuthService.forgotPassword(pick(req.body, ['email']), pick(req.headers, ['role_id']));
    return responseWrapper(res, '', LINK_SENT);
});

// Step 2: the reset page posts the token from the link with the new password.
const resetPasswordWithToken = catchAsync(async (req, res) => {
    await userAuthService.resetPasswordWithToken(pick(req.body, ['token', 'password', 'confirm_password']));
    return responseWrapper(res, '', 'Your password has been changed. Please sign in with your new password.');
});

const logout = catchAsync(async (req, res) => {
    const response = await userAuthService.logout(req.body, req.headers);
    return responseWrapper(res, response, 'Successfully Logged out.');
});

module.exports = {
    register,
    verifyEmail,
    resendVerification,
    login,
    resetPassword,
    forgotPassword,
    resetPasswordWithToken,
    logout
};
