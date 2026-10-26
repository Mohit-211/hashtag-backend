const httpStatus = require('http-status');

const { Op } = require('sequelize');
const { User, UserToken, Profile } = require('../models');
const validateEmail = require('../helpers/validateEmail');
const validatePassword = require('../helpers/validatePassword');
const { PASSWORD_RULES } = require('../helpers/validatePassword');
const { tokenTypes, userStatusTypes } = require('../config/types');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { getRequestToken, verifyJwt } = require('../utils/authToken');

const config = require('../config/config');
const responseWrapper = require('../config/responseWrapper');

const validateRegisterUserBody = catchAsync(async (req, res, next) => {
    const { name, email, mobile, password, confirm_password } = req.body;
    const { role_id } = req.headers;

    if (!name || !email || !mobile || !password || !confirm_password) {
        return responseWrapper(res, '', 'Please Enter Required Fields : [ name || email || mobile || password || confirm_password ]', httpStatus.BAD_REQUEST);
    };

    if (!validateEmail(email) || String(name).trim().length === 0) {
        return responseWrapper(res, '', 'Invalid Name or Email', httpStatus.BAD_REQUEST);
    };

    if (await User.isEmailTaken(email, role_id)) {
        return responseWrapper(res, '', 'An account with this email already exists. If you haven\'t verified it yet, use the link in your email or request a new one.', httpStatus.BAD_REQUEST);
    };

    if (!validatePassword(password)) {
        return responseWrapper(res, '', PASSWORD_RULES, httpStatus.BAD_REQUEST);
    };

    if (password !== confirm_password) {
        return responseWrapper(res, '', 'Password and Confirm Password must be equal.', httpStatus.BAD_REQUEST);
    };
    next();
});

const validateSignInReqBody = catchAsync(async (req, res, next) => {
    const { email, password } = req.body;

    if (!email || !password) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Please Enter Required Fields : [email, password] ');
    };
    req.body.ip_address = req.ip;

    next();
});

// Requires a customer access token that is still active in user_tokens.
// Sets req.body.user (with profile), req.body.tokenDoc and req.body.ip_address.
const verifyAuthJWTToken = catchAsync(async (req, res, next) => {
    const token = getRequestToken(req);
    if (!token) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate');
    };

    const payload = verifyJwt(token);
    if (payload.type !== tokenTypes.ACCESS || !payload.sub) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'Session expired or invalid. Please sign in again.');
    };

    const tokenDoc = await UserToken.findOne({
        where: {
            token: token,
            token_type: tokenTypes.ACCESS,
            user_id: payload.sub,
            is_active: true
        }
    });
    if (!tokenDoc) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'Session expired or invalid. Please sign in again.');
    };

    const user = await User.findOne({
        where: {
            id: tokenDoc.user_id,
            is_active: true,
            role_id: tokenDoc.role_id,
            status: { [Op.notIn]: [userStatusTypes.PENDING, userStatusTypes.REJECTED] },
        },
        include : [
            {
                model: Profile,
                as: 'user_profile',
                attributes: ['name', 'dialing_code', 'mobile', 'is_active', 'created_at'],
            },
        ]
    });
    if (!user) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'Session expired or invalid. Please sign in again.');
    };

    req.headers.role_id = String(user.role_id);
    req.body.user = user;
    req.body.tokenDoc = tokenDoc;
    req.body.ip_address = req.ip;
    next();
});

const validateResetPassordBody = (req, res, next) => {
    const { old_password, new_password, confirm_password } = req.body;

    if (!old_password || !new_password || !confirm_password) {
        return responseWrapper(res, '', 'Please Enter Required Fields : [ old_password || new_password || confirm_password ]', httpStatus.BAD_REQUEST);
    };

    if (new_password !== confirm_password) {
        return responseWrapper(res, '', 'New Password and Confirm Password Must Be Equal', httpStatus.BAD_REQUEST);
    };
    next();
};

// Customer endpoints always act on the customer role. The client used to be able to
// pick any role_id through this header. The old name is kept because payment.route.js
// (not changed in this round) still uses it.
const useCustomerRole = (req, res, next) => {
    req.headers.role_id = String(config.USR_ROLE_ID);
    next();
};

module.exports = {
    validateRegisterUserBody,
    verifyAuthJWTToken,
    validateResetPassordBody,
    useCustomerRole,
    setRoleIdIfNotPresent: useCustomerRole,
    validateSignInReqBody,
};
