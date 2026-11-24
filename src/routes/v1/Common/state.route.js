const express = require('express');
const router = express.Router();

const {stateController} = require('../../../controllers');
const { adminAuthMiddleware } = require('../../../middlewares');
const { listLimits } = require('../../../middlewares/listLimits');

const { identifyAdmin } = adminAuthMiddleware;


router.get('/', identifyAdmin, listLimits({ search: false }), stateController.getAllState);
router.get('/:id',stateController.getStateById);

module.exports = router;