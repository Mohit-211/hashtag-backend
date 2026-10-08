/** @format */

const httpStatus = require("http-status");
const {
  Product,
  ProductVariant,
  ProductAttachment,
  Brand,
  ProductCategory,
  ProductCategoryMapping,
  Size,
  VariantAttachment,
  ImportBatch,
  SourceRawData,
  VariantWarehouse,
  Cart,
  Wishlist,
  ParentCategory,
  GrandCategory,
  PricingMarkup,
  ParentCategoryMapping,
  GrandCategoryMapping,
  ProductAddOn,
} = require("../../models");
const ApiError = require("../../utils/ApiError");
const { Op, Sequelize } = require("sequelize");
const ssClient = require("../../config/ssClient");
const pLimit = require("p-limit").default;
const { mapSSProduct } = require("../../config/ss.adapter");
const sequelize = require("../../config/central.db");
const { calculatePricing, getMarkupPercent } = require("../../config/pricing");
const { downloadSupplierImage } = require("./supplierImage.service");
const decodeHtmlEntities = require("../../utils/decodeHtmlEntities");
const sortSizes = require("../../utils/sortSizes");
const { COLOR_FILTERS } = require("../../utils/colorFilter");
const { buildPricingTiers } = require("../../utils/pricing/pricing.util");
const {
  resolveTierProductIds,
  resolveAllTierProductIds,
} = require("./tier.service");
const limit = pLimit(5);

const BASE_URL = "https://www.ssactivewear.com/";

const createSkuGenerator = async (productId, requestVariants) => {
  const normalize = (sku) => String(sku).trim().toUpperCase();
  const taken = new Set();

  // 1. SKUs typed in this request — also catches duplicates within it.
  for (const v of requestVariants) {
    const typed = typeof v?.sku === "string" ? v.sku.trim() : "";
    if (!typed) continue;

    if (taken.has(normalize(typed))) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `SKU "${typed}" is used by more than one variant`,
      );
    }
    taken.add(normalize(typed));
  }

  // 2. Generated-style SKUs already in the DB for this product id.
  const prefix = `MAN-${productId}-`;
  const existing = await ProductVariant.findAll({
    where: { sku: { [Op.like]: `${prefix}%` } },
    attributes: ["sku"],
  });
  existing.forEach((row) => row.sku && taken.add(normalize(row.sku)));

  let counter = 1;
  return () => {
    let candidate;
    do {
      candidate = `${prefix}${String(counter).padStart(3, "0")}`;
      counter += 1;
    } while (taken.has(normalize(candidate)));
    taken.add(normalize(candidate));
    return candidate;
  };
};

const resolveSku = (v, nextSku) => {
  const typed = typeof v?.sku === "string" ? v.sku.trim() : "";
  return typed || nextSku();
};

const createProduct = async (body, files) => {
  let {
    category_ids,
    sizes,
    options,
    option_name,
    option_type,
    ...productData
  } = body;

  // Parse JSON fields
  if (sizes && typeof sizes === "string") {
    sizes = JSON.parse(sizes);
  }

  if (category_ids && typeof category_ids === "string") {
    category_ids = JSON.parse(category_ids);
  }

  if (options && typeof options === "string") {
    options = JSON.parse(options);
  }

  productData.supplier = "MANUAL";
  productData.last_supplier_sync_at = new Date();

  // --------------------------------------------------
  // Product metadata
  // --------------------------------------------------
  const meta = {
    ...(productData.meta || {}),
  };

  // New multiple options support
  if (Array.isArray(options) && options.length) {
    meta.options = options.map((option) => ({
      name: option.name,
      type: option.type || "dropdown",
      values: Array.isArray(option.values) ? option.values : [],
    }));
  }

  // Backward compatibility: old frontend sends sizes + option_name + option_type
  if (
    (!Array.isArray(options) || !options.length) &&
    Array.isArray(sizes) &&
    sizes.length
  ) {
    meta.options = [
      {
        name: option_name || "Size",
        type: option_type || "dropdown",
        values: sizes,
      },
    ];

    meta.option_name = option_name || "Size";
    meta.option_type = option_type || "dropdown";
  }

  productData.meta = meta;

  // --------------------------------------------------
  // Create Product
  // --------------------------------------------------
  const product = await Product.create(productData);

  // --------------------------------------------------
  // Images
  // --------------------------------------------------
  if (files?.images?.length) {
    for (let i = 0; i < files.images.length; i++) {
      const file = files.images[i];

      await ProductAttachment.create({
        product_id: product.id,
        file_type: "image",
        file_name: file.filename,
        file_uri: `${process.env.IMAGE_BASE_URL}/images/${file.filename}`,
        file_size: file.size,
        is_primary: i === 0,
        supplier: "MANUAL",
        source_url: null,
      });
    }
  }

  // --------------------------------------------------
  // Categories
  // --------------------------------------------------
  if (Array.isArray(category_ids) && category_ids.length) {
    await ProductCategoryMapping.bulkCreate(
      category_ids.map((id) => ({
        product_id: product.id,
        product_category_id: id,
      })),
    );
  }

  // --------------------------------------------------
  // Options → Size rows
  // --------------------------------------------------
  if (Array.isArray(options) && options.length) {
    const sizeData = [];

    for (const option of options) {
      if (!option?.name || !Array.isArray(option.values)) {
        continue;
      }

      for (const value of option.values) {
        if (!value?.name) {
          continue;
        }

        sizeData.push({
          product_id: product.id,
          name: value.name,
          type: option.name,
          display_style: option.type || "dropdown",
          measurements: value.measurements || null,
        });
      }
    }

    if (sizeData.length) {
      await Size.bulkCreate(sizeData);
    }
  }
  // Old single-option support
  else if (Array.isArray(sizes) && sizes.length) {
    const optionType = option_name || "Size";

    const sizeData = sizes.map((s) => ({
      product_id: product.id,
      name: s.name,
      type: optionType,
      display_style: option_type || "dropdown",
      measurements: s.measurements || null,
    }));

    await Size.bulkCreate(sizeData);
  }

  return product;
};

