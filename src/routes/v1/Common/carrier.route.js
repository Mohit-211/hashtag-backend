const express = require('express');
const router = express.Router();

const {CarrierController } = require('../../../controllers');


router.post('/sync', CarrierController.syncCarriers);
router.post('/sync/services', CarrierController.syncServices);
router.get('/', CarrierController.getCarriers);
router.get('/:carrier_id', CarrierController.getServicesByCarrier);




module.exports = router;