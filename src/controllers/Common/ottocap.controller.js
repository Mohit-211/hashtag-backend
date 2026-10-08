const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const responseWrapper = require("../../config/responseWrapper");
const { ottoCapService } = require("../../services");
const { ImportBatch, ProductVariant } = require("../../models");

const importOttoCapInventory = catchAsync(async (req, res) => {
  const data = await ottoCapService.importOttoCapInventory();
  return responseWrapper(
    res,
    data,
    "OTTO CAP inventory imported successfully",
    httpStatus.OK,
  );
});

const importOttoCapCatalog = catchAsync(async (req, res) => {
  const data = await ottoCapService.importOttoCapCatalog();
  return responseWrapper(
    res,
    data,
    "OTTO CAP catalog imported successfully",
    httpStatus.OK,
  );
});

const getOttoProducts = catchAsync(async (req, res) => {
  const data = await ottoCapService.getOttoProducts();
  return responseWrapper(res, data, "", httpStatus.OK);
});

const getOttoProductDetails = catchAsync(async (req, res) => {
  const { skuNo } = req.params;
  const data = await ottoCapService.getOttoProductDetails(skuNo);
  return responseWrapper(res, data, "", httpStatus.OK);
});

const importOttoProduct = catchAsync(async (req, res) => {
  const { skuNo } = req.body;

  const batch = await ImportBatch.create({
    source_name: "OTTOCAP_PRODUCT",
    status: "processing",
  });

  try {
    const product =
      await ottoCapService.saveOttoProductToDB(
        skuNo,
        batch.id,
      );

    const variantCount =
      await ProductVariant.count({
        where: {
          product_id: product.id,
        },
      });

    await batch.update({
      status: "success",
      processed_records: variantCount,
      total_records: variantCount,
    });

    return responseWrapper(
      res,
      product,
      "OTTO product imported successfully",
      httpStatus.OK,
    );
  } catch (err) {
    await batch.update({
      status: "failed",
      error_message: err.message,
    });

    throw err;
  }
});

const importSelectedOttoVariants = catchAsync(async (req, res) => {
  const { parentSku, variantSkus, batchNotes } = req.body;

  const data =
    await ottoCapService.importSelectedOttoVariants(
      parentSku,
      variantSkus,
      batchNotes,
    );

  return responseWrapper(
    res,
    data,
    "Selected OTTO variants imported successfully",
    httpStatus.OK,
  );
});


module.exports = {
  importOttoCapInventory,
  importOttoCapCatalog,
  getOttoProducts,
  getOttoProductDetails,
  importSelectedOttoVariants,
  importOttoProduct,
  
};
