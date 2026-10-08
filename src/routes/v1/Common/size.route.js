const express = require('express');
const router = express.Router();

const { sizeController } = require('../../../controllers');

router.post('/create' , sizeController.createSize);
router.get('/' , sizeController.getAllSizes);
router.get('/:id' , sizeController.getSizeById);
router.put('/:id' , sizeController.updateSize);
router.delete('/:id' , sizeController.deleteSize);

module.exports = router;