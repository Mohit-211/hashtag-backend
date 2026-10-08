const express = require('express');
const router = express.Router();

const { faqController } = require('../../../controllers');

router.post('/' , faqController.createFaq);
router.get('/' , faqController.getAllFaq);
router.put('/:id' , faqController.updateFaq);
router.delete('/:id' , faqController.deleteFaq);

module.exports = router;