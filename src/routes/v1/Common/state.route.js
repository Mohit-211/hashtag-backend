const express = require('express');
const router = express.Router();

const {stateController} = require('../../../controllers');


router.get('/',stateController.getAllState);
router.get('/:id',stateController.getStateById);

module.exports = router;