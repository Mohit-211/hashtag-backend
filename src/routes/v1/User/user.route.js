const express = require('express');
const router = express.Router();

const { userOpController } = require('../../../controllers');
const { userAuthMiddleware } = require('../../../middlewares');

router.use(userAuthMiddleware.setRoleIdIfNotPresent);

router.get('/profile', [userAuthMiddleware.verifyAuthJWTToken], userOpController.getProfile);
router.post('/notifications', [userAuthMiddleware.verifyAuthJWTToken], userOpController.notificationToogle);
router.delete('/deactivate', [userAuthMiddleware.verifyAuthJWTToken], userOpController.deactivateAccount);

module.exports = router;