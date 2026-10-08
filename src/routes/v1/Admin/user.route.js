const express = require('express');
const router = express.Router();

const {userController} = require('../../../controllers');
const {adminAuthMiddleware} = require('../../../middlewares');


router.get('/getAllUsers',[adminAuthMiddleware.validateJWTtoken],userController.getAllUsers);
router.get('/getUserById',userController.getUserById);
router.post('/deleteUser',userController.deleteUser);
router.post('/createUser',[adminAuthMiddleware.validateJWTtoken],userController.adminAddUser);



module.exports = router;