const httpStatus = require('http-status');
const catchAsync = require('../../utils/catchAsync');
const { adminAuthService } = require('../../services');
const responseWrapper = require('../../config/responseWrapper');
const pick = require('../../utils/pick');

const LINK_SENT = 'If an account matches that email, we\'ve sent a link to it. Please check your inbox.';

const createAdminUser = catchAsync(async (req, res) => {
    await adminAuthService.createAdminUser(req.body);
    return responseWrapper(res, '', 'Admin created. They will receive an email to set their password.', httpStatus.CREATED);
});

const loginAdminUser = catchAsync(async (req, res) => {
    const response = await adminAuthService.loginAdminUser(req.body);
    return responseWrapper(res, response, '', httpStatus.OK);
});

// Signed-in password change.
const resetAdminPassword = catchAsync(async (req, res) => {
    const response = await adminAuthService.resetAdminPassword(req.body);
    return responseWrapper(res, response, 'Password Changed Successfully.', httpStatus.OK);
});

// Step 1 of "forgot password": email a reset link.
const forgotAdminPassword = catchAsync(async (req, res) => {
    await adminAuthService.forgotAdminPassword(pick(req.body, ['email']));
    return responseWrapper(res, '', LINK_SENT, httpStatus.OK);
});

// Step 2: the reset page posts the token from the link with the new password.
const resetAdminPasswordWithToken = catchAsync(async (req, res) => {
    const response = await adminAuthService.resetAdminPasswordWithToken(pick(req.body, ['token', 'password', 'confirm_password']));
    return responseWrapper(res, '', response, httpStatus.OK);
});

const getProfile = catchAsync(async (req, res) => {
  const response = await adminAuthService.getProfile(req.body);
  return responseWrapper(res, response, "Successfully get profile");
});

const getAllAdmins = catchAsync(async (req, res) => {
  const users = await adminAuthService.getAllAdmins();
  res.status(httpStatus.OK).send({
    code: httpStatus.OK,
    message: users ? "Success" : "Failed",
    data: users,
  });
});

const findAdminById = catchAsync(async (req, res) => {
  const adminDoc = await adminAuthService.findAdminById(req.params.id);
  return responseWrapper(res, adminDoc, "", httpStatus.OK);
});

const updateAdmin = catchAsync(async (req, res) => {
  const response = await adminAuthService.updateAdmin(req.params.id, req.body, req.admin);
  return responseWrapper(res, response, "Admin Updated Successfully");
});

const deleteAdmin = catchAsync(async (req, res) => {
  await adminAuthService.deleteAdmin(req.body, req.admin);
  res.status(httpStatus.OK).send({
    code: httpStatus.NO_CONTENT,
    message: "Deleted Successfull.",
    data: "",
  });
});

const setAdminPassword = catchAsync(async (req, res) => {
  await adminAuthService.setAdminPassword(req.params.id, pick(req.body, ["password", "confirm_password"]), req.admin);
  return responseWrapper(res, "", "Password set. Share it with the admin; they can change it after signing in.");
});

module.exports = {
    createAdminUser,
    loginAdminUser,
    resetAdminPassword,
    forgotAdminPassword,
    resetAdminPasswordWithToken,
    getProfile,
    getAllAdmins,
    findAdminById,
    updateAdmin,
    deleteAdmin,
    setAdminPassword,
};
