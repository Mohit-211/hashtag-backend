const express = require('express');
const router = express.Router();

const {cityController} = require('../../../controllers');
const { adminAuthMiddleware } = require('../../../middlewares');
const { listLimits } = require('../../../middlewares/listLimits');

const { identifyAdmin } = adminAuthMiddleware;


router.get('/', identifyAdmin, listLimits({ search: false }), cityController.getAllCity);
router.get('/:id',cityController.getCityById);

module.exports = router;