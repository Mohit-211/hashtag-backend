const express = require('express');
const router = express.Router();

const {adminAuthController} = require('../../../controllers');
const {adminAuthMiddleware} = require('../../../middlewares');

router.post('/register', adminAuthController.createAdminUser);
router.post('/login', [adminAuthMiddleware.validateLoginAdminBody], adminAuthController.loginAdminUser);
router.post('/change-password',  [ adminAuthMiddleware.validateResetPassordBody, adminAuthMiddleware.validateJWTtoken], adminAuthController.resetAdminPassword);
router.post('/otp',  adminAuthController.sendOTP);
router.post('/verify-otp',  adminAuthController.verifyOTP);
router.post('/forgot-password',  adminAuthController.forgotAdminPassword);
router.put('/updateAdmin/:id',[adminAuthMiddleware.validateJWTtoken],adminAuthController.updateAdmin);
router.post('/deleteAdmin',[adminAuthMiddleware.validateJWTtoken],adminAuthController.deleteAdmin);
router.get('/getAllAdmins',[adminAuthMiddleware.validateJWTtoken],adminAuthController.getAllAdmins);
router.get('/getProfile',[adminAuthMiddleware.validateJWTtoken],adminAuthController.getProfile);
router.get('/findAdminById/:id',adminAuthController.findAdminById);

module.exports = router;