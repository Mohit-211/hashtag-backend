const express = require('express');
const router = express.Router();

const { sanmarController } = require('../../../controllers');

router.get('/sync/brand', sanmarController.syncSanmarBrands);
router.get('/brands', sanmarController.getSanmarBrands);
router.get('/styles', sanmarController.getSanmarStylesByBrand);
router.get('/products', sanmarController.getSanmarProductsByStyle);
router.post("/sync/save", sanmarController.syncSanmarProduct);


module.exports = router;