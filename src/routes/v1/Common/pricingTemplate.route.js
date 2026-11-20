const express = require("express");
const router = express.Router();
const { pricingTemplateController, pricingTemplateImportController } = require("../../../controllers");
const { adminAuthMiddleware } = require("../../../middlewares");

const { requireAdmin } = adminAuthMiddleware;

// Several templates from one CSV file (Pricing Templates › Import from CSV). The upload
// middleware reads the file (csvUpload, field "file") for the two POSTs.
router.get("/import/format", requireAdmin, pricingTemplateImportController.getImportFormat);
router.post("/import/preview", requireAdmin, pricingTemplateImportController.previewImport);
router.post("/import", requireAdmin, pricingTemplateImportController.importTemplates);

// Pricing templates (panel F29), shared by every admin.
router.get("/", requireAdmin, pricingTemplateController.getPricingTemplates);
router.post("/", requireAdmin, pricingTemplateController.createPricingTemplate);
router.put("/:id", requireAdmin, pricingTemplateController.updatePricingTemplate);
router.delete("/:id", requireAdmin, pricingTemplateController.deletePricingTemplate);

module.exports = router;