const addProductVariants = async (body, files) => {
  try {
    let { product_id, variants } = body;

    if (variants && typeof variants === "string") {
      variants = JSON.parse(variants);
    }

    if (!product_id) {
      throw new ApiError(httpStatus.BAD_REQUEST, "product_id is required");
    }

    if (!Array.isArray(variants) || !variants.length) {
      throw new ApiError(httpStatus.BAD_REQUEST, "variants required");
    }

    const nextSku = await createSkuGenerator(product_id, variants);

    const createdVariants = [];

    let imageIndex = 0;

    const sizes = await Size.findAll({
      where: { product_id },
    });

    const sizeMap = new Map(sizes.map((s) => [s.id, s]));

    for (const v of variants) {
      // Blank SKU → generated (was: throw "sku required")
      const sku = resolveSku(v, nextSku);

      // --------------------------------------------------
      // Multi-option support
      // --------------------------------------------------
      let optionValues = v.option_values;

      if (optionValues && typeof optionValues === "string") {
        try {
          optionValues = JSON.parse(optionValues);
        } catch {
          optionValues = [];
        }
      }

      if (!Array.isArray(optionValues)) {
        optionValues = [];
      }

      const colorEntry = optionValues.find(
        (o) => o?.type === "color" && o?.value,
      );

      const nonColorEntry = optionValues.find(
        (o) => o?.type !== "color" && o?.value,
      );

      // Flat columns still only hold ONE size-like value and ONE color.
      // Complete option selection is preserved in meta.option_values.
      const resolvedColor = colorEntry?.value || v.color || null;

      const resolvedColorCode = colorEntry?.color_code || v.color_code || null;

      const resolvedSizeName = nonColorEntry?.value || v.size || null;

      const resolvedOptionName = nonColorEntry?.name || v.option_name || "Size";

      let selectedSize = null;

      if (v.size_id) {
        selectedSize = sizeMap.get(Number(v.size_id));
      } else if (resolvedSizeName) {
        const sizeName = String(resolvedSizeName).trim();

        selectedSize = await Size.findOne({
          where: {
            product_id,
            name: sizeName,
          },
        });

        if (!selectedSize) {
          selectedSize = await Size.create({
            product_id,
            name: sizeName,
            type: resolvedOptionName,
            display_style:
              optionValues.find((o) => o?.name === resolvedOptionName)?.type ||
              "dropdown",
          });

          sizeMap.set(selectedSize.id, selectedSize);
        }
      }

      // --------------------------------------------------
      // Pricing Mode — fixed | tiered | quantity_fixed
      // Older callers without pricing_mode infer tiered from bulk_pricing.
      // --------------------------------------------------
      const pricingMode =
        v.pricing_mode === "quantity_fixed"
          ? "quantity_fixed"
          : v.pricing_mode === "tiered"
            ? "tiered"
            : v.pricing_mode === "fixed"
              ? "fixed"
              : Array.isArray(v.bulk_pricing) && v.bulk_pricing.length > 0
                ? "tiered"
                : "fixed";

      // --------------------------------------------------
      // Quantity Fixed Pricing Validation
      // --------------------------------------------------
      let quantityPricing = null;

      if (pricingMode === "quantity_fixed") {
        if (!Array.isArray(v.quantity_pricing) || !v.quantity_pricing.length) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Variant "${sku}": quantity_pricing is required for fixed quantity pricing`,
          );
        }

        const seenQuantities = new Set();

        quantityPricing = v.quantity_pricing.map((item, index) => {
          const quantity = Number(item?.quantity);
          const price = Number(item?.price);

          if (!Number.isInteger(quantity) || quantity <= 0) {
            throw new ApiError(
              httpStatus.BAD_REQUEST,
              `Variant "${sku}", Quantity ${index + 1}: quantity must be a positive whole number`,
            );
          }

          if (!Number.isFinite(price) || price <= 0) {
            throw new ApiError(
              httpStatus.BAD_REQUEST,
              `Variant "${sku}", Quantity ${index + 1}: price must be more than 0`,
            );
          }

          if (seenQuantities.has(quantity)) {
            throw new ApiError(
              httpStatus.BAD_REQUEST,
              `Variant "${sku}": quantity ${quantity} is duplicated`,
            );
          }

          seenQuantities.add(quantity);

          return { quantity, price };
        });

        quantityPricing.sort((a, b) => a.quantity - b.quantity);
      }

      // --------------------------------------------------
      // Flat Variant Price
      // fixed → v.price, tiered → first tier, quantity_fixed → smallest qty
      // --------------------------------------------------
      let variantPrice = Number(v.price || 0);

      if (
        pricingMode === "tiered" &&
        Array.isArray(v.bulk_pricing) &&
        v.bulk_pricing.length > 0 &&
        v.bulk_pricing[0].price !== undefined
      ) {
        variantPrice = Number(v.bulk_pricing[0].price);
      }

      if (
        pricingMode === "quantity_fixed" &&
        Array.isArray(quantityPricing) &&
        quantityPricing.length > 0
      ) {
        variantPrice = Number(quantityPricing[0].price);
      }

      // --------------------------------------------------
      // Create Variant
      // --------------------------------------------------
      const variant = await ProductVariant.create({
        product_id,
        sku,
        price: variantPrice,
        case_price: Number(v.case_price || 0),
        stock: Number(v.stock || 0),
        color: resolvedColor,
        color_code: resolvedColorCode,
        size_id: selectedSize?.id || null,
        size: selectedSize?.name || null,
        supplier: "MANUAL",
        last_supplier_sync_at: new Date(),
        meta: {
          pricing_mode: pricingMode,
          bulk_pricing:
            pricingMode === "tiered" && Array.isArray(v.bulk_pricing)
              ? v.bulk_pricing
              : null,
          quantity_pricing:
            pricingMode === "quantity_fixed" ? quantityPricing : null,
          option_values: optionValues,
        },
      });

      // --------------------------------------------------
      // Variant Images
      // --------------------------------------------------
      const variantImages = [];

      if (files?.variant_images?.length) {
        // image_count 0 means "no images for this variant" — only fall
        // back to 1 when the caller didn't send image_count at all.
        const count =
          v.image_count === undefined || v.image_count === null
            ? 1
            : Number(v.image_count) || 0;

        for (let j = 0; j < count; j++) {
          const file = files.variant_images[imageIndex];

          if (!file) break;

          variantImages.push({
            variant_id: variant.id,
            file_name: file.filename,
            file_uri: `${process.env.IMAGE_BASE_URL}/images/${file.filename}`,
            file_size: file.size,
            is_primary: j === 0,
            supplier: "MANUAL",
            source_url: null,
            file_type: "image",
          });

          imageIndex++;
        }
      }

      if (variantImages.length) {
        await VariantAttachment.bulkCreate(variantImages);
      }

      createdVariants.push(variant);
    }

    return createdVariants;
  } catch (error) {
    console.error(error);
    console.error(error.message);
    console.error(error.stack);
    console.error(error.parent);
    console.error(error.original);

    throw error;
  }
};

const updateManualProductFull = async (body, files) => {
  let {
    product_id,
    name,
    description,
    brand_id,
    category_ids,
    keep_product_image_ids,
    options,
    variants,
  } = body;

  // =========================================================
  // 1. PARSE JSON FIELDS
  // =========================================================
  try {
    if (typeof category_ids === "string") {
      category_ids = JSON.parse(category_ids);
    }
    if (typeof keep_product_image_ids === "string") {
      keep_product_image_ids = JSON.parse(keep_product_image_ids);
    }
    if (typeof options === "string") {
      options = JSON.parse(options);
    }
    if (typeof variants === "string") {
      variants = JSON.parse(variants);
    }
  } catch (error) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Invalid JSON data in product update request",
    );
  }

  if (!product_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, "product_id is required");
  }

  // =========================================================
  // 2. FIND PRODUCT — MANUAL ONLY
  // =========================================================
  const product = await Product.findOne({
    where: {
      id: product_id,
      is_active: true,
    },
  });

  if (!product) {
    throw new ApiError(httpStatus.NOT_FOUND, "Product not found");
  }

  if (product.supplier !== "MANUAL") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "This endpoint only supports manually-created products. Use the standard update endpoint for supplier-sourced products.",
    );
  }

  // =========================================================
  // 3. UPDATE BASIC PRODUCT FIELDS
  // =========================================================
  const productUpdateData = {
    sync_locked: true,
    sync_locked_at: new Date(),
  };

  if (name !== undefined) {
    productUpdateData.name = name;
  }

  if (description !== undefined) {
    productUpdateData.description = description;
  }

  if (brand_id !== undefined) {
    productUpdateData.brand_id = brand_id ? Number(brand_id) : null;
    productUpdateData.is_brand_manually_assigned = !!productUpdateData.brand_id;
  }

  await product.update(productUpdateData);

  // =========================================================
  // 4. CATEGORIES — FULL REPLACE
  // =========================================================
  if (Array.isArray(category_ids)) {
    const cleanCatIds = category_ids
      .map(Number)
      .filter((catId) => Number.isInteger(catId));

    await ProductCategoryMapping.destroy({
      where: { product_id },
    });

    if (cleanCatIds.length > 0) {
      await ProductCategoryMapping.bulkCreate(
        cleanCatIds.map((catId) => ({
          product_id,
          product_category_id: catId,
        })),
      );
    }
  }

  // =========================================================
  // 5. PRODUCT IMAGES
  // =========================================================
  if (Array.isArray(keep_product_image_ids) || files?.images?.length) {
    const keepIds = Array.isArray(keep_product_image_ids)
      ? keep_product_image_ids.map(Number).filter((id) => Number.isInteger(id))
      : [];

    if (keepIds.length > 0) {
      await ProductAttachment.destroy({
        where: {
          product_id,
          id: { [Op.notIn]: keepIds },
        },
      });
    } else {
      await ProductAttachment.destroy({
        where: { product_id },
      });
    }

    if (files?.images?.length) {
      const imageRows = files.images.map((file) => ({
        product_id,
        file_type: "image",
        file_name: file.filename,
        file_uri: `${process.env.IMAGE_BASE_URL}/images/${file.filename}`,
        file_size: file.size,
        is_primary: false,
        supplier: "MANUAL",
        source_url: null,
      }));

      await ProductAttachment.bulkCreate(imageRows);
    }

    const remainingImages = await ProductAttachment.findAll({
      where: {
        product_id,
        is_active: true,
      },
      order: [["id", "ASC"]],
    });

    if (remainingImages.length > 0) {
      await ProductAttachment.update(
        { is_primary: false },
        { where: { product_id } },
      );

      // Static update by id: instance.update() is skipped by Sequelize when
      // the in-memory row already says true, which left no primary image.
      await ProductAttachment.update(
        { is_primary: true },
        { where: { id: remainingImages[0].id } },
      );
    }
  }

  // =========================================================
  // 6. OPTIONS + THEIR VALUES
  // =========================================================
  if (Array.isArray(options)) {
    const existingSizes = await Size.findAll({
      where: { product_id },
      paranoid: false,
    });

    const existingSizeMap = new Map(
      existingSizes.map((s) => [Number(s.id), s]),
    );

    const existingSizeByNameMap = new Map(
      existingSizes.map((s) => [String(s.name).trim().toLowerCase(), s]),
    );

    const keepSizeIds = new Set();

    const cleanedOptionsForMeta = [];

    for (const option of options) {
      const optionName = (option?.name || "").trim();

      if (!optionName || !Array.isArray(option.values)) {
        continue;
      }

      const cleanedValues = [];

      for (const value of option.values) {
        const valueName = (value?.name || "").trim();

        if (!valueName) {
          continue;
        }

        let sizeRow;

        const valueNameKey = valueName.trim().toLowerCase();

        // First preference: frontend supplied an existing size ID
        if (value.id && existingSizeMap.has(Number(value.id))) {
          sizeRow = existingSizeMap.get(Number(value.id));
        } else {
          // Second preference: reuse an existing row with the same
          // product_id + name, including soft-deleted rows
          sizeRow = existingSizeByNameMap.get(valueNameKey) || null;
        }

        if (sizeRow) {
          // Restore soft-deleted row first
          if (sizeRow.deleted_at) {
            await sizeRow.restore();
          }

          // Update existing row
          await sizeRow.update({
            name: valueName,
            type: optionName,
            display_style: option.type || "dropdown",
            measurements: value.measurements || null,
            is_active: true,
          });
        } else {
          // Truly new value
          sizeRow = await Size.create({
            product_id,
            name: valueName,
            type: optionName,
            display_style: option.type || "dropdown",
            measurements: value.measurements || null,
          });
        }

        keepSizeIds.add(sizeRow.id);

        cleanedValues.push({
          id: sizeRow.id,
          name: valueName,
          ...(option.type === "color" ? { color_code: value.color_code } : {}),
          ...(option.type === "size" && value.measurements
            ? { measurements: value.measurements }
            : {}),
        });
      }

      if (cleanedValues.length) {
        cleanedOptionsForMeta.push({
          name: optionName,
          type: option.type || "dropdown",
          values: cleanedValues,
        });
      }
    }

    // Remove Size rows that were removed by admin
    const sizeIdsToRemove = existingSizes
      .map((s) => s.id)
      .filter((id) => !keepSizeIds.has(id));

    if (sizeIdsToRemove.length) {
      const variantsUsingRemovedSizes = await ProductVariant.count({
        where: {
          product_id,
          size_id: { [Op.in]: sizeIdsToRemove },
        },
      });

      if (variantsUsingRemovedSizes > 0) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Can't remove an option value that's still used by a variant. Reassign or remove that variant first.",
        );
      }

      await Size.destroy({
        where: {
          id: { [Op.in]: sizeIdsToRemove },
        },
      });
    }

    // ---------------------------------------------------------
    // Product meta
    // ---------------------------------------------------------
    const parseMeta = (raw) => {
      let value = raw;

      for (let i = 0; i < 2 && typeof value === "string"; i++) {
        try {
          value = JSON.parse(value);
        } catch {
          break;
        }
      }

      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
      }

      return value;
    };

    const existingMeta = parseMeta(product.meta);

    await product.update({
      meta: {
        ...existingMeta,
        options: cleanedOptionsForMeta,
      },
    });
  }

  // =========================================================
  // 7. VARIANTS
  // =========================================================
  if (Array.isArray(variants)) {
    const requestVariants = variants.filter((v) => v && typeof v === "object");

    const nextSku = await createSkuGenerator(product_id, requestVariants);

    const existingVariants = await ProductVariant.findAll({
      where: { product_id },
    });

    const existingVariantMap = new Map(existingVariants.map((v) => [v.id, v]));

    const currentSizes = await Size.findAll({
      where: { product_id },
    });

    const sizeByNameMap = new Map(
      currentSizes.map((s) => [`${s.type}::${s.name}`, s]),
    );

    let variantImageIndex = 0;

    for (const v of requestVariants) {
      // Blank SKU → generated (was: throw "Every variant needs a SKU")
      const sku = resolveSku(v, nextSku);

      // -------------------------------------------------------
      // Resolve option_values
      // -------------------------------------------------------
      let optionValues = v.option_values;

      if (optionValues && typeof optionValues === "string") {
        try {
          optionValues = JSON.parse(optionValues);
        } catch {
          optionValues = [];
        }
      }

      if (!Array.isArray(optionValues)) {
        optionValues = [];
      }

      const colorEntry = optionValues.find(
        (o) => o?.type === "color" && o?.value,
      );

      const nonColorEntry = optionValues.find(
        (o) => o?.type !== "color" && o?.value,
      );

      const resolvedColor = colorEntry?.value || v.color || null;

      const resolvedColorCode = colorEntry?.color_code || v.color_code || null;

      const resolvedSizeName = nonColorEntry?.value || v.size || null;

      const resolvedOptionName = nonColorEntry?.name || v.option_name || "Size";

      let selectedSize = null;

      if (resolvedSizeName) {
        const key = `${resolvedOptionName}::${String(resolvedSizeName).trim()}`;

        selectedSize = sizeByNameMap.get(key) || null;

        if (!selectedSize) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Variant "${sku}" selects "${resolvedSizeName}" for "${resolvedOptionName}", which no longer exists on this product.`,
          );
        }
      }

      // =======================================================
      // PRICING MODE — fixed | tiered | quantity_fixed
      // =======================================================
      const pricingMode =
        v.pricing_mode === "quantity_fixed"
          ? "quantity_fixed"
          : v.pricing_mode === "tiered"
            ? "tiered"
            : v.pricing_mode === "fixed"
              ? "fixed"
              : Array.isArray(v.bulk_pricing) && v.bulk_pricing.length > 0
                ? "tiered"
                : "fixed";

      // =======================================================
      // QUANTITY FIXED PRICING
      // =======================================================
      let quantityPricing = null;

      if (pricingMode === "quantity_fixed") {
        if (!Array.isArray(v.quantity_pricing) || !v.quantity_pricing.length) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Variant "${sku}": quantity_pricing is required for fixed quantity pricing`,
          );
        }

        const seenQuantities = new Set();

        quantityPricing = v.quantity_pricing.map((item, index) => {
          const quantity = Number(item?.quantity);
          const price = Number(item?.price);

          if (!Number.isInteger(quantity) || quantity <= 0) {
            throw new ApiError(
              httpStatus.BAD_REQUEST,
              `Variant "${sku}", Quantity ${index + 1}: quantity must be a positive whole number`,
            );
          }

          if (!Number.isFinite(price) || price <= 0) {
            throw new ApiError(
              httpStatus.BAD_REQUEST,
              `Variant "${sku}", Quantity ${index + 1}: price must be more than 0`,
            );
          }

          if (seenQuantities.has(quantity)) {
            throw new ApiError(
              httpStatus.BAD_REQUEST,
              `Variant "${sku}": quantity ${quantity} is duplicated`,
            );
          }

          seenQuantities.add(quantity);

          return { quantity, price };
        });

        quantityPricing.sort((a, b) => a.quantity - b.quantity);
      }

      // =======================================================
      // FLAT VARIANT PRICE
      // =======================================================
      let variantPrice = Number(v.price || 0);

      if (
        pricingMode === "tiered" &&
        Array.isArray(v.bulk_pricing) &&
        v.bulk_pricing.length > 0 &&
        v.bulk_pricing[0].price !== undefined
      ) {
        variantPrice = Number(v.bulk_pricing[0].price);
      }

      if (
        pricingMode === "quantity_fixed" &&
        Array.isArray(quantityPricing) &&
        quantityPricing.length > 0
      ) {
        variantPrice = Number(quantityPricing[0].price);
      }

      // =======================================================
      // VARIANT FIELDS
      // =======================================================
      const variantFields = {
        sku,
        price: variantPrice,
        case_price: Number(v.case_price || 0),
        stock: Number(v.stock || 0),
        color: resolvedColor,
        color_code: resolvedColorCode,
        size_id: selectedSize?.id || null,
        size: selectedSize?.name || null,
        meta: {
          pricing_mode: pricingMode,
          bulk_pricing:
            pricingMode === "tiered" && Array.isArray(v.bulk_pricing)
              ? v.bulk_pricing
              : null,
          quantity_pricing:
            pricingMode === "quantity_fixed" ? quantityPricing : null,
          option_values: optionValues,
        },
      };

      // =======================================================
      // CREATE / UPDATE VARIANT
      // =======================================================
      let variant;

      if (v.id && existingVariantMap.has(Number(v.id))) {
        variant = existingVariantMap.get(Number(v.id));
        await variant.update(variantFields);
        existingVariantMap.delete(Number(v.id));
      } else {
        variant = await ProductVariant.create({
          ...variantFields,
          product_id,
          supplier: "MANUAL",
          last_supplier_sync_at: new Date(),
        });
      }

      // =======================================================
      // VARIANT IMAGES
      // =======================================================
      const keepImageIds = Array.isArray(v.keep_image_ids)
        ? v.keep_image_ids.map(Number).filter((id) => Number.isInteger(id))
        : [];

      const hasImageInstructions =
        Array.isArray(v.keep_image_ids) || Number(v.image_count) > 0;

      if (hasImageInstructions) {
        if (keepImageIds.length > 0) {
          await VariantAttachment.destroy({
            where: {
              variant_id: variant.id,
              id: { [Op.notIn]: keepImageIds },
            },
          });
        } else {
          await VariantAttachment.destroy({
            where: { variant_id: variant.id },
          });
        }

        const newImageCount = Number(v.image_count) || 0;
        const variantImageRows = [];

        for (let i = 0; i < newImageCount; i++) {
          const file = files?.variant_images?.[variantImageIndex];

          if (!file) {
            break;
          }

          variantImageRows.push({
            variant_id: variant.id,
            file_name: file.filename,
            file_uri: `${process.env.IMAGE_BASE_URL}/images/${file.filename}`,
            file_size: file.size,
            is_primary: false,
            supplier: "MANUAL",
            source_url: null,
            file_type: "image",
          });

          variantImageIndex++;
        }

        if (variantImageRows.length > 0) {
          await VariantAttachment.bulkCreate(variantImageRows);
        }

        const remainingVariantImages = await VariantAttachment.findAll({
          where: {
            variant_id: variant.id,
            is_active: true,
          },
          order: [["id", "ASC"]],
        });

        if (remainingVariantImages.length > 0) {
          await VariantAttachment.update(
            { is_primary: false },
            { where: { variant_id: variant.id } },
          );

          // Static update by id — same reason as product images above.
          await VariantAttachment.update(
            { is_primary: true },
            { where: { id: remainingVariantImages[0].id } },
          );
        }
      }
    }

    // =======================================================
    // DELETE VARIANTS REMOVED BY ADMIN
    // =======================================================
    for (const variant of existingVariantMap.values()) {
      await VariantAttachment.destroy({
        where: { variant_id: variant.id },
      });

      await variant.destroy();
    }
  }

  // =========================================================
  // 8. RETURN FULLY LOADED PRODUCT
  // =========================================================
  return Product.findOne({
    where: { id: product_id },
    include: [
      { model: ProductAttachment, as: "attachments" },
      { model: Size, as: "sizes" },
      {
        model: ProductVariant,
        as: "variants",
        include: [{ model: VariantAttachment, as: "images" }],
      },
    ],
  });
};

const toImageUrl = (image) => {
  const uri = String(image?.file_uri || "").trim();

  if (/^https?:\/\//i.test(uri)) return uri;

  const base = String(process.env.IMAGE_BASE_URL || "").replace(/\/+$/, "");
  const path = uri.replace(/^\/+/, "");

  if (path) {
    return path.includes("/") ? `${base}/${path}` : `${base}/images/${path}`;
  }

  return image?.file_name ? `${base}/images/${image.file_name}` : null;
};

const duplicateProduct = async (productId) => {
  try {
    if (!productId) {
      throw new ApiError(httpStatus.BAD_REQUEST, "product_id is required");
    }

    // 1. Original product — manual only
    const product = await Product.findOne({
      where: {
        id: productId,
        is_active: true,
      },
    });

    if (!product) {
      throw new ApiError(httpStatus.NOT_FOUND, "Product not found");
    }

    if (product.supplier !== "MANUAL") {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Only manually-created products can be duplicated.",
      );
    }

    // 2. Product images
    const productImages = await ProductAttachment.findAll({
      where: {
        product_id: product.id,
        is_active: true,
      },
      order: [["id", "ASC"]],
    });

    // 3. Categories
    const categoryMappings = await ProductCategoryMapping.findAll({
      where: {
        product_id: product.id,
      },
    });

    const categoryIds = categoryMappings.map(
      (mapping) => mapping.product_category_id,
    );

    // 4. Options — Size ids are NOT copied; createProduct makes new rows
    const parseMeta = (raw) => {
      let value = raw;

      for (let i = 0; i < 2 && typeof value === "string"; i++) {
        try {
          value = JSON.parse(value);
        } catch {
          break;
        }
      }

      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
      }

      return value;
    };

    const productMeta = parseMeta(product.meta);

    const options = Array.isArray(productMeta.options)
      ? productMeta.options.map((option) => ({
          name: option?.name || "",
          type: option?.type || "dropdown",
          values: Array.isArray(option?.values)
            ? option.values.map((value) => ({
                name: value?.name || "",
                ...(value?.color_code ? { color_code: value.color_code } : {}),
                ...(value?.measurements
                  ? { measurements: value.measurements }
                  : {}),
              }))
            : [],
        }))
      : [];

    // 5. Variants
    const variants = await ProductVariant.findAll({
      where: {
        product_id: product.id,
      },
      order: [["id", "ASC"]],
    });

    const variantIds = variants.map((variant) => variant.id);

    // 6. Variant images, grouped by variant
    let variantImages = [];

    if (variantIds.length) {
      variantImages = await VariantAttachment.findAll({
        where: {
          variant_id: {
            [Op.in]: variantIds,
          },
          is_active: true,
        },
        order: [["id", "ASC"]],
      });
    }

    const variantImagesMap = new Map();

    for (const image of variantImages) {
      if (!variantImagesMap.has(image.variant_id)) {
        variantImagesMap.set(image.variant_id, []);
      }

      variantImagesMap.get(image.variant_id).push(image);
    }

    // 7. Variants shaped for the Duplicate page
    const duplicateVariants = variants.map((variant) => {
      const variantMeta = parseMeta(variant.meta);

      const pricingMode =
        variantMeta?.pricing_mode ||
        (Array.isArray(variantMeta?.bulk_pricing) &&
        variantMeta.bulk_pricing.length
          ? "tiered"
          : "fixed");

      const optionValues = Array.isArray(variantMeta?.option_values)
        ? variantMeta.option_values.map((option) => ({
            name: option?.name || "",
            value: option?.value || "",
            type: option?.type || "dropdown",
            ...(option?.color_code ? { color_code: option.color_code } : {}),
          }))
        : [];

      const bulkPricing =
        pricingMode === "tiered" && Array.isArray(variantMeta?.bulk_pricing)
          ? variantMeta.bulk_pricing.map((tier) => ({
              min_qty: Number(tier?.min_qty || 0),
              max_qty:
                tier?.max_qty === null || tier?.max_qty === undefined
                  ? null
                  : Number(tier.max_qty),
              price: Number(tier?.price || 0),
            }))
          : null;

      const quantityPricing =
        pricingMode === "quantity_fixed" &&
        Array.isArray(variantMeta?.quantity_pricing)
          ? variantMeta.quantity_pricing.map((item) => ({
              quantity: Number(item?.quantity || 0),
              price: Number(item?.price || 0),
            }))
          : null;

      const images = variantImagesMap.get(variant.id) || [];

      return {
        // No original variant id, and SKU left blank on purpose
        sku: "",
        price: Number(variant.price || 0),
        case_price: Number(variant.case_price || 0),
        stock: Number(variant.stock || 0),
        color: variant.color || null,
        color_code: variant.color_code || null,

        pricing_mode: pricingMode,
        bulk_pricing: bulkPricing,
        quantity_pricing: quantityPricing,

        option_values: optionValues,

        // Existing images as references
        // Frontend re-uploads them
        images: images.map((image) => ({
          id: image.id,
          file_name: image.file_name,
          file_uri: toImageUrl(image),
          file_size: image.file_size,
          is_primary: !!image.is_primary,
        })),
      };
    });

    // 8. Product Add-ons
    const productAddOns = await ProductAddOn.findAll({
      where: {
        product_id: product.id,
      },
      order: [
        ["sort_order", "ASC"],
        ["id", "ASC"],
      ],
    });

    const addons = productAddOns.map((mapping) => ({
      // Do NOT copy mapping id
      // Do NOT copy product_id
      addon_product_id: mapping.addon_product_id,

      // Important:
      // Keep the product-specific overridden price.
      // Example:
      // Master add-on = $10
      // Original product add-on = $5
      // Duplicate should also use $5.
      price: Number(mapping.price || 0),

      sort_order: Number(mapping.sort_order || 0),
    }));

    // 9. Response
    return {
      name: `${product.name} Copy`,
      description: product.description || "",

      brand_id: product.brand_id || null,

      category_ids: categoryIds,

      images: productImages.map((image) => ({
        id: image.id,
        file_name: image.file_name,
        file_uri: toImageUrl(image),
        file_size: image.file_size,
        is_primary: !!image.is_primary,
      })),

      options,

      variants: duplicateVariants,

      // NEW
      addons,

      duplicate_from_product_id: product.id,
      original_product_name: product.name,
    };
  } catch (error) {
    console.error("duplicateProduct error:", error);
    throw error;
  }
};

// const addProductVariants = async (body, files) => {
//   try {
//     let { product_id, variants } = body;

//     if (variants && typeof variants === "string") {
//       variants = JSON.parse(variants);
//     }

//     if (!Array.isArray(variants) || !variants.length) {
//       throw new Error("variants required");
//     }

//     const createdVariants = [];

//     let imageIndex = 0;

//     const sizes = await Size.findAll({
//       where: { product_id },
//     });

//     const sizeMap = new Map(sizes.map((s) => [s.id, s]));

//     for (const v of variants) {
//       if (!v.sku) {
//         throw new Error("sku required");
//       }

//       let selectedSize = null;

//       if (v.size_id) {
//         selectedSize = sizeMap.get(Number(v.size_id));
//       } else if (v.size) {
//         const sizeName = String(v.size).trim();

//         selectedSize = await Size.findOne({
//           where: {
//             product_id,
//             name: sizeName,
//           },
//         });

//         if (!selectedSize) {
//           selectedSize = await Size.create({
//             product_id,
//             name: sizeName,
//             type: v.option_name || "Size",
//           });

//           sizeMap.set(selectedSize.id, selectedSize);
//         }
//       }

//       // ✅ Use first bulk pricing tier as variant price
//       let variantPrice = Number(v.price || 0);

//       if (
//         Array.isArray(v.bulk_pricing) &&
//         v.bulk_pricing.length > 0 &&
//         v.bulk_pricing[0].price !== undefined
//       ) {
//         variantPrice = Number(v.bulk_pricing[0].price);
//       }

//       const variant = await ProductVariant.create({
//         product_id,

//         sku: v.sku,

//         price: variantPrice,

//         case_price: Number(v.case_price || 0),

//         stock: Number(v.stock || 0),

//         color: v.color || null,

//         color_code: v.color_code || null,

//         size_id: selectedSize?.id || null,

//         size: selectedSize?.name || null,

//         supplier: "MANUAL",

//         last_supplier_sync_at: new Date(),

//         meta: {
//           bulk_pricing: Array.isArray(v.bulk_pricing) ? v.bulk_pricing : [],
//         },
//       });

//       const variantImages = [];

//       if (files?.variant_images?.length) {
//         const count = Number(v.image_count || 1);

//         for (let j = 0; j < count; j++) {
//           const file = files.variant_images[imageIndex];

//           if (!file) break;

//           variantImages.push({
//             variant_id: variant.id,
//             file_name: file.filename,
//             file_uri: `${process.env.IMAGE_BASE_URL}/images/${file.filename}`,
//             file_size: file.size,
//             is_primary: j === 0,
//             supplier: "MANUAL",
//             source_url: null,
//             file_type: "image",
//           });

//           imageIndex++;
//         }
//       }

//       if (variantImages.length) {
//         await VariantAttachment.bulkCreate(variantImages);
//       }

//       createdVariants.push(variant);
//     }

//     return createdVariants;
//   } catch (error) {
//     console.error(error);
//     console.error(error.message);
//     console.error(error.stack);
//     console.error(error.parent);
//     console.error(error.original);

//     throw error;
//   }
// };

const getSearchVariants = (search) => {
  if (!search) return [];

  const original = search.trim().toLowerCase();

  const variants = new Set();

  variants.add(original);

  // Remove duplicate spaces
  variants.add(original.replace(/\s+/g, " "));

  // t-shirt -> t shirt
  variants.add(original.replace(/-/g, " "));

  // t shirt -> tshirt
  variants.add(original.replace(/[\s-]/g, ""));

  // tshirt -> t-shirt
  variants.add(original.replace(/([a-z])shirt/g, "$1-shirt"));

  // tshirt -> t shirt
  variants.add(original.replace(/([a-z])shirt/g, "$1 shirt"));

  // Singular / plural
  if (original.endsWith("s")) {
    variants.add(original.slice(0, -1));
  } else {
    variants.add(`${original}s`);
  }

  return [...variants];
};

function buildColorFilter(colors = []) {
  const conditions = [];

  colors.forEach((color) => {
    const keywords = COLOR_FILTERS[color] || [color];

    keywords.forEach((keyword) => {
      conditions.push({
        color: {
          [Op.like]: `%${keyword}%`,
        },
      });
    });
  });

  return conditions;
}

const GENDER_KEYWORDS = {
  MEN: ["mens", " men ", " men-", "(men)", " men/"],
  WOMEN: ["women", "ladies", "female", "women's"],
  YOUTH: ["youth"],
  TODDLER: ["toddler"],
  INFANT: ["infant", "baby"],
  UNISEX: ["unisex"],
};

const FABRIC_KEYWORDS = {
  COTTON: ["cotton"],
  POLYESTER: ["polyester"],
  FLEECE: ["fleece"],
  CANVAS: ["canvas"],
  DENIM: ["denim"],
  NYLON: ["nylon"],
};

const getAllProducts = async (query) => {
  try {
    let {
      category_id,
      brand_id,
      page = 1,
      limit = 20,
      search,
      sort = "newest",
      size,
      color,
      in_stock,
      min_price,
      max_price,
      gender,
      fabric,
      tier, // NEW — 'primary' | 'secondary' | 'budget'
      use_case_id,
    } = query;

    page = parseInt(page) || 1;
    limit = parseInt(limit) || 20;

    const offset = (page - 1) * limit;

    // Convert category ids
    if (category_id && typeof category_id === "string") {
      category_id = category_id.split(",").map(Number);
    }

    // Multiple brand ids
    if (brand_id) {
      brand_id = brand_id.split(",").map(Number).filter(Boolean);
    }

    // Multiple sizes
    if (size) {
      size = size.split(",").map((s) => s.trim());
    }

    // Multiple colors
    if (color) {
      color = color.split(",").map((c) => c.trim());
    }

    min_price = min_price ? Number(min_price) : null;
    max_price = max_price ? Number(max_price) : null;

    const genderKeywords = gender
      ? gender
          .split(",")
          .flatMap((g) => GENDER_KEYWORDS[g.trim().toUpperCase()] || [])
      : [];

    const fabricKeywords = fabric
      ? fabric
          .split(",")
          .flatMap((f) => FABRIC_KEYWORDS[f.trim().toUpperCase()] || [])
      : [];

    let filteredProductIds = null;

    const hasVariantFilters =
      size?.length ||
      color?.length ||
      in_stock === "true" ||
      min_price !== null ||
      max_price !== null;

    const pricingMarkups = await PricingMarkup.findAll({
      where: { is_active: true },
      attributes: ["supplier", "markup_percent"],
      raw: true,
    });

    const markupMap = {};
    pricingMarkups.forEach((item) => {
      markupMap[item.supplier] = Number(item.markup_percent);
    });

    if (hasVariantFilters) {
      const variantWhere = { is_active: true };

      if (size?.length) variantWhere.size = { [Op.in]: size };
      if (color?.length) variantWhere[Op.or] = buildColorFilter(color);
      if (in_stock === "true") variantWhere.stock = { [Op.gt]: 0 };

      const matchingVariants = await ProductVariant.findAll({
        where: variantWhere,
        attributes: ["product_id", "price", "case_price", "supplier"],
        raw: true,
      });
      const productIdSet = new Set();

      for (const variant of matchingVariants) {
        const effectivePrice =
          variant.case_price && Number(variant.case_price) > 0
            ? Number(variant.case_price)
            : Number(variant.price);

        const pricing = await calculatePricing(
          effectivePrice,
          variant.supplier,
          markupMap[variant.supplier],
        );

        const finalPrice = pricing.final_price;

        if (
          (min_price === null || finalPrice >= min_price) &&
          (max_price === null || finalPrice <= max_price)
        ) {
          productIdSet.add(variant.product_id);
        }
      }

      filteredProductIds = [...productIdSet];

      if (!filteredProductIds.length) {
        return {
          data: [],
          pagination: { total: 0, page, limit, totalPages: 0 },
        };
      }
    }

    const whereCondition = {
      is_active: true,
      is_discontinued: false,
    };

    if (filteredProductIds) {
      whereCondition.id = { [Op.in]: filteredProductIds };
    }

    // Brand filter
    if (brand_id?.length) {
      whereCondition.brand_id = { [Op.in]: brand_id };
    }

    // ── Tier filter (Primary / Secondary / Budget / All) ──────────────
    // "all" means the UNION of every tier's products (still narrows the
    // catalog to tiered products) — omitting the param entirely is what
    // shows the untouched full catalog.
    if (tier) {
      if (!use_case_id) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "use_case_id is required when filtering by tier",
        );
      }

      // Support:
      // use_case_id=25
      // use_case_id=25,7
      const useCaseIds = String(use_case_id)
        .split(",")
        .map((id) => Number(id.trim()))
        .filter(Boolean);

      if (!useCaseIds.length) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Valid use_case_id is required when filtering by tier",
        );
      }

      // Get products for every selected use case
      // and merge them into one unique list.
      const tierProductSet = new Set();

      for (const useCaseId of useCaseIds) {
        const productIds =
          tier === "all"
            ? await resolveAllTierProductIds(useCaseId)
            : await resolveTierProductIds(tier, useCaseId);

        productIds.forEach((productId) => {
          tierProductSet.add(productId);
        });
      }

      const tierProductIds = [...tierProductSet];

      if (!tierProductIds.length) {
        return {
          data: [],
          pagination: {
            total: 0,
            page,
            limit,
            totalPages: 0,
          },
        };
      }

      if (whereCondition.id) {
        whereCondition.id = {
          [Op.in]: whereCondition.id[Op.in].filter((id) =>
            tierProductSet.has(id),
          ),
        };

        if (!whereCondition.id[Op.in].length) {
          return {
            data: [],
            pagination: {
              total: 0,
              page,
              limit,
              totalPages: 0,
            },
          };
        }
      } else {
        whereCondition.id = {
          [Op.in]: tierProductIds,
        };
      }
    }

    if (search) {
      const searchVariants = getSearchVariants(search);
      const searchProductIds = new Set();

      const productMatches = await Product.findAll({
        where: {
          [Op.or]: searchVariants.flatMap((term) => [
            { name: { [Op.like]: `%${term}%` } },
            { description: { [Op.like]: `%${term}%` } },
            { external_style_id: { [Op.like]: `%${term}%` } },
            { external_style_name: { [Op.like]: `%${term}%` } },
          ]),
        },
        attributes: ["id"],
        raw: true,
      });
      productMatches.forEach((p) => searchProductIds.add(p.id));

      const brands = await Brand.findAll({
        where: {
          [Op.or]: searchVariants.map((term) => ({
            name: { [Op.like]: `%${term}%` },
          })),
        },
        attributes: ["id"],
        raw: true,
      });

      const categories = await ProductCategory.findAll({
        where: {
          [Op.or]: searchVariants.map((term) => ({
            title: { [Op.like]: `%${term}%` },
          })),
        },
        attributes: ["id"],
        raw: true,
      });

      if (categories.length) {
        const mappings = await ProductCategoryMapping.findAll({
          where: {
            product_category_id: { [Op.in]: categories.map((c) => c.id) },
          },
          attributes: ["product_id"],
          raw: true,
        });
        mappings.forEach((m) => searchProductIds.add(m.product_id));
      }

      const parentCategories = await ParentCategory.findAll({
        where: {
          [Op.or]: searchVariants.map((term) => ({
            title: { [Op.like]: `%${term}%` },
          })),
        },
        include: [
          {
            model: ProductCategory,
            as: "categories",
            attributes: ["id"],
            through: { attributes: [] },
          },
        ],
      });

      for (const parent of parentCategories) {
        const categoryIds = parent.categories.map((c) => c.id);
        if (!categoryIds.length) continue;

        const mappings = await ProductCategoryMapping.findAll({
          where: { product_category_id: { [Op.in]: categoryIds } },
          attributes: ["product_id"],
          raw: true,
        });
        mappings.forEach((m) => searchProductIds.add(m.product_id));
      }

      if (brands.length) {
        const brandProducts = await Product.findAll({
          where: { brand_id: { [Op.in]: brands.map((b) => b.id) } },
          attributes: ["id"],
          raw: true,
        });
        brandProducts.forEach((p) => searchProductIds.add(p.id));
      }

      const colorVariants = await ProductVariant.findAll({
        where: {
          [Op.or]: searchVariants.map((term) => ({
            color: { [Op.like]: `%${term}%` },
          })),
        },
        attributes: ["product_id"],
        raw: true,
      });
      colorVariants.forEach((v) => searchProductIds.add(v.product_id));

      if (!searchProductIds.size) {
        return {
          data: [],
          pagination: { total: 0, page, limit, totalPages: 0 },
        };
      }

      if (whereCondition.id) {
        whereCondition.id = {
          [Op.in]: whereCondition.id[Op.in].filter((id) =>
            searchProductIds.has(id),
          ),
        };
        if (!whereCondition.id[Op.in].length) {
          return {
            data: [],
            pagination: { total: 0, page, limit, totalPages: 0 },
          };
        }
      } else {
        whereCondition.id = { [Op.in]: [...searchProductIds] };
      }
    }

    if (genderKeywords.length || fabricKeywords.length) {
      const filters = [];

      genderKeywords.forEach((k) => {
        filters.push(
          { name: { [Op.like]: `%${k}%` } },
          { description: { [Op.like]: `%${k}%` } },
          { meta: { [Op.like]: `%${k}%` } },
        );
      });

      fabricKeywords.forEach((k) => {
        filters.push(
          { name: { [Op.like]: `%${k}%` } },
          { description: { [Op.like]: `%${k}%` } },
          { meta: { [Op.like]: `%${k}%` } },
        );
      });

      const matches = await Product.findAll({
        where: { [Op.or]: filters },
        attributes: ["id", "name", "description", "meta"],
        raw: true,
      });

      const ids = new Set(matches.map((p) => p.id));

      if (whereCondition.id) {
        whereCondition.id = {
          [Op.in]: whereCondition.id[Op.in].filter((id) => ids.has(id)),
        };
      } else {
        whereCondition.id = { [Op.in]: [...ids] };
      }
    }

    // Sorting
    let order = [["created_at", "DESC"]];

    switch (sort) {
      case "name_asc":
        order = [["name", "ASC"]];
        break;
      case "name_desc":
        order = [["name", "DESC"]];
        break;
      case "newest":
      default:
        order = [["created_at", "DESC"]];
        break;
    }

    const { rows, count } = await Product.findAndCountAll({
      where: whereCondition,
      include: [
        {
          model: ProductCategory,
          as: "categories",
          attributes: ["id", "title"],
          through: { attributes: [] },
          required: !!category_id,
          include: [
            {
              model: ParentCategory,
              as: "parent_categories",
              attributes: ["id", "title"],
              through: { attributes: [] },
              required: !!category_id,
              where: category_id ? { id: { [Op.in]: category_id } } : undefined,
            },
          ],
        },
        { model: ProductAttachment, as: "attachments", required: false },
        {
          model: Brand,
          as: "brand",
          attributes: ["id", "name"],
          required: false,
        },
      ],
      distinct: true,
      limit,
      offset,
      order,
    });

    const productIds = rows.map((p) => p.id);

    const variants = await ProductVariant.findAll({
      where: { product_id: { [Op.in]: productIds }, is_active: true },
      attributes: [
        "product_id",
        "price",
        "case_price",
        "supplier",
        "size",
        "color",
        "stock",
      ],
      raw: true,
    });

    const variantMap = {};

    for (const variant of variants) {
      const effectivePrice =
        variant.case_price && Number(variant.case_price) > 0
          ? Number(variant.case_price)
          : Number(variant.price);

      if (
        !variantMap[variant.product_id] ||
        effectivePrice < variantMap[variant.product_id].effectivePrice
      ) {
        variantMap[variant.product_id] = { ...variant, effectivePrice };
      }
    }

    const formattedProducts = await Promise.all(
      rows.map(async (product) => {
        const data = product.toJSON();

        data.attachments = (data.attachments || []).sort((a, b) => {
          const aFront = a.file_name?.includes("-0.");
          const bFront = b.file_name?.includes("-0.");
          if (aFront && !bFront) return -1;
          if (!aFront && bFront) return 1;
          return 0;
        });

        const minVariant = variantMap[data.id];

        let pricing = {
          base_price: 0,
          markup_percent: 0,
          markup_amount: 0,
          final_price: 0,
        };
        let effectivePrice = 0;

        if (minVariant) {
          effectivePrice = minVariant.effectivePrice;
          pricing = await calculatePricing(
            effectivePrice,
            minVariant.supplier,
            markupMap[minVariant.supplier],
          );
        }

        return {
          ...data,
          name: decodeHtmlEntities(data.name),
          original_price: minVariant ? Number(minVariant.price || 0) : 0,
          case_price: effectivePrice,
          price: pricing.final_price,
          base_price: pricing.base_price,
          markup_percent: pricing.markup_percent,
          markup_amount: pricing.markup_amount,
          used_case_price:
            !!minVariant?.case_price && Number(minVariant.case_price) > 0,
        };
      }),
    );

    return {
      data: formattedProducts,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    };
  } catch (error) {
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getAllProductsByGrandCategory = async (query) => {
  try {
    let { grand_category_id, brand_id, page = 1, limit = 20, search } = query;

    page = parseInt(page) || 1;
    limit = parseInt(limit) || 20;

    const offset = (page - 1) * limit;

    if (!grand_category_id) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "grand_category_id is required",
      );
    }

    grand_category_id = Number(grand_category_id);

    if (brand_id) {
      brand_id = Number(brand_id);
    }

    if (brand_id && grand_category_id) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Pass either grand_category_id or brand_id, not both",
      );
    }

    // Get all parent categories of this grand category
    const grandCategory = await GrandCategory.findOne({
      where: {
        id: grand_category_id,
        is_active: true,
      },
      include: [
        {
          model: ParentCategory,
          as: "parent_categories",
          attributes: ["id"],
          through: {
            attributes: [],
          },
        },
      ],
    });

    if (!grandCategory) {
      throw new ApiError(httpStatus.NOT_FOUND, "Grand category not found");
    }

    const parentCategoryIds = grandCategory.parent_categories.map(
      (parent) => parent.id,
    );

    const whereCondition = {
      is_active: true,
      is_discontinued: false,
    };

    if (brand_id !== undefined && brand_id !== null) {
      whereCondition.brand_id = brand_id;
    }

    if (search) {
      whereCondition[Op.or] = [
        {
          name: {
            [Op.like]: `%${search}%`,
          },
        },
        {
          description: {
            [Op.like]: `%${search}%`,
          },
        },
      ];
    }

    const { rows, count } = await Product.findAndCountAll({
      where: whereCondition,

      include: [
        {
          model: ProductCategory,
          as: "categories",
          attributes: ["id", "title"],
          through: {
            attributes: [],
          },
          required: true,
          include: [
            {
              model: ParentCategory,
              as: "parent_categories",
              attributes: ["id", "title"],
              through: {
                attributes: [],
              },
              required: true,
              where: {
                id: {
                  [Op.in]: parentCategoryIds,
                },
              },
            },
          ],
        },
        {
          model: ProductAttachment,
          as: "attachments",
          required: false,
        },
        {
          model: Brand,
          as: "brand",
          required: false,
        },
      ],

      distinct: true,
      limit,
      offset,
      order: [["created_at", "DESC"]],
    });

    const productIds = rows.map((p) => p.id);

    const variants = await ProductVariant.findAll({
      where: {
        product_id: {
          [Op.in]: productIds,
        },
        is_active: true,
      },
      attributes: ["product_id", "price", "case_price", "supplier"],
      raw: true,
    });

    const variantMap = {};

    for (const variant of variants) {
      const effectivePrice =
        variant.case_price && Number(variant.case_price) > 0
          ? Number(variant.case_price)
          : Number(variant.price);

      if (
        !variantMap[variant.product_id] ||
        effectivePrice < variantMap[variant.product_id].effectivePrice
      ) {
        variantMap[variant.product_id] = {
          ...variant,
          effectivePrice,
        };
      }
    }

    const formattedProducts = await Promise.all(
      rows.map(async (product) => {
        const data = product.toJSON();

        data.attachments = (data.attachments || []).sort((a, b) => {
          const aFront = a.file_name?.includes("-0.");
          const bFront = b.file_name?.includes("-0.");

          if (aFront && !bFront) return -1;
          if (!aFront && bFront) return 1;

          return 0;
        });

        const minVariant = variantMap[data.id];

        let pricing = {
          base_price: 0,
          markup_percent: 0,
          markup_amount: 0,
          final_price: 0,
        };

        let effectivePrice = 0;

        if (minVariant) {
          effectivePrice = minVariant.effectivePrice;
          pricing = await calculatePricing(effectivePrice, minVariant.supplier);
        }

        return {
          ...data,
          name: decodeHtmlEntities(data.name),
          original_price: minVariant ? Number(minVariant.price || 0) : 0,
          case_price: effectivePrice,
          price: pricing.final_price,
          base_price: pricing.base_price,
          markup_percent: pricing.markup_percent,
          markup_amount: pricing.markup_amount,
          used_case_price:
            !!minVariant?.case_price && Number(minVariant.case_price) > 0,
        };
      }),
    );

    return {
      data: formattedProducts,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    };
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getProductsByBrand = async (query) => {
  try {
    let { brand_id, page = 1, limit = 20, search } = query;

    if (!brand_id) {
      throw new ApiError(httpStatus.BAD_REQUEST, "brand_id is required");
    }

    page = parseInt(page) || 1;
    limit = parseInt(limit) || 20;
    brand_id = parseInt(brand_id);

    const offset = (page - 1) * limit;

    const whereCondition = {
      is_active: true,
      is_discontinued: false,
      brand_id,
    };

    if (search) {
      whereCondition[Op.or] = [
        {
          name: {
            [Op.like]: `%${search}%`,
          },
        },
        {
          description: {
            [Op.like]: `%${search}%`,
          },
        },
      ];
    }

    const { rows, count } = await Product.findAndCountAll({
      where: whereCondition,

      include: [
        {
          model: ProductCategory,
          as: "categories",
          attributes: ["id", "title"],
          through: {
            attributes: [],
          },

          include: [
            {
              model: ParentCategory,
              as: "parent_categories",
              attributes: ["id", "title"],
              through: {
                attributes: [],
              },
            },
          ],
        },

        {
          model: ProductAttachment,
          as: "attachments",
          required: false,
        },

        {
          model: Brand,
          as: "brand",
          required: false,
        },
      ],

      distinct: true,
      limit,
      offset,
      order: [["created_at", "DESC"]],
    });

    const productIds = rows.map((p) => p.id);

    const variants = await ProductVariant.findAll({
      where: {
        product_id: {
          [Op.in]: productIds,
        },
        is_active: true,
      },

      attributes: ["product_id", "price", "case_price", "supplier"],

      raw: true,
    });

    const variantMap = {};

    for (const variant of variants) {
      const effectivePrice =
        variant.case_price && Number(variant.case_price) > 0
          ? Number(variant.case_price)
          : Number(variant.price);

      if (
        !variantMap[variant.product_id] ||
        effectivePrice < variantMap[variant.product_id].effectivePrice
      ) {
        variantMap[variant.product_id] = {
          ...variant,
          effectivePrice,
        };
      }
    }

    const formattedProducts = await Promise.all(
      rows.map(async (product) => {
        const data = product.toJSON();

        const minVariant = variantMap[data.id];

        let pricing = {
          base_price: 0,
          markup_percent: 0,
          markup_amount: 0,
          final_price: 0,
        };

        let effectivePrice = 0;

        if (minVariant) {
          effectivePrice = minVariant.effectivePrice;

          pricing = await calculatePricing(effectivePrice, minVariant.supplier);
        }

        return {
          ...data,

          name: decodeHtmlEntities(data.name),

          original_price: minVariant ? Number(minVariant.price || 0) : 0,

          case_price: effectivePrice,

          price: pricing.final_price,

          base_price: pricing.base_price,

          markup_percent: pricing.markup_percent,

          markup_amount: pricing.markup_amount,

          used_case_price:
            !!minVariant?.case_price && Number(minVariant.case_price) > 0,
        };
      }),
    );

    return {
      data: formattedProducts,

      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    };
  } catch (error) {
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getProductById = async (id, reqBody) => {
  try {
    const { user } = reqBody;

    const product = await Product.findOne({
      where: {
        id,
        is_active: true,
        is_discontinued: false,
      },
      include: [
        {
          model: Brand,
          as: "brand",
          required: false,
        },
      ],
    });

    if (!product) {
      throw new ApiError(httpStatus.NOT_FOUND, "Product not found");
    }

    const [variants, attachments, sizes, categories, markupPercent] =
      await Promise.all([
        /* ---------------- VARIANTS ---------------- */

        ProductVariant.findAll({
          where: {
            product_id: product.id,
            is_active: true,
          },
          order: [["id", "ASC"]],
        }),

        /* ---------------- PRODUCT ATTACHMENTS ---------------- */

        ProductAttachment.findAll({
          where: {
            product_id: product.id,
            is_active: true,
          },
        }),

        /* ---------------- PRODUCT SIZES ---------------- */

        Size.findAll({
          where: {
            product_id: product.id,
            is_active: true,
          },
        }),

        /* ---------------- PRODUCT CATEGORIES ---------------- */

        ProductCategory.findAll({
          attributes: ["id", "title", "supplier"],

          include: [
            {
              model: Product,
              as: "products",
              where: {
                id: product.id,
              },
              attributes: [],
              through: {
                attributes: [],
              },
            },
            {
              model: ParentCategory,
              as: "parent_categories",
              attributes: ["id", "title"],
              through: {
                attributes: [],
              },
              required: false,

              include: [
                {
                  model: GrandCategory,
                  as: "grand_categories",
                  attributes: ["id", "title"],
                  through: {
                    attributes: [],
                  },
                  required: false,
                },
              ],
            },
          ],
        }),

        /* ---------------- MARKUP ---------------- */

        getMarkupPercent(product.supplier),
      ]);

    const variantIds = variants.map((v) => v.id);

    const sizeIds = [
      ...new Set(variants.map((v) => v.size_id).filter(Boolean)),
    ];

    const [variantImages, variantSizeDetails] = await Promise.all([
      VariantAttachment.findAll({
        where: {
          variant_id: variantIds,
          is_active: true,
        },

        attributes: ["id", "variant_id", "file_name", "file_uri", "is_primary"],
      }),

      Size.findAll({
        where: {
          id: sizeIds,
        },

        attributes: ["id", "name", "measurements"],
        raw: false,
      }),
    ]);

    let cartMap = {};
    let wishlistSet = new Set();

    if (user) {
      const [cartItems, wishlistItems] = await Promise.all([
        Cart.findAll({
          where: {
            user_id: user.id,
            is_active: true,
          },
          attributes: ["variant_id", "quantity"],
        }),

        Wishlist.findAll({
          where: {
            user_id: user.id,
            is_active: true,
          },
          attributes: ["variant_id"],
        }),
      ]);

      cartItems.forEach((item) => {
        cartMap[item.variant_id] = item.quantity;
      });

      wishlistItems.forEach((item) => {
        wishlistSet.add(item.variant_id);
      });
    }

    const data = product.toJSON();

    data.name = decodeHtmlEntities(data.name);

    data.attachments = attachments.map((a) => a.toJSON());

    data.sizes = sortSizes(sizes.map((s) => s.toJSON()));

    data.categories = categories.map((c) => c.toJSON());

    if (data.supplier === "SANMAR") {
      data.attachments.sort((a, b) => {
        const aFront = a.file_name?.includes("-0.");
        const bFront = b.file_name?.includes("-0.");

        if (aFront && !bFront) return -1;
        if (!aFront && bFront) return 1;

        return 0;
      });
    }

    const imageMap = {};

    variantImages.forEach((img) => {
      const image = img.toJSON();

      if (!imageMap[image.variant_id]) {
        imageMap[image.variant_id] = [];
      }

      imageMap[image.variant_id].push(image);
    });

    const sizeMap = {};

    variantSizeDetails.forEach((size) => {
      sizeMap[size.id] = size.toJSON();
    });

    data.variants = await Promise.all(
      variants.map(async (variant) => {
        const v = variant.toJSON();

        v.title = decodeHtmlEntities(v.title);

        /* ---------- ATTACH IMAGES ---------- */

        v.images = imageMap[v.id] || [];

        /* ---------- ATTACH SIZE ---------- */

        v.size_details = sizeMap[v.size_id] || null;

        /* ---------- SANMAR IMAGE SORT ---------- */

        if (product.supplier === "SANMAR") {
          v.images.sort((a, b) => {
            const aNum = Number(
              a.file_name?.match(/variant-(\d+)/)?.[1] || 999,
            );

            const bNum = Number(
              b.file_name?.match(/variant-(\d+)/)?.[1] || 999,
            );

            return aNum - bNum;
          });
        }

        /* ---------- PRICE ---------- */

        const effectivePrice =
          v.case_price && Number(v.case_price) > 0 ? v.case_price : v.price;

        const pricing = await calculatePricing(
          effectivePrice,
          v.supplier,
          markupPercent,
        );

        return {
          ...v,

          title: decodeHtmlEntities(v.title),

          size: v.size_details?.name || null,

          base_price: pricing.base_price,

          markup_percent: pricing.markup_percent,

          markup_amount: pricing.markup_amount,

          price: pricing.final_price,

          original_price: Number(v.price || 0),

          case_price: Number(v.case_price || 0),

          used_case_price: !!v.case_price && Number(v.case_price) > 0,

          is_in_cart: !!cartMap[v.id],

          cart_quantity: cartMap[v.id] || 0,

          is_in_wishlist: wishlistSet.has(v.id),

          pricing_tiers: buildPricingTiers(
            v.meta,
            pricing.markup_percent,
            false,
          ),

          pricing_tiers_customer: buildPricingTiers(
            v.meta,
            markupPercent,
            false,
          ),
        };
      }),
    );

    data.variants = sortSizes(data.variants);

    return data;
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getVariantById = async (id) => {
  const variant = await ProductVariant.findOne({
    where: {
      id,
      is_active: true,
      // is_discontinued: false,
    },
    include: [
      {
        model: Product,
        as: "product",
        include: [
          {
            model: ProductAttachment,
            as: "attachments",
            required: false,
          },
          {
            model: ProductCategory,
            as: "categories",
            attributes: ["id", "title", "supplier"],
            through: {
              attributes: [],
            },
            required: false,
            include: [
              {
                model: ParentCategory,
                as: "parent_categories",
                attributes: ["id", "title"],
                through: {
                  attributes: [],
                },
                required: false,
                include: [
                  {
                    model: GrandCategory,
                    as: "grand_categories",
                    attributes: ["id", "title"],
                    through: {
                      attributes: [],
                    },
                    required: false,
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        model: Size,
        as: "size_details",
        attributes: ["id", "name", "measurements"],
      },
      {
        model: VariantAttachment,
        as: "images",
        where: {
          is_active: true,
        },
        required: false,
        attributes: ["id", "file_name", "file_uri", "is_primary"],
      },
    ],
  });

  if (!variant) {
    throw new Error("Variant not found");
  }

  const data = variant.toJSON();

  if (data.product) {
    data.product.name = decodeHtmlEntities(data.product.name);

    data.product.attachments = (data.product.attachments || []).sort((a, b) => {
      const aFront = a.file_name?.includes("-0.");
      const bFront = b.file_name?.includes("-0.");

      if (aFront && !bFront) return -1;
      if (!aFront && bFront) return 1;

      return 0;
    });
  }

  data.title = decodeHtmlEntities(data.title);

  const originalPrice = Number(data.price || 0);

  const effectivePrice =
    data.case_price && Number(data.case_price) > 0
      ? Number(data.case_price)
      : originalPrice;

  const pricing = await calculatePricing(effectivePrice, data.supplier);

  data.base_price = pricing.base_price;
  data.markup_percent = pricing.markup_percent;
  data.markup_amount = pricing.markup_amount;

  data.original_price = originalPrice;
  data.price = pricing.final_price;

  data.case_price = Number(data.case_price || 0);
  data.used_case_price = Number(data.case_price) > 0;

  data.pricing_tiers = buildPricingTiers(
    data.meta,
    pricing.markup_percent,
    false,
  );

  return {
    ...data,
    size: data.size_details?.name || null,
  };
};

const getGuestProductById = async (id) => {
  try {
    /* ============================================================
       PRODUCT
    ============================================================ */

    const product = await Product.findOne({
      where: {
        id,
        is_active: true,
        is_discontinued: false,
      },
      include: [
        {
          model: Brand,
          as: "brand",
          required: false,
        },
      ],
    });

    if (!product) {
      throw new ApiError(httpStatus.NOT_FOUND, "Product not found");
    }

    /* ============================================================
       LOAD EVERYTHING IN PARALLEL
    ============================================================ */

    const [variants, attachments, sizes, categories, markupPercent] =
      await Promise.all([
        /* ---------------- VARIANTS ---------------- */

        ProductVariant.findAll({
          where: {
            product_id: product.id,
            is_active: true,
          },
          order: [["id", "ASC"]],
        }),

        /* ---------------- PRODUCT ATTACHMENTS ---------------- */

        ProductAttachment.findAll({
          where: {
            product_id: product.id,
            is_active: true,
          },
        }),

        /* ---------------- PRODUCT SIZES ---------------- */

        Size.findAll({
          where: {
            product_id: product.id,
            is_active: true,
          },
        }),

        /* ---------------- CATEGORIES ---------------- */

        ProductCategory.findAll({
          attributes: ["id", "title", "supplier"],

          include: [
            {
              model: Product,
              as: "products",
              where: {
                id: product.id,
              },
              attributes: [],
              through: {
                attributes: [],
              },
            },

            {
              model: ParentCategory,
              as: "parent_categories",
              attributes: ["id", "title"],

              through: {
                attributes: [],
              },

              required: false,

              include: [
                {
                  model: GrandCategory,
                  as: "grand_categories",

                  attributes: ["id", "title"],

                  through: {
                    attributes: [],
                  },

                  required: false,
                },
              ],
            },
          ],
        }),

        /* ---------------- MARKUP ---------------- */

        getMarkupPercent(product.supplier),
      ]);

    /* ============================================================
       VARIANT IDS
    ============================================================ */

    const variantIds = variants.map((v) => v.id);

    const sizeIds = [
      ...new Set(variants.map((v) => v.size_id).filter(Boolean)),
    ];

    /* ============================================================
       LOAD VARIANT DATA
    ============================================================ */

    const [variantImages, variantSizeDetails] = await Promise.all([
      VariantAttachment.findAll({
        where: {
          variant_id: variantIds,
          is_active: true,
        },

        attributes: ["id", "variant_id", "file_name", "file_uri", "is_primary"],
      }),

      Size.findAll({
        where: {
          id: sizeIds,
        },

        attributes: ["id", "name", "measurements"],
      }),
    ]);
    /* ============================================================
   PRODUCT JSON
============================================================ */

    const data = product.toJSON();

    data.name = decodeHtmlEntities(data.name);

    data.attachments = attachments.map((a) => a.toJSON());

    data.sizes = sortSizes(sizes.map((s) => s.toJSON()));

    data.categories = categories.map((c) => c.toJSON());

    /* ============================================================
   SANMAR PRODUCT IMAGE SORTING
============================================================ */

    if (data.supplier === "SANMAR") {
      data.attachments.sort((a, b) => {
        const aFront = a.file_name?.includes("-0.");
        const bFront = b.file_name?.includes("-0.");

        if (aFront && !bFront) return -1;
        if (!aFront && bFront) return 1;

        return 0;
      });
    }

    /* ============================================================
   BUILD IMAGE MAP
============================================================ */

    const imageMap = {};

    variantImages.forEach((img) => {
      const image = img.toJSON();

      if (!imageMap[image.variant_id]) {
        imageMap[image.variant_id] = [];
      }

      imageMap[image.variant_id].push(image);
    });

    /* ============================================================
   BUILD SIZE MAP
============================================================ */

    const sizeMap = {};

    variantSizeDetails.forEach((size) => {
      sizeMap[size.id] = size.toJSON();
    });

    /* ============================================================
   PROCESS VARIANTS
============================================================ */

    data.variants = variants.map((variant) => {
      const v = variant.toJSON();

      v.title = decodeHtmlEntities(v.title);

      v.images = imageMap[v.id] || [];

      v.size_details = sizeMap[v.size_id] || null;

      /* ---------- SANMAR IMAGE SORT ---------- */

      if (product.supplier === "SANMAR") {
        v.images.sort((a, b) => {
          const aNum = Number(a.file_name?.match(/variant-(\d+)/)?.[1] || 999);

          const bNum = Number(b.file_name?.match(/variant-(\d+)/)?.[1] || 999);

          return aNum - bNum;
        });
      }

      /* ---------- PRICE ---------- */

      const effectivePrice =
        v.case_price && Number(v.case_price) > 0 ? v.case_price : v.price;

      const markupAmount = Number(effectivePrice) * (markupPercent / 100);

      const finalPrice = Number(effectivePrice) + markupAmount;

      return {
        ...v,

        size: v.size_details?.name || null,

        base_price: Number(effectivePrice).toFixed(2),

        markup_percent: markupPercent,

        markup_amount: Number(markupAmount.toFixed(2)),

        price: Number(finalPrice.toFixed(2)),

        original_price: Number(v.price || 0),

        case_price: Number(v.case_price || 0),

        used_case_price: !!v.case_price && Number(v.case_price) > 0,

        pricing_tiers: buildPricingTiers(v.meta, markupPercent, false),
      };
    });

    /* ============================================================
   SORT VARIANTS
============================================================ */

    data.variants = sortSizes(data.variants);

    return data;
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getProductVariant = async (body) => {
  const { product_id, color, size_id } = body;

  const variant = await ProductVariant.findOne({
    where: {
      product_id,
      ...(color && { color }),
      ...(size_id && { size_id }),
      is_active: true,
    },
    include: [
      {
        model: Product,
        as: "product",
        attributes: ["id", "name", "description"],
      },
      {
        model: Size,
        as: "size_details",
        attributes: ["id", "name", "measurements"],
      },
      {
        model: VariantAttachment,
        as: "images", // 🔥 ADD THIS
        where: { is_active: true },
        required: false,
        attributes: ["id", "file_name", "file_uri", "is_primary"],
      },
    ],
  });

  if (!variant) {
    throw new Error("Variant not found");
  }

  const data = variant.toJSON();

  if (data.product) {
    data.product.name = decodeHtmlEntities(data.product.name);
  }

  data.title = decodeHtmlEntities(data.title);

  return {
    ...data,
    size: data.size_details?.name || null, // 👈 HERE
  };
};

const updateProduct = async (body, files) => {
  let {
    product_id,
    variants,
    sizes,
    keep_product_image_ids,
    category_ids,
    ...updateData
  } = body;

  // =========================================================
  // 1. PARSE JSON FIELDS
  // =========================================================

  try {
    if (typeof variants === "string") {
      variants = JSON.parse(variants);
    }

    if (typeof sizes === "string") {
      sizes = JSON.parse(sizes);
    }

    if (typeof keep_product_image_ids === "string") {
      keep_product_image_ids = JSON.parse(keep_product_image_ids);
    }

    if (typeof category_ids === "string") {
      category_ids = JSON.parse(category_ids);
    }
  } catch (error) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Invalid JSON data in product update request",
    );
  }

  // =========================================================
  // 2. VALIDATE PRODUCT ID
  // =========================================================

  if (!product_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, "product_id is required");
  }

  // =========================================================
  // 3. FIND PRODUCT
  // =========================================================

  const product = await Product.findOne({
    where: {
      id: product_id,
      is_active: true,
    },
  });

  if (!product) {
    throw new ApiError(httpStatus.NOT_FOUND, "Product not found");
  }

  // =========================================================
  // 4. REMOVE PROTECTED / SYSTEM FIELDS
  // =========================================================

  delete updateData.id;
  delete updateData.product_id;
  delete updateData.sync_locked;
  delete updateData.sync_locked_at;
  delete updateData.createdAt;
  delete updateData.updatedAt;

  // =========================================================
  // 4b. BRAND / CATEGORY — MANUAL PRODUCTS ONLY
  // =========================================================
  // Supplier-sourced products (SAGE / S&S / SanMar / OTTOCAP) get
  // their brand and categories from the supplier feed itself —
  // letting an admin edit override those here would silently
  // drift out of sync on the next import. Enforced server-side,
  // not just hidden in the UI, so a stray/replayed request can't
  // slip brand or category changes onto a supplier product.
  // =========================================================

  const isManual = product.supplier === "MANUAL";

  if (!isManual) {
    delete updateData.brand_id;
    delete updateData.is_brand_manually_assigned;
    category_ids = undefined;
  } else if (Object.prototype.hasOwnProperty.call(updateData, "brand_id")) {
    // Empty string from a cleared <Select> must become NULL, not be
    // handed to a BIGINT column as "" (same class of bug as the
    // retail_price decimal crash — MySQL strict mode rejects "" for
    // non-string columns).
    updateData.brand_id = updateData.brand_id
      ? Number(updateData.brand_id)
      : null;
    updateData.is_brand_manually_assigned = !!updateData.brand_id;
  }

  // =========================================================
  // 5. UPDATE PRODUCT
  // =========================================================
  // Any manual edit means supplier sync should no longer
  // overwrite this product automatically.
  // =========================================================

  await product.update({
    ...updateData,

    sync_locked: true,
    sync_locked_at: new Date(),
  });

  // =========================================================
  // 5b. PRODUCT CATEGORIES (manual products only)
  // =========================================================
  // category_ids is a full-replace list, same contract as
  // category_ids on create — send [] to clear all categories,
  // omit the field entirely to leave categories untouched.
  // =========================================================

  if (isManual && Array.isArray(category_ids)) {
    const cleanCatIds = category_ids
      .map(Number)
      .filter((catId) => Number.isInteger(catId));

    await ProductCategoryMapping.destroy({
      where: { product_id },
    });

    if (cleanCatIds.length > 0) {
      await ProductCategoryMapping.bulkCreate(
        cleanCatIds.map((catId) => ({
          product_id,
          product_category_id: catId,
        })),
      );
    }
  }

  // =========================================================
  // 6. PRODUCT IMAGES
  // =========================================================
  //
  // Existing images that should remain:
  //
  // keep_product_image_ids: [1, 2, 4]
  //
  // New images:
  //
  // files.images
  //
  // Example:
  //
  // Supplier originally has:
  // 1, 2, 3, 4
  //
  // Admin removes 2:
  // keep_product_image_ids = [1, 3, 4]
  //
  // New uploaded image is then added.
  // =========================================================

  if (Array.isArray(keep_product_image_ids) || files?.images?.length) {
    const keepIds = Array.isArray(keep_product_image_ids)
      ? keep_product_image_ids.map(Number).filter((id) => Number.isInteger(id))
      : [];

    // -------------------------------------------------------
    // DELETE EXISTING IMAGES THAT ARE NOT KEPT
    // -------------------------------------------------------

    if (keepIds.length > 0) {
      await ProductAttachment.destroy({
        where: {
          product_id,
          id: {
            [Op.notIn]: keepIds,
          },
        },
      });
    } else {
      // Empty array means admin removed all existing images
      await ProductAttachment.destroy({
        where: {
          product_id,
        },
      });
    }

    // -------------------------------------------------------
    // ADD NEW PRODUCT IMAGES
    // -------------------------------------------------------

    if (files?.images?.length) {
      const imageRows = files.images.map((file) => ({
        product_id,
        file_type: "image",
        file_name: file.filename,
        file_uri: `${process.env.IMAGE_BASE_URL}/images/${file.filename}`,
        file_size: file.size,
        is_primary: false,
      }));

      await ProductAttachment.bulkCreate(imageRows);
    }

    // -------------------------------------------------------
    // ENSURE ONE PRIMARY IMAGE
    // -------------------------------------------------------

    const remainingImages = await ProductAttachment.findAll({
      where: {
        product_id,
        is_active: true,
      },
      order: [["id", "ASC"]],
    });

    if (remainingImages.length > 0) {
      await ProductAttachment.update(
        {
          is_primary: false,
        },
        {
          where: {
            product_id,
          },
        },
      );

      await remainingImages[0].update({
        is_primary: true,
      });
    }
  }

  // =========================================================
  // 7. PRODUCT SIZES
  // =========================================================

  if (Array.isArray(sizes)) {
    const existingSizes = await Size.findAll({
      where: {
        product_id,
        paranoid: false,
      },
    });

    const existingSizeMap = {};

    existingSizes.forEach((size) => {
      existingSizeMap[size.id] = size;
    });

    for (const sizeData of sizes) {
      // -----------------------------------------------------
      // UPDATE EXISTING SIZE
      // -----------------------------------------------------

      if (sizeData.id && existingSizeMap[sizeData.id]) {
        const size = existingSizeMap[sizeData.id];

        const sizeUpdateData = {
          ...sizeData,
        };

        delete sizeUpdateData.id;
        delete sizeUpdateData.product_id;
        delete sizeUpdateData.createdAt;
        delete sizeUpdateData.updatedAt;

        await size.update(sizeUpdateData);

        delete existingSizeMap[size.id];
      }

      // -----------------------------------------------------
      // CREATE NEW SIZE
      // -----------------------------------------------------
      else {
        const sizeCreateData = {
          ...sizeData,
          product_id,
        };

        delete sizeCreateData.id;
        delete sizeCreateData.createdAt;
        delete sizeCreateData.updatedAt;

        await Size.create(sizeCreateData);
      }
    }

    // -------------------------------------------------------
    // DELETE REMOVED SIZES
    // -------------------------------------------------------

    for (const key of Object.keys(existingSizeMap)) {
      await existingSizeMap[key].destroy();
    }
  }

  // =========================================================
  // 8. VARIANTS
  // =========================================================

  if (Array.isArray(variants)) {
    const existingVariants = await ProductVariant.findAll({
      where: {
        product_id,
      },
    });

    const existingVariantMap = {};

    existingVariants.forEach((variant) => {
      existingVariantMap[variant.id] = variant;
    });

    // -------------------------------------------------------
    // Uploaded variant images are consumed sequentially.
    // -------------------------------------------------------

    let variantImageIndex = 0;

    // =======================================================
    // PROCESS VARIANTS
    // =======================================================

    for (const variantData of variants) {
      if (!variantData || typeof variantData !== "object") {
        continue;
      }

      const { id, keep_image_ids, image_count, ...variantUpdateData } =
        variantData;

      let variant;

      // =====================================================
      // UPDATE EXISTING VARIANT
      // =====================================================

      if (id && existingVariantMap[id]) {
        variant = existingVariantMap[id];

        delete variantUpdateData.id;
        delete variantUpdateData.product_id;
        delete variantUpdateData.createdAt;
        delete variantUpdateData.updatedAt;

        await variant.update(variantUpdateData);

        delete existingVariantMap[id];
      }

      // =====================================================
      // CREATE NEW VARIANT
      // =====================================================
      else {
        delete variantUpdateData.id;
        delete variantUpdateData.createdAt;
        delete variantUpdateData.updatedAt;

        variant = await ProductVariant.create({
          ...variantUpdateData,
          product_id,
        });
      }

      // =====================================================
      // VARIANT IMAGES
      // =====================================================

      const keepImageIds = Array.isArray(keep_image_ids)
        ? keep_image_ids
            .map(Number)
            .filter((imageId) => Number.isInteger(imageId))
        : [];

      const hasImageInstructions =
        Array.isArray(keep_image_ids) || Number(image_count) > 0;

      if (hasImageInstructions) {
        // ---------------------------------------------------
        // DELETE OLD IMAGES NOT KEPT
        // ---------------------------------------------------

        if (keepImageIds.length > 0) {
          await VariantAttachment.destroy({
            where: {
              variant_id: variant.id,
              id: {
                [Op.notIn]: keepImageIds,
              },
            },
          });
        } else {
          // Empty keep_image_ids means remove all
          // existing images.
          await VariantAttachment.destroy({
            where: {
              variant_id: variant.id,
            },
          });
        }

        // ---------------------------------------------------
        // ADD NEW IMAGES
        // ---------------------------------------------------

        const newImageCount = Number(image_count) || 0;

        const variantImageRows = [];

        for (let i = 0; i < newImageCount; i++) {
          const file = files?.variant_images?.[variantImageIndex];

          if (!file) {
            break;
          }

          variantImageRows.push({
            variant_id: variant.id,
            file_name: file.filename,
            file_uri: `${process.env.IMAGE_BASE_URL}/images/${file.filename}`,
            file_size: file.size,
            is_primary: false,
          });

          variantImageIndex++;
        }

        if (variantImageRows.length > 0) {
          await VariantAttachment.bulkCreate(variantImageRows);
        }

        // ---------------------------------------------------
        // ENSURE ONE PRIMARY IMAGE
        // ---------------------------------------------------

        const remainingVariantImages = await VariantAttachment.findAll({
          where: {
            variant_id: variant.id,
            is_active: true,
          },
          order: [["id", "ASC"]],
        });

        if (remainingVariantImages.length > 0) {
          await VariantAttachment.update(
            {
              is_primary: false,
            },
            {
              where: {
                variant_id: variant.id,
              },
            },
          );

          await remainingVariantImages[0].update({
            is_primary: true,
          });
        }
      }
    }

    // =======================================================
    // DELETE VARIANTS REMOVED FROM REQUEST
    // =======================================================

    for (const key of Object.keys(existingVariantMap)) {
      const variant = existingVariantMap[key];

      // Delete variant images first
      await VariantAttachment.destroy({
        where: {
          variant_id: variant.id,
        },
      });

      // Delete variant
      await variant.destroy();
    }
  }

  // =========================================================
  // 9. RETURN UPDATED PRODUCT
  // =========================================================

  return product;
};

const deleteProduct = async ({ styleId, supplier, product_id }) => {
  const t = await sequelize.transaction();

  try {
    console.log(`🗑 Deleting ${supplier} style:`, styleId);

    let product;
    // ✅ 1. FIND PRODUCT
    if (product_id) {
      product = await Product.findByPk(product_id, {
        transaction: t,
      });
    } else {
      product = await Product.findOne({
        where: {
          external_style_id: String(styleId),
          supplier,
        },
        transaction: t,
      });
    }

    if (!product) {
      throw new Error("Product not found");
    }

    // ✅ 2. FIND VARIANTS
    const variants = await ProductVariant.findAll({
      where: { product_id: product.id },
      transaction: t,
    });

    const variantIds = variants.map((v) => v.id);

    // ✅ 3. DELETE VARIANT RELATED DATA
    if (variantIds.length) {
      await VariantWarehouse.destroy({
        where: { variant_id: variantIds },
        transaction: t,
      });

      await VariantAttachment.destroy({
        where: { variant_id: variantIds },
        transaction: t,
      });
    }

    // ✅ 4. DELETE PRODUCT ATTACHMENTS
    await ProductAttachment.destroy({
      where: { product_id: product.id },
      transaction: t,
    });

    // ✅ 5. DELETE VARIANTS
    await ProductVariant.destroy({
      where: { product_id: product.id },
      transaction: t,
    });

    // ✅ 6. DELETE SIZES
    await Size.destroy({
      where: { product_id: product.id },
      transaction: t,
    });

    // ✅ 7. DELETE CATEGORY MAPPING
    await ProductCategoryMapping.destroy({
      where: { product_id: product.id },
      transaction: t,
    });

    // ✅ 8. DELETE RAW DATA

    if (styleId && supplier) {
      await SourceRawData.destroy({
        where: {
          external_id: String(styleId),
          source_name: supplier,
        },
        transaction: t,
      });
    }

    // ✅ 9. DELETE PRODUCT
    await Product.destroy({
      where: { id: product.id },
      transaction: t,
    });

    await t.commit();

    console.log("✅ Product deleted completely");

    return {
      success: true,
      message: "Product deleted successfully",
    };
  } catch (err) {
    await t.rollback();
    console.error("❌ Delete failed:", err.message);
    throw err;
  }
};

const getSSStylesByBrand = async (brand) => {
  try {
    console.log("🚀 Fetching styles for brand:", brand);

    const res = await ssClient.get(`/styles?search=${brand}`);
    const styles = res.data;

    if (!styles || !styles.length) {
      return {
        total: 0,
        data: [],
      };
    }

    // 🎯 CLEAN RESPONSE
    const formatted = styles.map((s) => ({
      style_id: s.styleID,
      style_name: s.styleName,
      brand: s.brandName,
    }));

    return {
      total: formatted.length,
      data: formatted,
    };
  } catch (err) {
    console.error("❌ Styles fetch failed:", err.message);
    throw err;
  }
};

const getSSProductByStyle = async (styleId) => {
  try {
    const productRes = await fetchWithRetry(() =>
      ssClient.get(`/products?style=${styleId}`),
    );

    const items = productRes.data;
    if (!items || !items.length) return null;

    const styleRes = await fetchWithRetry(() =>
      ssClient.get(`/styles/${styleId}`),
    );

    const style = styleRes.data?.[0] || {};
    console.log(style, "style");

    return {
      style_id: styleId,

      raw: {
        style,
        products: items,
      },

      product: {
        name: style.title,
        description: style.description,
        styleName: style.styleName,
        brand: style.brandName,
        base_category: style.baseCategory,
        categories: style.categories ? style.categories.split(",") : [],
        product_images: [style.styleImage, style.brandImage]
          .filter(Boolean)
          .map((img) => `https://www.ssactivewear.com/${img}`),
      },

      variants: items.map((v) => ({
        raw: v,
        sku: v.sku,
        gtin: v.gtin,

        variant_name: `${v.colorName} - ${v.sizeName}`,

        color: {
          name: v.colorName,
          hex: v.color1,
        },

        size: {
          name: v.sizeName,
        },

        pricing: {
          retail: v.retailPrice,
          sale: v.salePrice,
          piece: v.piecePrice,
          case: v.casePrice,
        },

        stock: v.qty,

        images: [
          v.colorFrontImage,
          v.colorBackImage,
          v.colorSideImage,
          v.colorOnModelFrontImage,
        ]
          .filter(Boolean)
          .map((img) => `https://www.ssactivewear.com/${img}`),

        warehouses: (v.warehouses || []).map((w) => ({
          code: w.warehouseAbbr,
          stock: w.qty,
          dropship: w.dropship,
          returnable: w.returnable,
        })),

        // 🔥 FIXED FIELD MAPPING
        unit_weight: v.unitWeight,
        case_qty: v.caseQty,
        case_weight: v.caseWeight,
        case_length: v.caseLength,
        case_width: v.caseWidth,
        case_height: v.caseHeight,
        country_of_origin: v.countryOfOrigin,
      })),
    };
  } catch (err) {
    console.error("❌ Fetch failed:", err.message);
    throw err;
  }
};

