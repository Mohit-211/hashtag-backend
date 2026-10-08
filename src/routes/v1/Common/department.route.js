const express = require('express');
const router = express.Router();

const { departmentController } = require('../../../controllers');

router.post('/', departmentController.createDepartment);
router.get('/', departmentController.getAllDeparments);
router.get('/:id', departmentController.findDepartmentById);
router.put('/:id', departmentController.updateDepartment);
router.delete('/:id', departmentController.deleteDepartment);

module.exports = router;