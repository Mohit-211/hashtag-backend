const httpStatus = require('http-status');

const { Admin, Department, Role } = require('../models');
const validateEmail = require('../helpers/validateEmail');
const catchAsync = require('../utils/catchAsync');
const responseWrapper = require('../config/responseWrapper');
const config = require('../config/config');
const { rolesTypes } = require('../config/types');
const ApiError = require('../utils/ApiError');
const { getRequestToken, verifyJwt } = require('../utils/authToken');

const ADMIN_TOKEN_TYPE = 'admin';

const isSuperAdminRecord = (admin) =>
    (config.SUP_ADM_ROLE_ID && String(admin.role_id) === String(config.SUP_ADM_ROLE_ID)) ||
    admin.admin_role?.name === rolesTypes.SUP_ADM;

// Requires a valid admin token. The admin row is re-read on every request, so a
// deleted or deactivated admin, a role change, or a password change takes effect
// immediately. Sets req.admin, and req.body.user for the existing controllers.
const requireAdmin = catchAsync(async (req, res, next) => {
    if (!req.admin) {
        const token = getRequestToken(req);
        if (!token) {
            throw new ApiError(httpStatus.UNAUTHORIZED, 'Please sign in.');
        };

        const payload = verifyJwt(token);
        if (payload.typ !== ADMIN_TOKEN_TYPE || !payload.id) {
            throw new ApiError(httpStatus.UNAUTHORIZED, 'Session expired or invalid. Please sign in again.');
        };

        const admin = await Admin.findOne({
            where: { id: payload.id, is_active: true },
            include: [{ model: Role, as: 'admin_role', attributes: ['id', 'name'] }],
        });
        if (!admin) {
            throw new ApiError(httpStatus.UNAUTHORIZED, 'Session expired or invalid. Please sign in again.');
        };

        if (admin.password_changed_at && payload.iat * 1000 < new Date(admin.password_changed_at).getTime() - 1000) {
            throw new ApiError(httpStatus.UNAUTHORIZED, 'Your password was changed. Please sign in again.');
        };

        req.admin = admin;
    };

    req.body.user = {
        id: req.admin.id,
        role_id: req.admin.role_id,
        department_id: req.admin.department_id,
    };
    next();
});

// Use after requireAdmin.
const requireSuperAdmin = (req, res, next) => {
    if (!req.admin || !isSuperAdminRecord(req.admin)) {
        return next(new ApiError(httpStatus.FORBIDDEN, 'Only a Super Admin can do this.'));
    };
    next();
};

const validateCreateAdminBody = catchAsync(async (req, res, next) => {
    const { name, email, role_id, department_id } = req.body;
    if (!name || !email || !role_id || !department_id) {
        return responseWrapper(res, '', 'Please Enter Required Fields : [name || email || role_id || department_id]', httpStatus.BAD_REQUEST);
    };

    if (!validateEmail(email) || String(name).trim().length === 0) {
        return responseWrapper(res, '', 'Invalid Name or Email', httpStatus.BAD_REQUEST);
    };

    // Any role, Super Admin included: only a Super Admin reaches this route.
    const role = await Role.findByPk(parseInt(role_id));
    if (!role) return responseWrapper(res, '', 'Invalid Role Id', httpStatus.BAD_REQUEST);

    const department = await Department.findByPk(parseInt(department_id));
    if (!department) return responseWrapper(res, '', 'Invalid Department Id', httpStatus.BAD_REQUEST);

    if (await Admin.isEmailTaken(email)) {
        return responseWrapper(res, '', 'Email already taken', httpStatus.BAD_REQUEST);
    };
    next();
});

const validateLoginAdminBody = (req, res, next) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return responseWrapper(res, '', 'Please Enter Required Fields : [ email_id || password ]', httpStatus.BAD_REQUEST);
    };

    if (!validateEmail(email)) {
        return responseWrapper(res, '', 'Invalid Email', httpStatus.BAD_REQUEST);
    };
    next();
};

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

module.exports = {
    ADMIN_TOKEN_TYPE,
    isSuperAdminRecord,
    requireAdmin,
    requireSuperAdmin,
    validateCreateAdminBody,
    validateLoginAdminBody,
    validateResetPassordBody,
};
