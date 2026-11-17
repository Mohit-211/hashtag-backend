const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const { productImportService } = require("../../services/Common");
const responseWrapper = require("../../config/responseWrapper");

// GET /product/import/format: the columns, an example file and the pricing templates.
const getImportFormat = catchAsync(async (req, res) => {
  const format = await productImportService.getImportFormat();
  return responseWrapper(res, format, "", httpStatus.OK);
});

// POST /product/import/preview (multipart: file, default_pricing_template_id?): checks the file,
// saves nothing.
const previewImport = catchAsync(async (req, res) => {
  const report = await productImportService.previewImport(req.file, {
    defaultTemplateId: req.body?.default_pricing_template_id ?? null,
  });
  return responseWrapper(res, report, "", httpStatus.OK);
});

// POST /product/import (same body): creates every product in the file, or none. A file with
// problems answers 422 with the same report the preview gives.
const importProducts = catchAsync(async (req, res) => {
  const result = await productImportService.importProducts(req.file, {
    defaultTemplateId: req.body?.default_pricing_template_id ?? null,
  });

  if (!result.imported) {
    return res.status(httpStatus.UNPROCESSABLE_ENTITY).json({
      success: false,
      status: httpStatus.UNPROCESSABLE_ENTITY,
      message: "Nothing was imported. Fix the problems listed, then upload the file again.",
      data: result.report,
    });
  }

  const { products, variants } = result.summary;
  return responseWrapper(
    res,
    result,
    `Imported ${products} product${products === 1 ? "" : "s"} with ${variants} option${variants === 1 ? "" : "s"}.`,
    httpStatus.CREATED,
  );
});

module.exports = { getImportFormat, previewImport, importProducts };
