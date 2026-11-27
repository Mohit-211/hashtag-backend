const express = require('express');
const router = express.Router();

const {userController} = require('../../../controllers');
const {adminAuthMiddleware} = require('../../../middlewares');
const { loginDetailsLimiter } = require('../../../middlewares/rateLimiter');

router.use(adminAuthMiddleware.requireAdmin);

// Clients from a CSV file (Users › Import clients from CSV). The upload middleware reads the
// file (csvUpload, field "file") for the two POSTs.
router.get('/import/format', userController.getClientImportFormat);
router.post('/import/preview', userController.previewClientImport);
router.post('/import', userController.importClients);

router.get('/getAllUsers', userController.getAllUsers);
router.get('/getUserById', userController.getUserById);
router.post('/deleteUser', userController.deleteUser);
router.post('/createUser', userController.adminAddUser);
router.put('/setPassword/:id', userController.setUserPassword);
router.post('/sendLoginDetails/:id', loginDetailsLimiter, userController.sendLoginDetails);

module.exports = router;
