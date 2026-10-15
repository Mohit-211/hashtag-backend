const express = require('express');
const router = express.Router();

const {userController} = require('../../../controllers');
const {adminAuthMiddleware} = require('../../../middlewares');

router.use(adminAuthMiddleware.requireAdmin);

router.get('/getAllUsers', userController.getAllUsers);
router.get('/getUserById', userController.getUserById);
router.post('/deleteUser', userController.deleteUser);
router.post('/createUser', userController.adminAddUser);

module.exports = router;
