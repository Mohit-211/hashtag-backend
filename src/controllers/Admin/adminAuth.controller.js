const httpStatus = require('http-status');
const catchAsync = require('../../utils/catchAsync');
const { adminAuthService } = require('../../services');
const responseWrapper = require('../../config/responseWrapper');


const createAdminUser = catchAsync(async (req, res) => {

    await adminAuthService.createAdminUser(req.body);
    return responseWrapper(res, '', 'Admin Created Successfully.', httpStatus.CREATED);
});

const loginAdminUser = catchAsync(async (req, res) => {
    const response = await adminAuthService.loginAdminUser(req.body);
    responseWrapper(res, response, '', httpStatus.OK);
});

const resetAdminPassword = catchAsync(async (req, res) => {

    const response = await adminAuthService.resetAdminPassword(req.body);
    responseWrapper(res, response, '', httpStatus.OK);
});

const sendOTP = catchAsync(async (req, res) => {

    await adminAuthService.sendOTP(req.body.email);
    responseWrapper(res, '', 'OTP has been Sent To Your Email', httpStatus.OK);
});

const verifyOTP = catchAsync(async (req, res) => {

    const status = await adminAuthService.verifyOTP(req.body.email, req.body.otp, req.body.otp_type);
    if (!status) {
        responseWrapper(res, '', 'Ineternal Server Error', httpStatus.INTERNAL_SERVER_ERROR);
    };
    responseWrapper(res, status, 'OTP has been verified', httpStatus.OK);
});

const forgotAdminPassword = catchAsync(async (req, res) => {

    const response = await adminAuthService.forgotAdminPassword(req.body);
    responseWrapper(res, response, '', httpStatus.OK);
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
  const response = await adminAuthService.updateAdmin(req.params.id, req.body);
  return responseWrapper(res, response, "Admin Updated Successfully");
});

const deleteAdmin = catchAsync(async (req, res) => {
  await adminAuthService.deleteAdmin(req.body);
  res.status(httpStatus.OK).send({
    code: httpStatus.NO_CONTENT,
    message: "Deleted Successfull.",
    data: "",
  });
});

module.exports = {
    createAdminUser,
    loginAdminUser,
    resetAdminPassword,
    sendOTP,
    verifyOTP,
    forgotAdminPassword,
    getProfile,
    getAllAdmins,
    findAdminById,
    updateAdmin,
    deleteAdmin,
};