const express = require('express');
const {  ottocapController, imageController } = require('../../../controllers/Common');
const router = express.Router();

router.post('/import-inventory', ottocapController.importOttoCapInventory);
router.post('/import-catalog', ottocapController.importOttoCapCatalog);


router.get('/products', ottocapController.getOttoProducts);
router.get('/products/:skuNo', ottocapController.getOttoProductDetails);


router.post('/import-products', ottocapController.importOttoProduct);
router.post('/import-selected-variants', ottocapController.importSelectedOttoVariants);

router.get("/otto-image", imageController.getOttoImage);


module.exports = router;