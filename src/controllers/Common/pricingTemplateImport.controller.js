const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const { pricingTemplateImportService } = require("../../services/Common");
const responseWrapper = require("../../config/responseWrapper");

// "Replace templates that already exist": a multipart field, so it arrives as text.
const replaceExisting = (req) => ["1", "true", "yes", "on"].includes(String(req.body?.replace_existing ?? "").toLowerCase());

// GET /pricing-template/import/format: the columns, the two pricing styles, an example file.
const getImportFormat = catchAsync(async (req, res) => {
  const format = await pricingTemplateImportService.getImportFormat();
  return responseWrapper(res, format, "", httpStatus.OK);
});

// POST /pricing-template/import/preview (multipart: file, replace_existing?): checks the file,
// saves nothing.
const previewImport = catchAsync(async (req, res) => {
  const report = await pricingTemplateImportService.previewImport(req.file, { replaceExisting: replaceExisting(req) });
  return responseWrapper(res, report, "", httpStatus.OK);
});

// POST /pricing-template/import (same body): saves every template in the file, or none. A file
// with problems answers 422 with the same report the preview gives.
const importTemplates = catchAsync(async (req, res) => {
  const result = await pricingTemplateImportService.importTemplates(req.file, {
    replaceExisting: replaceExisting(req),
    adminId: req.admin?.id ?? null,
  });

  if (!result.imported) {
    return res.status(httpStatus.UNPROCESSABLE_ENTITY).json({
      success: false,
      status: httpStatus.UNPROCESSABLE_ENTITY,
      message: "Nothing was imported. Fix the problems listed, then upload the file again.",
      data: result.report,
    });
  }

  const { templates, created, replaced } = result.summary;
  const parts = [
    created ? `${created} new` : null,
    replaced ? `${replaced} replaced` : null,
  ].filter(Boolean);
  return responseWrapper(
    res,
    result,
    `Imported ${templates} pricing template${templates === 1 ? "" : "s"} (${parts.join(", ")}).`,
    httpStatus.CREATED,
  );
});

module.exports = { getImportFormat, previewImport, importTemplates };
