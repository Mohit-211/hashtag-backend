const express = require('express');
const router = express.Router();

const {userAuthController } = require('../../../controllers');
const {userAuthMiddleware} = require('../../../middlewares');
const { loginLimiter, emailLimiter, tokenLimiter } = require('../../../middlewares/rateLimiter');

router.use(userAuthMiddleware.useCustomerRole);

router.post('/register', [emailLimiter, userAuthMiddleware.validateRegisterUserBody], userAuthController.register);
router.post('/verify-email', [tokenLimiter], userAuthController.verifyEmail);
router.post('/verify-email/resend', [emailLimiter], userAuthController.resendVerification);
router.post('/login', [loginLimiter, userAuthMiddleware.validateSignInReqBody], userAuthController.login);
router.post('/forgot-password', [emailLimiter], userAuthController.forgotPassword);
router.post('/forgot-password/reset', [tokenLimiter], userAuthController.resetPasswordWithToken);
// Signed-in password change.
router.post('/reset-password', [userAuthMiddleware.verifyAuthJWTToken, userAuthMiddleware.validateResetPassordBody], userAuthController.resetPassword);
router.get('/logout', [userAuthMiddleware.verifyAuthJWTToken], userAuthController.logout);


module.exports = router;
