/** @format */

const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const responseWrapper = require("../../config/responseWrapper");
const { productService } = require("../../services");
const { ImportBatch } = require("../../models");
const ApiError = require("../../utils/ApiError");

const createProduct = catchAsync(async (req, res) => {
  const product = await productService.createProduct(req.body, req.files);
  return responseWrapper(
    res,
    product,
    "Product Created Successfully",
    httpStatus.CREATED,
  );
});

const addProductVariants = catchAsync(async (req, res) => {
  const product = await productService.addProductVariants(req.body, req.files);
  return responseWrapper(
    res,
    product,
    "Product Created Successfully",
    httpStatus.CREATED,
  );
});

const duplicateProduct = catchAsync(async (req, res) => {
  const { id } = req.params;

  const product =
    await productService.duplicateProduct(id);

  return responseWrapper(
    res,
    product,
    "Product Duplicate Data Fetched Successfully",
    httpStatus.OK,
  );
});

const updateManualProductFull = catchAsync(async (req, res) => {
  const product = await productService.updateManualProductFull(
    req.body,
    req.files,
  );
  responseWrapper(res, product, "Product updated successfully", httpStatus.OK);
});

const getAllProducts = catchAsync(async (req, res) => {
  const products = await productService.getAllProducts(req.query);
  return responseWrapper(res, products, "", httpStatus.OK);
});

const getAllProductsByGrandCategory = catchAsync(async (req, res) => {
  const products = await productService.getAllProductsByGrandCategory(
    req.query,
  );

  return responseWrapper(res, products, "", httpStatus.OK);
});

const getProductsByBrand = catchAsync(async (req, res) => {
  const products = await productService.getProductsByBrand(req.query);
  return responseWrapper(res, products, "", httpStatus.OK);
});

const getProductById = catchAsync(async (req, res) => {
  const product = await productService.getProductById(req.params.id, req.body);
  return responseWrapper(res, product, "", httpStatus.OK);
});

const getVariantById = catchAsync(async (req, res) => {
  const product = await productService.getVariantById(req.params.id);
  return responseWrapper(res, product, "", httpStatus.OK);
});

const getGuestProductById = catchAsync(async (req, res) => {
  const product = await productService.getGuestProductById(req.params.id);
  return responseWrapper(res, product, "", httpStatus.OK);
});

const getProductVariant = catchAsync(async (req, res) => {
  const variant = await productService.getProductVariant(req.body);
  return responseWrapper(res, variant, "", httpStatus.OK);
});

const updateProduct = catchAsync(async (req, res) => {
  const product = await productService.updateProduct(req.body, req.files);
  return responseWrapper(
    res,
    product,
    "Product Updated Successfully",
    httpStatus.OK,
  );
});

const deleteProduct = catchAsync(async (req, res) => {
  const { styleId, supplier, product_id } = req.body;

  if (!product_id && (!styleId || !supplier)) {
    throw new ApiError(
      400,
      "Either product_id OR styleId + supplier is required",
    );
  }

  const data = await productService.deleteProduct({
    product_id,
    styleId,
    supplier,
  });

  return responseWrapper(res, data, "Deleted successfully", 200);
});

// s&s product management functions

const getSSStylesByBrand = catchAsync(async (req, res) => {
  const { brand } = req.params;
  const styles = await productService.getSSStylesByBrand(brand);
  return responseWrapper(
    res,
    styles,
    "Styles fetched successfully",
    httpStatus.OK,
  );
});

const getSSProductByStyle = catchAsync(async (req, res) => {
  const { styleId } = req.params;
  const styles = await productService.getSSProductByStyle(styleId);
  return responseWrapper(
    res,
    styles,
    "Products fetched successfully",
    httpStatus.OK,
  );
});

const syncSingleStyle = catchAsync(async (req, res) => {
  const { styleId } = req.params;

  const batch = await ImportBatch.create({
    source_name: "SS_PRODUCT",
    status: "processing",
  });

  try {
    // 🔥 STEP 1: FETCH
    const data = await productService.getSSProductByStyle(styleId);

    if (!data) {
      return res.json({ message: "No data found" });
    }

    // 🔥 STEP 2: SAVE
    await productService.saveSSProductToDB(data, batch.id);
    await batch.update({
      status: "success",
      processed_records: 1,
      total_records: 1,
    });

    return res.json({
      message: "Product synced successfully",
      styleId,
      data: data,
    });
  } catch (err) {
    await batch.update({
      status: "failed",
      error_message: err.message,
    });

    // The details are kept on the import batch, not sent to the client.
    return res.status(500).json({
      message: `Sync failed. Details are saved on import batch ${batch.id}.`,
      batch_id: batch.id,
    });
  }
});

const deleteSSProductByStyle = catchAsync(async (req, res) => {
  const { styleId } = req.params;
  await productService.deleteSSProductByStyle(styleId);
  return responseWrapper(
    res,
    "",
    "Product Deleted Successfully",
    httpStatus.OK,
  );
});

const getProductVariantByAdmin = catchAsync(async (req, res) => {
  const variant = await productService.getProductVariantByAdmin(req.query);
  return responseWrapper(res, variant, "", httpStatus.OK);
});

const setAdminWeight = catchAsync(async (req, res) => {
  const result = await productService.setAdminWeight(req.body);
  return responseWrapper(res, result, "Weight saved", httpStatus.OK);
});

const getProductVariantByIdAdmin = catchAsync(async (req, res) => {
  const variant = await productService.getProductVariantByIdAdmin(req.params.id);
  return responseWrapper(res, variant, "", httpStatus.OK);
});

const getProductByIdAdmin = catchAsync(async (req, res) => {
  const product = await productService.getProductByIdAdmin(req.params.id);
  return responseWrapper(res, product, "", httpStatus.OK);
});

const getAdminStats = catchAsync(async (req, res) => {
  const variant = await productService.getAdminStats();
  return responseWrapper(res, variant, "", httpStatus.OK);
});

const getAllProductsAdmin = catchAsync(async (req, res) => {
  const variant = await productService.getAllProductsAdmin(req.query);
  return responseWrapper(res, variant, "", httpStatus.OK);
});

const getProductsForBrandMapping = catchAsync(async (req, res) => {
  const products = await productService.getProductsForBrandMapping(req.query);
  return responseWrapper(res, products, "", httpStatus.OK);
});

const assignBrandToProducts = catchAsync(async (req, res) => {
  const product = await productService.assignBrandToProducts(req.body);
  return responseWrapper(
    res,
    product,
    "Brand assigned to products successfully",
    httpStatus.CREATED,
  );
});

module.exports = {
  createProduct,
  addProductVariants,
  duplicateProduct,
  updateManualProductFull,
  getAllProductsByGrandCategory,
  getAllProducts,
  getProductsByBrand,
  getProductById,
  getVariantById,
  getGuestProductById,
  getProductVariant,
  updateProduct,
  deleteProduct,

  getSSStylesByBrand,
  syncSingleStyle,
  getSSProductByStyle,
  deleteSSProductByStyle,
  getProductVariantByAdmin,
  getProductVariantByIdAdmin,
  setAdminWeight,
  getProductByIdAdmin,
  getAdminStats,
  getAllProductsAdmin,
  getProductsForBrandMapping,
  assignBrandToProducts,
};
