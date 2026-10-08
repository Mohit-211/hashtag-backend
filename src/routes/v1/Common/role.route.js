const express = require('express');
const router = express.Router();

const {roleController} = require('../../../controllers');

router.post('/' , roleController.createRole);
router.get('/:id' , roleController.findRoleById);
router.get('/' , roleController.getAllRoles);
router.put('/:id' , roleController.updateRole);
router.delete('/:id' , roleController.deleteRole);

module.exports = router;