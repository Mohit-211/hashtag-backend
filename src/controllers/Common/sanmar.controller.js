const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const responseWrapper = require("../../config/responseWrapper");
const { sanmarService } = require("../../services");
const { ImportBatch } = require("../../models");

const syncSanmarBrands = catchAsync(async (req, res) => {
  await sanmarService.syncSanmarBrands();

  return responseWrapper(
    res,
    null,
    "Sanmar brands synced successfully",
    httpStatus.OK,
  );
});

const getSanmarBrands = catchAsync(async (req, res) => {
  const data = await sanmarService.getSanmarBrands();

  return responseWrapper(
    res,
    data,
    "Sanmar brands fetched successfully",
    httpStatus.OK,
  );
});

const getSanmarStylesByBrand = catchAsync(async (req, res) => {
  const { brand } = req.query;

  if (!brand) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Brand is required");
  }

  const styles = await sanmarService.getSanmarStylesByBrand(brand);

  return responseWrapper(
    res,
    styles,
    "Styles fetched successfully",
    httpStatus.OK,
  );
});

const getSanmarProductsByStyle = catchAsync(async (req, res) => {
  const { brand, style } = req.query;

  if (!brand || !style) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Brand and style are required");
  }

  const data = await sanmarService.getSanmarProductsByStyle(brand, style);

  return responseWrapper(
    res,
    data,
    "Products fetched successfully",
    httpStatus.OK,
  );
});

const syncSanmarProduct = catchAsync(async (req, res) => {
  const { brand, style } = req.body;

  const batch = await ImportBatch.create({
    source_name: "SANMAR_PRODUCT",
    status: "processing",
  });

  try {
    // 🔥 FETCH FROM DB AGAIN (important)
    const data = await sanmarService.getSanmarProductsByStyle(brand, style);

    if (!data) {
      throw new Error("No product found");
    }

    // 🔥 SAVE
    const result = await sanmarService.saveSanmarProductToDB(data, batch.id);

    await batch.update({
      status: "success",
      processed_records: result.total_variants,
      total_records: result.total_variants,
    });
    return responseWrapper(
      res,
      result,
      "Sanmar product synced successfully",
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

module.exports = {
  syncSanmarBrands,
  getSanmarBrands,
  getSanmarStylesByBrand,
  getSanmarProductsByStyle,
  syncSanmarProduct,
};
