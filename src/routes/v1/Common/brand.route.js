const express = require('express');
const router = express.Router();

const { brandController } = require('../../../controllers');

router.get('/website-brands' , brandController.getPublishedBrands);
router.post('/' , brandController.createBrand);
router.get('/' , brandController.getAllBrands);
router.get('/ss' , brandController.getAllSSBrands);
router.get('/:id' , brandController.getBrandById);
router.put('/:id' , brandController.updateBrand);
router.delete('/:id' , brandController.deleteBrand);
router.post('/publish' , brandController.publishBrands);
router.post('/manual-brand' , brandController.createManualBrand);

// import form s&s
router.get('/sync/ss' , brandController.syncSSBrands);

module.exports = router;