const saveSSProductToDB = async (data, batchId) => {
  let transaction;

  try {
    console.log("Saving product to DB with batch ID:", batchId);

    const { style_id, raw, product: pData, variants } = data;

    // =========================================================
    // CHECK WHETHER PRODUCT IS MANUALLY LOCKED
    // =========================================================

    const existingProduct = await Product.findOne({
      where: {
        external_style_id: String(style_id),
        supplier: "SS",
      },
      attributes: ["id", "sync_locked"],
      paranoid: false,
    });

    if (existingProduct?.sync_locked) {
      console.log(`⏭️ SS product ${style_id} is sync locked. Skipping.`);

      return {
        skipped: true,
        product_id: existingProduct.id,
      };
    }

    // =========================================
    // 🔥 PRE DOWNLOAD PRODUCT IMAGES
    // =========================================

    const downloadedProductImages = {};

    for (const url of pData.product_images || []) {
      const localImage = await downloadSupplierImage({
        supplier: "SS",
        imageUrl: url,
        styleId: style_id,
        sku: pData.styleName,
        imageType: "product",
      });

      downloadedProductImages[url] = localImage;
    }

    // =========================================
    // 🔥 PRE DOWNLOAD VARIANT IMAGES
    // =========================================

    const downloadedVariantImages = {};

    for (const v of variants) {
      for (const [index, img] of (v.images || []).entries()) {
        const localImage = await downloadSupplierImage({
          supplier: "SS",
          imageUrl: img,
          styleId: style_id,
          sku: v.sku,
          imageType: `variant-${index}`,
        });

        downloadedVariantImages[`${v.sku}-${img}`] = localImage;
      }
    }

    // =========================================
    // 🔥 START TRANSACTION AFTER DOWNLOADS
    // =========================================

    transaction = await sequelize.transaction();

    // ✅ BRAND
    let brand = await Brand.findOne({
      where: {
        name: pData.brand,
        supplier: "SS",
      },
    });

    if (!brand) {
      brand = await Brand.findOne({
        where: {
          name: "Unknown",
          supplier: "SYSTEM",
        },
      });
    }

    // ✅ RAW DATA
    await SourceRawData.create({
      source_name: "SS",
      external_id: String(style_id),
      raw_json: raw,
      import_batch_id: batchId,
    });

    console.log("✅ Raw data saved");

    // =========================================
    // ✅ PRODUCT UPSERT
    // =========================================

    let product = await Product.findOne({
      where: {
        external_style_id: String(style_id),
        supplier: "SS",
      },
      paranoid: false,
      transaction,
    });

    if (product) {
      if (product.deleted_at) {
        await product.restore({ transaction });
      }

      await product.update(
        {
          name: pData.name,
          description: pData.description,
          brand_id: brand?.id || null,
          external_style_name: pData.styleName,
          last_supplier_sync_at: new Date(),
          import_batch_id: batchId,

          is_discontinued: false,
          discontinued_at: null,
          supplier_missing_since: null,
        },
        { transaction },
      );
    } else {
      product = await Product.create(
        {
          name: pData.name,
          description: pData.description,
          brand_id: brand?.id || null,
          external_style_id: String(style_id),
          external_style_name: pData.styleName,
          supplier: "SS",
          import_batch_id: batchId,
          last_supplier_sync_at: new Date(),

          is_discontinued: false,
          discontinued_at: null,
          supplier_missing_since: null,
        },
        { transaction },
      );
    }

    console.log("✅ Product saved:", product.id);

    // =========================================
    // ✅ CATEGORY MAPPING
    // =========================================

    if (pData.categories?.length) {
      const categories = await ProductCategory.findAll({
        where: {
          supplier: "SS",
        },
      });

      const categoryMap = new Map(
        categories.map((c) => [String(c.external_id), c]),
      );

      for (const catId of pData.categories) {
        const category = categoryMap.get(String(catId));

        if (!category) continue;

        await ProductCategoryMapping.findOrCreate({
          where: {
            product_id: product.id,
            product_category_id: category.id,
          },
          transaction,
        });
      }
    }

    // =========================================
    // ✅ PRODUCT ATTACHMENTS
    // =========================================

    if (pData.product_images?.length) {
      const productAttachments = [];

      for (const url of pData.product_images) {
        const localImage = downloadedProductImages[url];

        if (!localImage) continue;

        const exists = await ProductAttachment.findOne({
          where: {
            product_id: product.id,
            [Op.or]: [
              {
                source_url: url,
              },
              {
                file_uri: url,
              },
            ],
          },
          transaction,
        });

        console.log("Checking product image:", url, "Exists:", !!exists);

        if (exists) {
          await exists.update(
            {
              file_uri: localImage,
              source_url: url,
              file_name: localImage.split("/").pop(),
              supplier: "SS",
              updated_at: new Date(),
            },
            { transaction },
          );
        } else {
          productAttachments.push({
            product_id: product.id,
            file_name: localImage.split("/").pop(),
            file_uri: localImage,
            source_url: url,
            supplier: "SS",
            file_type: "image",
          });
        }
      }

      if (productAttachments.length) {
        await ProductAttachment.bulkCreate(productAttachments, {
          updateOnDuplicate: ["file_uri", "source_url", "updated_at"],
          transaction,
        });
      }
    }

    console.log("✅ Product attachments synced");

    // =========================================
    // ✅ SIZES
    // =========================================

    const uniqueSizes = [...new Set(variants.map((v) => v.size.name))];

    await Size.bulkCreate(
      uniqueSizes.map((s) => ({
        name: s,
        product_id: product.id,
      })),
      {
        ignoreDuplicates: true,
        transaction,
      },
    );

    const sizes = await Size.findAll({
      where: {
        product_id: product.id,
      },
      transaction,
    });

    const sizeMap = new Map(sizes.map((s) => [s.name, s]));

    console.log("✅ Sizes synced");

    // =========================================
    // ✅ VARIANTS UPSERT
    // =========================================

    const variantPayload = variants.map((v) => {
      const price = Number(
        v.pricing?.piece ?? v.pricing?.sale ?? v.pricing?.retail ?? 0,
      );

      return {
        sku: String(v.sku),
        product_id: product.id,

        price: isNaN(price) ? 0 : price,

        stock: v.stock ?? 0,

        size: v.size.name,
        color: v.color.name,
        color_code: v.color.hex,

        size_id: sizeMap.get(v.size.name)?.id || null,

        supplier: "SS",
        import_batch_id: batchId,
        last_supplier_sync_at: new Date(),

        retail_price: v.pricing?.retail ?? null,

        sale_price: v.pricing?.sale ?? null,

        case_price: v.pricing?.case ?? null,

        unit_weight: v.unit_weight ?? null,

        case_qty: v.case_qty ?? null,

        case_weight: v.case_weight ?? null,

        case_length: v.case_length ?? null,

        case_width: v.case_width ?? null,

        case_height: v.case_height ?? null,

        country_of_origin: v.country_of_origin ?? null,

        meta: {
          supplier_raw: v.raw,
        },
      };
    });

    await ProductVariant.bulkCreate(variantPayload, {
      updateOnDuplicate: [
        "price",
        "stock",
        "sale_price",
        "retail_price",
        "case_price",
        "unit_weight",
        "case_qty",
        "case_weight",
        "case_length",
        "case_width",
        "case_height",
        "country_of_origin",
        "last_supplier_sync_at",
        "supplier_last_hash",
        "meta",
      ],
      transaction,
    });

    console.log("✅ Variants synced");

    // =========================================
    // ✅ FETCH CREATED VARIANTS
    // =========================================

    const createdVariants = await ProductVariant.findAll({
      where: {
        product_id: product.id,
      },
      transaction,
    });

    const variantMap = new Map(createdVariants.map((v) => [v.sku, v]));

    // =========================================
    // ✅ VARIANT IMAGES + WAREHOUSE
    // =========================================

    const variantImages = [];
    const warehouseRecords = [];

    for (const v of variants) {
      const variant = variantMap.get(String(v.sku));

      if (!variant) {
        console.log("❌ Variant not found:", v.sku);
        continue;
      }

      // =====================================
      // 🔥 VARIANT IMAGES
      // =====================================

      for (const [index, img] of (v.images || []).entries()) {
        const localImage = downloadedVariantImages[`${v.sku}-${img}`];

        if (!localImage) continue;

        const exists = await VariantAttachment.findOne({
          where: {
            variant_id: variant.id,
            [Op.or]: [
              {
                source_url: img,
              },
              {
                file_uri: img,
              },
            ],
          },
          transaction,
        });

        console.log("Checking variant image:", img, "Exists:", !!exists);

        if (exists) {
          await exists.update(
            {
              file_uri: localImage,
              source_url: img,
              file_name: localImage.split("/").pop(),
              supplier: "SS",
              updated_at: new Date(),
            },
            { transaction },
          );
        } else {
          variantImages.push({
            variant_id: variant.id,
            file_name: localImage.split("/").pop(),
            file_uri: localImage,
            source_url: img,
            supplier: "SS",
            file_type: "image",
          });
        }
      }

      // =====================================
      // 🔥 WAREHOUSES
      // =====================================

      (v.warehouses || []).forEach((w) => {
        warehouseRecords.push({
          variant_id: variant.id,
          warehouse_abbr: w.code,
          stock: w.stock,
          dropship: w.dropship,
          returnable: w.returnable,
          import_batch_id: batchId,
        });
      });
    }

    // =========================================
    // ✅ SAVE VARIANT IMAGES
    // =========================================

    if (variantImages.length) {
      await VariantAttachment.bulkCreate(variantImages, {
        updateOnDuplicate: ["file_uri", "source_url", "updated_at"],
        transaction,
      });
    }

    // =========================================
    // ✅ SAVE WAREHOUSES
    // =========================================

    if (warehouseRecords.length) {
      await VariantWarehouse.bulkCreate(warehouseRecords, {
        updateOnDuplicate: ["stock", "dropship", "returnable"],
        transaction,
      });
    }

    // =========================================
    // ✅ COMMIT
    // =========================================

    await transaction.commit();

    console.log(`✅ Product ${style_id} fully synced`);
  } catch (err) {
    console.error("❌ saveSSProductToDB failed:", err.message);

    if (transaction) {
      await transaction.rollback();
    }

    throw err;
  }
};

