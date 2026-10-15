const express = require('express');
const router = express.Router();

const {adminAuthController} = require('../../../controllers');
const {adminAuthMiddleware} = require('../../../middlewares');
const { loginLimiter, emailLimiter, tokenLimiter } = require('../../../middlewares/rateLimiter');

const { requireAdmin, requireSuperAdmin } = adminAuthMiddleware;

// Public: sign in and the emailed-link password flow.
router.post('/login', [loginLimiter, adminAuthMiddleware.validateLoginAdminBody], adminAuthController.loginAdminUser);
router.post('/forgot-password', [emailLimiter], adminAuthController.forgotAdminPassword);
router.post('/forgot-password/reset', [tokenLimiter], adminAuthController.resetAdminPasswordWithToken);

// Any signed-in admin.
router.post('/change-password', [requireAdmin, adminAuthMiddleware.validateResetPassordBody], adminAuthController.resetAdminPassword);
router.get('/getProfile', [requireAdmin], adminAuthController.getProfile);

// Super Admin: managing admin accounts.
router.post('/register', [requireAdmin, requireSuperAdmin, adminAuthMiddleware.validateCreateAdminBody], adminAuthController.createAdminUser);
router.put('/updateAdmin/:id', [requireAdmin, requireSuperAdmin], adminAuthController.updateAdmin);
router.post('/deleteAdmin', [requireAdmin, requireSuperAdmin], adminAuthController.deleteAdmin);
router.get('/getAllAdmins', [requireAdmin, requireSuperAdmin], adminAuthController.getAllAdmins);
router.get('/findAdminById/:id', [requireAdmin, requireSuperAdmin], adminAuthController.findAdminById);

module.exports = router;
