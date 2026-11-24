const express = require('express');
const router = express.Router();

const {countryController} = require('../../../controllers');
const { adminAuthMiddleware } = require('../../../middlewares');
const { listLimits } = require('../../../middlewares/listLimits');

const { identifyAdmin } = adminAuthMiddleware;


router.get('/', identifyAdmin, listLimits({ search: false }), countryController.getAllCountry);
router.get('/:id',countryController.getCountryId);

module.exports = router;