const fetchWithRetry = async (fn, retries = 3, delay = 1500) => {
  try {
    return await fn();
  } catch (err) {
    const status = err.response?.status;

    // retry only for rate limit / server issues
    if ((status === 429 || status === 503) && retries > 0) {
      console.log(`⏳ Retry... (${retries})`);
      await new Promise((res) => setTimeout(res, delay));
      return fetchWithRetry(fn, retries - 1, delay);
    }

    throw err;
  }
};

const deleteSSProductByStyle = async (styleId) => {
  const t = await sequelize.transaction();

  try {
    console.log("🗑 Deleting style:", styleId);

    // ✅ 1. FIND PRODUCT
    const product = await Product.findOne({
      where: {
        external_style_id: String(styleId),
        supplier: "SS",
      },
      transaction: t,
    });

    if (!product) {
      throw new Error("Product not found");
    }

    // ✅ 2. FIND VARIANTS
    const variants = await ProductVariant.findAll({
      where: { product_id: product.id },
      transaction: t,
    });

    const variantIds = variants.map((v) => v.id);

    // 🔥 SAFETY CHECK
    if (variantIds.length) {
      // ✅ 3. DELETE VARIANT WAREHOUSES
      await VariantWarehouse.destroy({
        where: { variant_id: variantIds },
        transaction: t,
      });

      // ✅ 4. DELETE VARIANT IMAGES (FIXED TABLE)
      await VariantAttachment.destroy({
        where: { variant_id: variantIds },
        transaction: t,
      });
    }

    // ✅ 5. DELETE PRODUCT IMAGES
    await ProductAttachment.destroy({
      where: { product_id: product.id },
      transaction: t,
    });

    // ✅ 6. DELETE VARIANTS
    await ProductVariant.destroy({
      where: { product_id: product.id },
      transaction: t,
    });

    // ✅ 7. DELETE SIZES
    await Size.destroy({
      where: { product_id: product.id },
      transaction: t,
    });

    // ✅ 8. DELETE CATEGORY MAPPING
    await ProductCategoryMapping.destroy({
      where: { product_id: product.id },
      transaction: t,
    });

    // ✅ 9. DELETE RAW DATA
    await SourceRawData.destroy({
      where: {
        external_id: String(styleId),
        source_name: "SS",
      },
      transaction: t,
    });

    // ✅ 10. DELETE PRODUCT
    await Product.destroy({
      where: { id: product.id },
      transaction: t,
    });

    await t.commit();

    console.log("✅ Deleted style completely");

    return { success: true };
  } catch (err) {
    await t.rollback();
    console.error("❌ Delete failed:", err.message);
    throw err;
  }
};

