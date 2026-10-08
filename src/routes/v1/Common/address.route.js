const express = require('express');
const router = express.Router();

const {addressController } = require('../../../controllers');
const {userAuthMiddleware} = require('../../../middlewares');


router.post('/', [userAuthMiddleware.verifyAuthJWTToken], addressController.addAddress);
router.get('/', [userAuthMiddleware.verifyAuthJWTToken],addressController.getAddresses);
router.put('/', [userAuthMiddleware.verifyAuthJWTToken], addressController.updateAddress);
router.delete('/:id', [userAuthMiddleware.verifyAuthJWTToken], addressController.deleteAddress);




module.exports = router;