const getProductVariantByAdmin = async (query) => {
  try {
    const { page = 1, limit = 20, search = "" } = query;
    const offset = (page - 1) * limit;

    let where = {
      is_active: true,
      is_discontinued: false,
    };

    if (search) {
      const encodedSearch = search
        .replace(/&/g, "&amp;")
        .replace(/'/g, "&apos;")
        .replace(/"/g, "&quot;");

      where[Op.or] = [
        { sku: { [Op.like]: `%${search}%` } },

        { color: { [Op.like]: `%${search}%` } },

        {
          "$product.name$": {
            [Op.like]: `%${search}%`,
          },
        },

        {
          "$product.name$": {
            [Op.like]: `%${encodedSearch}%`,
          },
        },

        {
          "$product.external_style_name$": {
            [Op.like]: `%${search}%`,
          },
        },
      ];
    }

    const { rows, count } = await ProductVariant.findAndCountAll({
      where,

      limit: Number(limit),

      offset: Number(offset),

      distinct: true,

      include: [
        {
          model: Product,

          as: "product",

          required: true,

          include: [
            {
              model: ProductAttachment,

              as: "attachments",

              required: false,
            },
          ],
        },

        {
          model: Size,

          as: "size_details",

          attributes: ["id", "name", "measurements"],
        },

        {
          model: VariantAttachment,

          as: "images",

          where: {
            is_active: true,
          },

          required: false,

          attributes: ["id", "file_name", "file_uri", "is_primary"],
        },

        {
          model: VariantWarehouse,

          as: "variant_warehouse",
        },
      ],
    });

    const formattedRows = rows.map((variant) => {
      const data = variant.toJSON();

      // Decode product name
      if (data.product) {
        data.product.name = decodeHtmlEntities(data.product.name || "");
      }

      data.pricing_tiers = buildPricingTiers(data.meta, 0, true);

      // SANMAR product images
      if (data.product?.supplier === "SANMAR") {
        data.product.attachments = (data.product.attachments || []).sort(
          (a, b) => {
            const aFront = a.file_name?.includes("-0.");

            const bFront = b.file_name?.includes("-0.");

            if (aFront && !bFront) return -1;

            if (!aFront && bFront) return 1;

            return 0;
          },
        );

        // SANMAR variant images
        data.images = (data.images || []).sort((a, b) => {
          const aNum = Number(a.file_name?.match(/variant-(\d+)/)?.[1] || 999);

          const bNum = Number(b.file_name?.match(/variant-(\d+)/)?.[1] || 999);

          return aNum - bNum;
        });
      }

      return data;
    });

    return {
      data: formattedRows,

      total: count,

      page: Number(page),

      totalPages: Math.ceil(count / limit),
    };
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getProductByIdAdmin = async (id) => {
  try {
    const product = await Product.findOne({
      where: {
        id,
        is_active: true,
      },
      include: [
        {
          model: Brand,
          as: "brand",
          required: false,
        },
      ],
    });

    if (!product) {
      throw new ApiError(httpStatus.NOT_FOUND, "Product not found");
    }

    const [variants, attachments, sizes, categories, markupPercent] =
      await Promise.all([
        /* ---------------- VARIANTS ---------------- */

        ProductVariant.findAll({
          where: {
            product_id: product.id,
            is_active: true,
          },
          order: [["id", "ASC"]],
        }),

        /* ---------------- PRODUCT ATTACHMENTS ---------------- */

        ProductAttachment.findAll({
          where: {
            product_id: product.id,
            is_active: true,
          },
        }),

        /* ---------------- PRODUCT SIZES ---------------- */

        Size.findAll({
          where: {
            product_id: product.id,
            is_active: true,
          },
        }),

        /* ---------------- PRODUCT CATEGORIES (with parent + grand) ----------------
           Mirrors the customer-facing getProductById query so the admin
           panel can render the same category -> parent -> grand hierarchy
           instead of only the flat leaf-category title.
        ------------------------------------------------------------------------ */

        ProductCategory.findAll({
          attributes: ["id", "title", "supplier"],

          include: [
            {
              model: Product,
              as: "products",
              where: {
                id: product.id,
              },
              attributes: [],
              through: {
                attributes: [],
              },
            },
            {
              model: ParentCategory,
              as: "parent_categories",
              attributes: ["id", "title"],
              through: {
                attributes: [],
              },
              required: false,

              include: [
                {
                  model: GrandCategory,
                  as: "grand_categories",
                  attributes: ["id", "title"],
                  through: {
                    attributes: [],
                  },
                  required: false,
                },
              ],
            },
          ],
        }),

        /* ---------------- MARKUP ----------------
           Needed so we can show admin a preview of what the customer will
           actually pay (pricing_tiers_customer below), alongside the raw
           supplier numbers (pricing_tiers), without changing any existing
           field's value or shape.
        ------------------------------------------------------------------- */
        getMarkupPercent(product.supplier),
      ]);

    const variantIds = variants.map((v) => v.id);

    const sizeIds = [
      ...new Set(variants.map((v) => v.size_id).filter(Boolean)),
    ];

    const [variantImages, variantSizeDetails] = await Promise.all([
      VariantAttachment.findAll({
        where: {
          variant_id: variantIds,
          is_active: true,
        },
        attributes: ["id", "variant_id", "file_name", "file_uri", "is_primary"],
      }),

      Size.findAll({
        where: {
          id: sizeIds,
        },
        attributes: ["id", "name", "measurements"],
      }),
    ]);

    const data = product.toJSON();

    data.attachments = attachments.map((a) => a.toJSON());
    data.sizes = sortSizes(sizes.map((s) => s.toJSON()));
    data.categories = categories.map((c) => c.toJSON());

    const imageMap = {};

    variantImages.forEach((img) => {
      const image = img.toJSON();

      if (!imageMap[image.variant_id]) {
        imageMap[image.variant_id] = [];
      }

      imageMap[image.variant_id].push(image);
    });

    const sizeMap = {};

    variantSizeDetails.forEach((size) => {
      sizeMap[size.id] = size.toJSON();
    });

    data.variants = variants.map((variant) => {
      const v = variant.toJSON();

      v.title = decodeHtmlEntities(v.title);

      v.images = imageMap[v.id] || [];

      v.size_details = sizeMap[v.size_id] || null;

      if (product.supplier === "SANMAR") {
        v.images.sort((a, b) => {
          const aNum = Number(a.file_name?.match(/variant-(\d+)/)?.[1] || 999);

          const bNum = Number(b.file_name?.match(/variant-(\d+)/)?.[1] || 999);

          return aNum - bNum;
        });
      }

      return {
        ...v,

        size: v.size_details?.name || null,

        // ADMIN VIEW (NO MARKUP)

        price: Number(v.price),

        cost_price: Number(v.cost_price || v.price),

        supplier: v.supplier,

        stock: v.stock,

        track_inventory: v.track_inventory,

        // Exactly what the supplier sent — no markup, source of truth for audits.
        // Empty array (not null/undefined) when the supplier gave no tier data,
        // so the frontend can distinguish "no pricing table" from "not loaded yet".
        pricing_tiers: buildPricingTiers(v.meta, 0, true),

        // Preview of what the customer will actually see/pay, so admin can
        // sanity-check markup without needing to open the live site.
        pricing_tiers_customer: buildPricingTiers(v.meta, markupPercent, false),
      };
    });

    if (data.supplier === "SANMAR") {
      data.attachments.sort((a, b) => {
        const aFront = a.file_name?.includes("-0.");
        const bFront = b.file_name?.includes("-0.");

        if (aFront && !bFront) return -1;
        if (!aFront && bFront) return 1;

        return 0;
      });
    }

    return {
      ...data,

      name: decodeHtmlEntities(data.name),
    };
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getAdminStats = async () => {
  try {
    // 🔥 VARIANTS
    const totalVariants = await ProductVariant.count();

    const sageVariants = await ProductVariant.count({
      where: { supplier: "SAGE" },
    });

    const ssVariants = await ProductVariant.count({
      where: { supplier: "SS" },
    });

    const sanmarVariants = await ProductVariant.count({
      where: { supplier: "SANMAR" },
    });

    const ottoCapVariants = await ProductVariant.count({
      where: { supplier: "OTTOCAP" },
    });

    // 🔥 PRODUCTS
    const totalProducts = await Product.count();

    const sageProducts = await Product.count({
      where: { supplier: "SAGE", is_active: true, is_discontinued: false },
    });

    const ssProducts = await Product.count({
      where: { supplier: "SS", is_active: true, is_discontinued: false },
    });

    const sanmarProducts = await Product.count({
      where: { supplier: "SANMAR", is_active: true, is_discontinued: false },
    });

    const ottoCapProducts = await Product.count({
      where: { supplier: "OTTOCAP", is_active: true, is_discontinued: false },
    });

    return {
      // ✅ VARIANTS
      totalVariants,
      sageVariants,
      ssVariants,
      sanmarVariants,
      ottoCapVariants,

      // ✅ PRODUCTS
      totalProducts,
      sageProducts,
      ssProducts,
      sanmarProducts,
      ottoCapProducts,
    };
  } catch (err) {
    throw err;
  }
};

const getAllProductsAdmin = async (query) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = "",
      source,
      sync_locked,
      parent_category_id, // comma-separated Parent Category ids
      grand_category_id, // comma-separated Grand Category ids
      min_price, // NEW
      max_price, // NEW
      tier,
      use_case_id,
    } = query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    let where = {
      is_active: true,
      is_discontinued: false,
    };

    if (source) {
      where.supplier = source.toUpperCase();
    }

    if (sync_locked === "true" || sync_locked === true) {
      where.sync_locked = true;
    } else if (sync_locked === "false" || sync_locked === false) {
      where.sync_locked = false;
    }

    // ── Use Case / Tier filter ────────────────────────────────────────
    // `use_case_id` can now be sent on its own — it narrows to every
    // product tied to those use case(s) (manual assignments + anything
    // that falls under their mapped categories), the same resolution
    // `getProductIdsForUseCase` does for the multi-use-case endpoint.
    // `tier` only ever narrows *within* a use case, so it still requires
    // use_case_id — that direction of the rule is unchanged.
    if (use_case_id) {
      const useCaseIds = String(use_case_id)
        .split(",")
        .map((id) => Number(id.trim()))
        .filter(Boolean);

      if (!useCaseIds.length) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Valid use_case_id is required",
        );
      }

      // Union across every selected use case so a product matching
      // multiple still appears only once.
      const useCaseProductSet = new Set();

      for (const useCaseId of useCaseIds) {
        let productIds;

        if (tier) {
          productIds =
            tier === "all"
              ? await resolveAllTierProductIds(useCaseId)
              : await resolveTierProductIds(tier, useCaseId);
        } else {
          // No tier selected — resolve every product belonging to this
          // use case, tier or no tier.
          const { productIds: allIds } =
            await getProductIdsForUseCase(useCaseId);
          productIds = allIds;
        }

        productIds.forEach((productId) => {
          useCaseProductSet.add(productId);
        });
      }

      const useCaseProductIds = [...useCaseProductSet];

      if (!useCaseProductIds.length) {
        return {
          data: [],
          total: 0,
          page: pageNum,
          totalPages: 0,
        };
      }

      // Intersect with any existing product-id filter
      if (where.id) {
        where.id = {
          [Op.in]: where.id[Op.in].filter((id) => useCaseProductSet.has(id)),
        };

        if (!where.id[Op.in].length) {
          return {
            data: [],
            total: 0,
            page: pageNum,
            totalPages: 0,
          };
        }
      } else {
        where.id = {
          [Op.in]: useCaseProductIds,
        };
      }
    } else if (tier) {
      // Tier with no use_case_id is still invalid — a tier only means
      // something in the context of specific use case(s).
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "use_case_id is required when filtering by tier",
      );
    }

    // ── Parent Category / Grand Category filter ─────────────────────
    // Resolves down to a concrete product-id set, the same way search
    // does below, so it composes cleanly with search + other filters
    // instead of needing a join-based count.
    let parentIds = null;

    if (grand_category_id) {
      const grandIds = grand_category_id.split(",").map(Number).filter(Boolean);

      const grandMappings = await GrandCategoryMapping.findAll({
        where: { grand_category_id: { [Op.in]: grandIds } },
        attributes: ["parent_category_id"],
        raw: true,
      });

      parentIds = [...new Set(grandMappings.map((m) => m.parent_category_id))];
    }

    if (parent_category_id) {
      const explicitParentIds = parent_category_id
        .split(",")
        .map(Number)
        .filter(Boolean);

      // If both filters are given, intersect — "this Parent Category,
      // AND it must belong to this Grand Category" rather than OR.
      parentIds = parentIds
        ? explicitParentIds.filter((id) => parentIds.includes(id))
        : explicitParentIds;
    }

    if (parentIds) {
      if (!parentIds.length) {
        return { data: [], total: 0, page: pageNum, totalPages: 0 };
      }

      const parentMappings = await ParentCategoryMapping.findAll({
        where: { parent_category_id: { [Op.in]: parentIds } },
        attributes: ["product_category_id"],
        raw: true,
      });

      const categoryIds = [
        ...new Set(parentMappings.map((m) => m.product_category_id)),
      ];

      if (!categoryIds.length) {
        return { data: [], total: 0, page: pageNum, totalPages: 0 };
      }

      const productMappings = await ProductCategoryMapping.findAll({
        where: { product_category_id: { [Op.in]: categoryIds } },
        attributes: ["product_id"],
        raw: true,
      });

      const categoryFilterProductIds = [
        ...new Set(productMappings.map((m) => m.product_id)),
      ];

      if (!categoryFilterProductIds.length) {
        return { data: [], total: 0, page: pageNum, totalPages: 0 };
      }

      where.id = { [Op.in]: categoryFilterProductIds };
    }

    // ── NEW: Price range filter ──────────────────────────────────────
    // Narrows to products with at least one active variant in the given
    // range. Runs on the raw variant price (not the customer-facing
    // markup price), since this is the admin view. Intersects with the
    // category filter above the same way search intersects below it.
    if (min_price || max_price) {
      const priceConditions = {};
      if (min_price) priceConditions[Op.gte] = Number(min_price);
      if (max_price) priceConditions[Op.lte] = Number(max_price);

      const priceMatches = await ProductVariant.findAll({
        where: { is_active: true, price: priceConditions },
        attributes: ["product_id"],
        raw: true,
      });
      const priceProductIds = [
        ...new Set(priceMatches.map((v) => v.product_id)),
      ];

      if (!priceProductIds.length) {
        return { data: [], total: 0, page: pageNum, totalPages: 0 };
      }

      if (where.id) {
        where.id = {
          [Op.in]: where.id[Op.in].filter((id) => priceProductIds.includes(id)),
        };
        if (!where.id[Op.in].length) {
          return { data: [], total: 0, page: pageNum, totalPages: 0 };
        }
      } else {
        where.id = { [Op.in]: priceProductIds };
      }
    }

    // 🔥 SEARCH — SAME LOGIC AS getAllProducts
    if (search) {
      const searchVariants = getSearchVariants(search);
      const searchProductIds = new Set();

      const productMatches = await Product.findAll({
        where: {
          [Op.or]: searchVariants.flatMap((term) => [
            { name: { [Op.like]: `%${term}%` } },
            { description: { [Op.like]: `%${term}%` } },
            { external_style_id: { [Op.like]: `%${term}%` } },
            { external_style_name: { [Op.like]: `%${term}%` } },
          ]),
        },
        attributes: ["id"],
        raw: true,
      });
      productMatches.forEach((p) => searchProductIds.add(p.id));

      const brands = await Brand.findAll({
        where: {
          [Op.or]: searchVariants.map((term) => ({
            name: { [Op.like]: `%${term}%` },
          })),
        },
        attributes: ["id"],
        raw: true,
      });

      if (brands.length) {
        const brandProducts = await Product.findAll({
          where: { brand_id: { [Op.in]: brands.map((b) => b.id) } },
          attributes: ["id"],
          raw: true,
        });
        brandProducts.forEach((p) => searchProductIds.add(p.id));
      }

      const categories = await ProductCategory.findAll({
        where: {
          [Op.or]: searchVariants.map((term) => ({
            title: { [Op.like]: `%${term}%` },
          })),
        },
        attributes: ["id"],
        raw: true,
      });

      if (categories.length) {
        const mappings = await ProductCategoryMapping.findAll({
          where: {
            product_category_id: { [Op.in]: categories.map((c) => c.id) },
          },
          attributes: ["product_id"],
          raw: true,
        });
        mappings.forEach((m) => searchProductIds.add(m.product_id));
      }

      const parentCategories = await ParentCategory.findAll({
        where: {
          [Op.or]: searchVariants.map((term) => ({
            title: { [Op.like]: `%${term}%` },
          })),
        },
        include: [
          {
            model: ProductCategory,
            as: "categories",
            attributes: ["id"],
            through: { attributes: [] },
          },
        ],
      });

      for (const parent of parentCategories) {
        const categoryIds = parent.categories.map((c) => c.id);
        if (!categoryIds.length) continue;

        const mappings = await ProductCategoryMapping.findAll({
          where: { product_category_id: { [Op.in]: categoryIds } },
          attributes: ["product_id"],
          raw: true,
        });
        mappings.forEach((m) => searchProductIds.add(m.product_id));
      }

      const colorVariants = await ProductVariant.findAll({
        where: {
          [Op.or]: searchVariants.map((term) => ({
            color: { [Op.like]: `%${term}%` },
          })),
        },
        attributes: ["product_id"],
        raw: true,
      });
      colorVariants.forEach((v) => searchProductIds.add(v.product_id));

      if (!searchProductIds.size) {
        return { data: [], total: 0, page: pageNum, totalPages: 0 };
      }

      // Combine search with the category/price filters above (AND, not
      // OR) — if multiple are active, a product must satisfy all of them.
      if (where.id) {
        where.id = {
          [Op.in]: where.id[Op.in].filter((id) => searchProductIds.has(id)),
        };
        if (!where.id[Op.in].length) {
          return { data: [], total: 0, page: pageNum, totalPages: 0 };
        }
      } else {
        where.id = { [Op.in]: [...searchProductIds] };
      }
    }

    // Count with NO joins — where.id already narrows to the exact set,
    // so category/price/search filtering never needs to touch the count
    // query.
    const count = await Product.count({ where });

    const rows = await Product.findAll({
      where,
      limit: limitNum,
      offset,
      include: [
        {
          model: ProductAttachment,
          as: "attachments",
          required: false,
          separate: true,
        },
        {
          model: ProductCategory,
          as: "categories",
          attributes: ["id", "title", "supplier"],
          through: { attributes: [] },
          required: false,
          include: [
            {
              model: ParentCategory,
              as: "parent_categories",
              attributes: ["id", "title"],
              through: { attributes: [] },
              required: false,
              include: [
                {
                  model: GrandCategory,
                  as: "grand_categories",
                  attributes: ["id", "title"],
                  through: { attributes: [] },
                  required: false,
                },
              ],
            },
          ],
        },
      ],
      order: [["created_at", "DESC"]],
    });

    const formattedProducts = rows.map((product) => {
      const data = product.toJSON();
      data.attachments = (data.attachments || []).sort((a, b) => {
        const aFront = a.file_name?.includes("-0.");
        const bFront = b.file_name?.includes("-0.");
        if (aFront && !bFront) return -1;
        if (!aFront && bFront) return 1;
        return 0;
      });
      return { ...data, name: decodeHtmlEntities(data.name) };
    });

    return {
      data: formattedProducts,
      total: count,
      page: pageNum,
      totalPages: Math.ceil(count / limitNum),
    };
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getProductsForBrandMapping = async (query) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      category_id,
      supplier,
      supplier_id,
      is_brand_manually_assigned,
      sort_by = "created_at",
      sort_order = "DESC",
    } = query;

    const pageNumber = Math.max(Number(page) || 1, 1);
    const pageLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const offset = (pageNumber - 1) * pageLimit;

    /*
     * ---------------------------------------------------------
     * WHERE
     * ---------------------------------------------------------
     */

    const where = {
      is_active: true,

      /*
       * Show:
       * 1. Products without a brand
       * 2. Products manually assigned by admin
       */
      [Op.or]: [
        {
          brand_id: {
            [Op.is]: null,
          },
        },
        {
          is_brand_manually_assigned: true,
        },
      ],
    };

    /*
     * ---------------------------------------------------------
     * SEARCH
     * ---------------------------------------------------------
     */

    if (search?.trim()) {
      const keyword = search.trim();

      where[Op.and] = [
        {
          [Op.or]: [
            {
              name: {
                [Op.like]: `%${keyword}%`,
              },
            },
            {
              external_style_id: {
                [Op.like]: `%${keyword}%`,
              },
            },
            {
              external_style_name: {
                [Op.like]: `%${keyword}%`,
              },
            },
            {
              supplier_id: {
                [Op.like]: `%${keyword}%`,
              },
            },
          ],
        },
      ];
    }

    /*
     * ---------------------------------------------------------
     * SUPPLIER FILTER
     * ---------------------------------------------------------
     */

    if (supplier) {
      where.supplier = supplier;
    }

    if (supplier_id) {
      where.supplier_id = supplier_id;
    }

    /*
     * ---------------------------------------------------------
     * MANUAL ASSIGNMENT FILTER
     * ---------------------------------------------------------
     */

    if (is_brand_manually_assigned !== undefined) {
      where.is_brand_manually_assigned =
        String(is_brand_manually_assigned) === "true";
    }

    /*
     * ---------------------------------------------------------
     * CATEGORY
     * ---------------------------------------------------------
     */

    const categoryInclude = {
      model: ProductCategory,
      as: "categories",

      attributes: ["id", "title", "supplier"],

      through: {
        attributes: [],
      },

      required: false,

      /*
       * Parent Category
       */
      include: [
        {
          model: ParentCategory,
          as: "parent_categories",

          attributes: ["id", "title"],

          through: {
            attributes: [],
          },

          required: false,

          /*
           * Grand Category
           */
          include: [
            {
              model: GrandCategory,
              as: "grand_categories",

              attributes: ["id", "title"],

              through: {
                attributes: [],
              },

              required: false,
            },
          ],
        },
      ],
    };

    /*
     * If category_id is provided,
     * only products linked to that category are returned.
     */

    if (category_id) {
      categoryInclude.where = {
        id: category_id,
      };

      categoryInclude.required = true;
    }

    /*
     * ---------------------------------------------------------
     * SORT
     * ---------------------------------------------------------
     */

    const allowedSortFields = [
      "id",
      "name",
      "created_at",
      "updated_at",
      "supplier",
      "external_style_id",
    ];

    const sortField = allowedSortFields.includes(sort_by)
      ? sort_by
      : "created_at";

    const sortDirection =
      String(sort_order).toUpperCase() === "ASC" ? "ASC" : "DESC";

    /*
     * ---------------------------------------------------------
     * QUERY
     * ---------------------------------------------------------
     */

    const { count, rows } = await Product.findAndCountAll({
      where,

      attributes: [
        "id",
        "name",
        "description",
        "brand_id",
        "is_brand_manually_assigned",
        "external_style_id",
        "external_style_name",
        "supplier_id",
        "supplier_name",
        "supplier",
        "is_discontinued",
        "is_active",
        "created_at",
        "updated_at",
      ],

      include: [
        /*
         * -----------------------------------------------------
         * BRAND
         * -----------------------------------------------------
         */

        {
          model: Brand,
          as: "brand",

          attributes: ["id", "name", "slug", "logo_url"],

          required: false,
        },

        /*
         * -----------------------------------------------------
         * PRODUCT ATTACHMENTS / IMAGES
         * -----------------------------------------------------
         */

        {
          model: ProductAttachment,
          as: "attachments",

          attributes: ["id", "file_name", "file_uri", "is_primary"],

          where: {
            is_active: true,
          },

          required: false,
        },

        /*
         * -----------------------------------------------------
         * CATEGORY
         * → PARENT CATEGORY
         * → GRAND CATEGORY
         * -----------------------------------------------------
         */

        categoryInclude,
      ],

      /*
       * Important because category and attachment
       * joins can create duplicate product rows.
       */

      distinct: true,

      limit: pageLimit,

      offset,

      order: [[sortField, sortDirection]],
    });

    /*
     * ---------------------------------------------------------
     * RESPONSE
     * ---------------------------------------------------------
     */

    return {
      products: rows,

      pagination: {
        page: pageNumber,
        limit: pageLimit,
        total: count,
        totalPages: Math.ceil(count / pageLimit),
      },
    };
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const assignBrandToProducts = async (body) => {
  const transaction = await sequelize.transaction();

  try {
    const { product_ids, brand_id } = body;

    /*
     * ---------------------------------------------------------
     * VALIDATION
     * ---------------------------------------------------------
     */

    if (!Array.isArray(product_ids) || product_ids.length === 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "product_ids must be a non-empty array",
      );
    }

    if (!brand_id) {
      throw new ApiError(httpStatus.BAD_REQUEST, "brand_id is required");
    }

    /*
     * Remove duplicate product IDs
     */

    const productIds = [
      ...new Set(
        product_ids
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ];

    if (productIds.length === 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "No valid product IDs provided",
      );
    }

    /*
     * ---------------------------------------------------------
     * CHECK BRAND
     * ---------------------------------------------------------
     */

    const brand = await Brand.findOne({
      where: {
        id: brand_id,
        is_active: true,
      },
      transaction,
    });

    if (!brand) {
      throw new ApiError(httpStatus.NOT_FOUND, "Brand not found");
    }

    /*
     * ---------------------------------------------------------
     * CHECK PRODUCTS
     * ---------------------------------------------------------
     */

    const products = await Product.findAll({
      where: {
        id: {
          [Op.in]: productIds,
        },
        is_active: true,
      },
      attributes: ["id", "name", "brand_id", "is_brand_manually_assigned"],
      transaction,
    });

    /*
     * Make sure every requested product exists
     */

    const foundProductIds = new Set(
      products.map((product) => Number(product.id)),
    );

    const missingProductIds = productIds.filter(
      (id) => !foundProductIds.has(id),
    );

    if (missingProductIds.length > 0) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        `Some products were not found: ${missingProductIds.join(", ")}`,
      );
    }

    /*
     * ---------------------------------------------------------
     * ASSIGN BRAND
     * ---------------------------------------------------------
     *
     * This is a manual/admin assignment.
     * Therefore we permanently mark it as manually assigned.
     */

    const [updatedCount] = await Product.update(
      {
        brand_id: brand.id,
        is_brand_manually_assigned: true,
      },
      {
        where: {
          id: {
            [Op.in]: productIds,
          },
          is_active: true,
        },
        transaction,
      },
    );

    await transaction.commit();

    return {
      brand: {
        id: brand.id,
        name: brand.name,
        slug: brand.slug,
      },

      updated_count: updatedCount,

      product_ids: productIds,
    };
  } catch (error) {
    await transaction.rollback();

    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

module.exports = {
  createProduct,
  addProductVariants,
  duplicateProduct,
  updateManualProductFull,
  getAllProducts,
  getAllProductsByGrandCategory,
  getProductsByBrand,
  getProductById,
  getGuestProductById,
  getProductVariant,
  getVariantById,
  updateProduct,
  deleteProduct,
  getSSStylesByBrand,
  getSSProductByStyle,
  saveSSProductToDB,
  deleteSSProductByStyle,
  getProductVariantByAdmin,
  getAdminStats,
  getProductByIdAdmin,
  getAllProductsAdmin,
  getProductsForBrandMapping,
  assignBrandToProducts,
  getSearchVariants,
};
