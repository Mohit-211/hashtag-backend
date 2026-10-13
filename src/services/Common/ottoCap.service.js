const {
  ImportBatch,
  SourceRawData,
  Product,
  ProductAttachment,
  ProductVariant,
  VariantAttachment,
  ProductCategoryMapping,
  Ottocap,
  OttocapCatalog,
} = require("../../models");
const sequelize = require("../../config/central.db");
const XLSX = require("xlsx");
const { Op } = require("sequelize");
const { downloadSupplierImage } = require("./supplierImage.service");
const { getOrCreateColorCode } = require("./colorService");

const importOttoCapInventory = async () => {
  try {
    console.log("🚀 Starting OttoCap Inventory Import...");

    // Read Excel
    const workbook = XLSX.readFile("/var/www/ottocap/otto_inventory.xlsx");

    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    const rows = XLSX.utils.sheet_to_json(sheet, {
      defval: null,
    });

    console.log(`📄 Total Rows Found: ${rows.length}`);

    if (!rows.length) {
      return {
        success: false,
        message: "No rows found in Excel",
      };
    }

    // Clear old inventory
    await Ottocap.destroy({
      where: {},
      truncate: true,
    });

    const payload = rows.map((row) => ({
      sku_no: row.sku_no || null,
      sku_parent: row.sku_parent || null,
      brand: row.brand || null,
      name: row.name || null,
      color: row.color || null,
      size: row.size || null,
      instock: Number(row.instock || 0),
      ca_stock: Number(row.CA || 0),
      tx_stock: Number(row.TX || 0),
      ga_stock: Number(row.GA || 0),
    }));

    // Bulk Insert
    await Ottocap.bulkCreate(payload, {
      validate: false,
    });

    console.log(`✅ Imported ${payload.length} OttoCap records`);

    return {
      success: true,
      total_records: payload.length,
    };
  } catch (err) {
    console.error("❌ OttoCap inventory import failed:", err);

    throw err;
  }
};

const importOttoCapCatalog = async () => {
  try {
    console.log("🚀 Starting OttoCap Catalog Import...");

    const workbook = XLSX.readFile("/var/www/ottocap/otto_catalog.xlsx");

    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    const rows = XLSX.utils.sheet_to_json(sheet, {
      defval: null,
    });

    console.log(`📄 Total Rows Found: ${rows.length}`);

    if (!rows.length) {
      return {
        success: false,
        message: "No rows found in catalog file",
      };
    }

    await OttocapCatalog.destroy({
      where: {},
      truncate: true,
    });

    const payload = rows.map((row) => ({
      sku_no: row.sku_no || null,
      sku_parent: row.sku_parent || null,

      upc: row.UPC || null,

      brand: row.brand || null,

      name: row.name || null,

      description_short: row.description_short || null,
      description: row.description || null,
      plain_description: row.plain_description || null,

      material_content: row.material_content || null,

      url: row.url || null,

      price_1: row["1+"] || null,
      price_144: row["144+"] || null,
      price_288: row["288+"] || null,
      price_576: row["576+"] || null,
      price_1296: row["1296+"] || null,

      image_1: row.image_1 || null,
      image_2: row.image_2 || null,
      image_3: row.image_3 || null,
      image_4: row.image_4 || null,
      image_5: row.image_5 || null,
      image_6: row.image_6 || null,
      image_7: row.image_7 || null,
      image_8: row.image_8 || null,
      image_9: row.image_9 || null,
      image_10: row.image_10 || null,

      image_main: row.image_main || null,

      color: row.color || null,
      size: row.size || null,

      type: row.type || null,

      weight: row.weight || null,

      instock: Number(row.instock || 0),
      qty: Number(row.qty || 0),

      status: row.status || null,
    }));

    const chunkSize = 500;

    for (let i = 0; i < payload.length; i += chunkSize) {
      const chunk = payload.slice(i, i + chunkSize);

      await OttocapCatalog.bulkCreate(chunk, {
        validate: false,
      });

      console.log(
        `Inserted ${Math.min(
          i + chunkSize,
          payload.length,
        )} / ${payload.length}`,
      );
    }

    console.log(`✅ Imported ${payload.length} OttoCap catalog records`);

    return {
      success: true,
      total_records: payload.length,
    };
  } catch (err) {
    console.error("❌ OttoCap catalog import failed:", err);

    throw err;
  }
};

const getOttoProducts = async () => {
  try {
    const importedProducts = await Product.findAll({
      where: {
        supplier: "OTTOCAP",
      },

      attributes: ["external_style_id"],

      raw: true,
    });

    const importedMap = new Set(
      importedProducts.map((product) => product.external_style_id),
    );

    const products = await OttocapCatalog.findAll({
      where: {
        sku_parent: null,
      },

      attributes: ["sku_no", "name", "brand", "image_main"],

      order: [["name", "ASC"]],

      raw: true,
    });

    const data = products.map((product) => ({
      ...product,

      image_main: `https://node.hashtagbillionaire.com/api/v1/ottocap/otto-image?url=${encodeURIComponent(product.image_main)}`,

      is_imported: importedMap.has(product.sku_no),
    }));

    return {
      total: data.length,
      data,
    };
  } catch (error) {
    console.error("❌ Error fetching OTTO products:", error.message);

    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getOttoProductDetails = async (skuNo) => {
  try {
    const parent = await OttocapCatalog.findOne({
      where: {
        sku_no: skuNo,
      },

      raw: true,
    });

    if (!parent) {
      throw new Error("Product not found");
    }

    /*
     * Product Imported?
     */
    const importedProduct = await Product.findOne({
      where: {
        supplier: "OTTOCAP",

        external_style_id: skuNo,
      },

      attributes: ["id"],

      raw: true,
    });

    /*
     * Imported Variants
     */
    let importedVariantMap = new Set();

    if (importedProduct) {
      const importedVariants = await ProductVariant.findAll({
        where: {
          product_id: importedProduct.id,
        },

        attributes: ["sku"],

        raw: true,
      });

      importedVariantMap = new Set(
        importedVariants.map((variant) => variant.sku),
      );
    }

    /*
     * Variants
     */
    const variants = await OttocapCatalog.findAll({
      where: {
        sku_parent: skuNo,
      },

      raw: true,
    });

    /*
     * Inventory
     */
    const inventory = await Ottocap.findAll({
      where: {
        [Op.or]: [
          {
            sku_no: skuNo,
          },
          {
            sku_parent: skuNo,
          },
        ],
      },

      raw: true,
    });

    const inventoryMap = new Map(inventory.map((item) => [item.sku_no, item]));

    /*
     * Variant Response
     */
    const variantData = variants.map((variant) => {
      const stock = inventoryMap.get(variant.sku_no);

      return {
        ...variant,

        image_main: `https://node.hashtagbillionaire.com/api/v1/ottocap/otto-image?url=${encodeURIComponent(variant.image_main)}`,

        is_imported: importedVariantMap.has(variant.sku_no),

        instock: stock?.instock || 0,

        ca_stock: stock?.ca_stock || 0,

        tx_stock: stock?.tx_stock || 0,

        ga_stock: stock?.ga_stock || 0,
      };
    });

    const parentStock = inventoryMap.get(parent.sku_no);

    return {
      product: {
        ...parent,

        image_main: `https://node.hashtagbillionaire.com/api/v1/ottocap/otto-image?url=${encodeURIComponent(parent.image_main)}`,

        is_imported: !!importedProduct,

        instock: parentStock?.instock || 0,

        ca_stock: parentStock?.ca_stock || 0,

        tx_stock: parentStock?.tx_stock || 0,

        ga_stock: parentStock?.ga_stock || 0,
      },

      variants: variantData,
    };
  } catch (error) {
    console.error("❌ Error fetching OTTO product details:", error.message);

    throw error;
  }
};

const restoreOttoProduct = async (productId, transaction) => {
  await Product.update(
    {
      deleted_at: null,
      is_active: true,
    },
    {
      where: {
        id: productId,
      },

      paranoid: false,

      transaction,
    },
  );

  await ProductVariant.update(
    {
      deleted_at: null,
      is_active: true,
    },
    {
      where: {
        product_id: productId,
      },

      paranoid: false,

      transaction,
    },
  );

  await ProductAttachment.update(
    {
      deleted_at: null,
    },
    {
      where: {
        product_id: productId,
      },

      paranoid: false,

      transaction,
    },
  );

  const variants = await ProductVariant.findAll({
    where: {
      product_id: productId,
    },

    paranoid: false,

    transaction,
  });

  const variantIds = variants.map((x) => x.id);

  if (variantIds.length) {
    await VariantAttachment.update(
      {
        deleted_at: null,
      },
      {
        where: {
          variant_id: variantIds,
        },

        paranoid: false,

        transaction,
      },
    );
  }
};

const saveOttoProductToDB = async (skuNo, batchId) => {
  // =====================================================
  // CHECK SYNC LOCK
  // =====================================================

  const existingProduct = await Product.findOne({
    where: {
      supplier: "OTTOCAP",
      external_style_id: String(skuNo),
    },
    attributes: ["id", "sync_locked"],
    paranoid: false,
  });

  if (existingProduct?.sync_locked) {
    console.log(`⏭️ OTTOCAP product ${skuNo} is sync locked. Skipping.`);

    return {
      skipped: true,
      product_id: existingProduct.id,
    };
  }
  const transaction = await sequelize.transaction();

  try {
    const parent = await OttocapCatalog.findOne({
      where: {
        sku_no: skuNo,
      },
      raw: true,
    });

    if (!parent) {
      throw new Error(`Product ${skuNo} not found`);
    }

    const variants = await OttocapCatalog.findAll({
      where: {
        sku_parent: skuNo,
      },
      raw: true,
    });

    const inventoryRows = await Ottocap.findAll({
      where: {
        sku_parent: skuNo,
      },
      raw: true,
    });

    const inventoryMap = new Map(inventoryRows.map((x) => [x.sku_no, x]));

    const { product } = await saveOttoProductBaseOnly({
      parent,
      variants,
      batchId,
      transaction,
    });

    for (const variant of variants) {
      await saveOttoVariantToDB({
        product,
        parent,
        variant,
        inventory: inventoryMap.get(variant.sku_no),
        batchId,
        transaction,
      });
    }

    await SourceRawData.upsert(
      {
        source_name: "OTTOCAP",
        external_id: parent.sku_no,
        raw_json: {
          parent,
          variants,
          inventory: inventoryRows,
        },
        import_batch_id: batchId,
      },
      { transaction },
    );

    await transaction.commit();

    return product;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};

const saveOttoProductBaseOnly = async ({
  parent,
  variants = [],
  batchId = null,
  transaction,
}) => {
  const existingProduct = await Product.findOne({
    where: {
      supplier: "OTTOCAP",
      external_style_id: parent.sku_no,
    },
    paranoid: false,
    transaction,
  });

  if (existingProduct?.deleted_at) {
    await restoreOttoProduct(existingProduct.id, transaction);
  }

  await Product.upsert(
    {
      name: parent.name,

      description: parent.description || parent.plain_description,

      external_style_id: parent.sku_no,

      external_style_name: parent.name,

      supplier: "OTTOCAP",

      supplier_name: parent.brand,

      import_batch_id: batchId,

      price: Number(parent.price_1 || 0) || Number(variants?.[0]?.price_1 || 0),

      is_active: true,

      deleted_at: null,

      last_supplier_sync_at: new Date(),

      meta: {
        brand: parent.brand,

        description_short: parent.description_short,

        plain_description: parent.plain_description,

        material_content: parent.material_content,

        supplier_url: parent.url,

        status: parent.status,

        image_main: parent.image_main,

        image_count: [
          parent.image_1,
          parent.image_2,
          parent.image_3,
          parent.image_4,
          parent.image_5,
          parent.image_6,
          parent.image_7,
          parent.image_8,
          parent.image_9,
          parent.image_10,
        ].filter(Boolean).length,

        raw_product: parent,
      },
    },
    {
      returning: true,
      transaction,
    },
  );

  const product = await Product.findOne({
    where: {
      supplier: "OTTOCAP",
      external_style_id: parent.sku_no,
    },
    transaction,
  });

  let categoryMapping = await ProductCategoryMapping.findOne({
    where: {
      product_id: product.id,
      product_category_id: 1461,
    },
    paranoid: false,
    transaction,
  });

  if (categoryMapping) {
    if (categoryMapping.deleted_at) {
      await categoryMapping.restore({
        transaction,
      });

      await categoryMapping.update(
        {
          is_active: true,
        },
        {
          transaction,
        },
      );
    }

    await categoryMapping.reload({
      paranoid: false,
      transaction,
    });
  } else {
    categoryMapping = await ProductCategoryMapping.create(
      {
        product_id: product.id,
        product_category_id: 1461,
        is_active: true,
      },
      {
        transaction,
      },
    );
  }

  const parentImages = [
    parent.image_1,
    parent.image_2,
    parent.image_3,
    parent.image_4,
    parent.image_5,
    parent.image_6,
    parent.image_7,
    parent.image_8,
    parent.image_9,
    parent.image_10,
  ].filter(Boolean);

  let imageIndex = 1;

  for (const imageUrl of parentImages) {
    const localImage = await downloadSupplierImage({
      supplier: "ottocap",

      imageUrl,

      styleId: parent.sku_no,

      sku: parent.sku_no,

      imageType: `product-${imageIndex}`,
    });

    if (!localImage) {
      imageIndex++;
      continue;
    }

    const existingAttachment = await ProductAttachment.findOne({
      where: {
        product_id: product.id,
        source_url: imageUrl,
      },
      paranoid: false,
      transaction,
    });

    if (existingAttachment) {
      await existingAttachment.update(
        {
          deleted_at: null,

          file_uri: localImage,

          file_name: localImage.split("/").pop(),
        },
        {
          transaction,
        },
      );
    } else {
      await ProductAttachment.create(
        {
          product_id: product.id,

          file_name: localImage.split("/").pop(),

          file_uri: localImage,

          source_url: imageUrl,

          file_type: "image",

          supplier: "OTTOCAP",

          is_primary: imageIndex === 1,
        },
        {
          transaction,
        },
      );
    }

    imageIndex++;
  }

  return {
    product,
  };
};

const saveOttoVariantToDB = async ({
  product,
  parent,
  variant,
  inventory,
  batchId = null,
  transaction,
}) => {
  const colorCode = await getOrCreateColorCode("OTTOCAP", variant.color);
  const [createdVariant, created] = await ProductVariant.findOrCreate({
    where: {
      product_id: product.id,

      sku: variant.sku_no,
    },
    paranoid: false,

    defaults: {
      product_id: product.id,

      color: variant.color,
      color_code: colorCode,

      size: variant.size,

      stock: Number(inventory?.instock || 0),

      quantity: Number(inventory?.instock || 0),

      weight: Number(variant.weight || 0),

      price: Number(variant.price_1 || 0),

      case_price: Number(variant.price_144 || 0),

      retail_price: Number(variant.price_288 || 0),

      sale_price: Number(variant.price_576 || 0),

      supplier: "OTTOCAP",

      import_batch_id: batchId,

      last_supplier_sync_at: new Date(),

      meta: {
        supplier_status: variant.status,

        material_content: variant.material_content,

        type: variant.type,

        supplier_url: variant.url,

        price_1: variant.price_1,

        price_144: variant.price_144,

        price_288: variant.price_288,

        price_576: variant.price_576,

        price_1296: variant.price_1296,

        ca_stock: inventory?.ca_stock || 0,

        tx_stock: inventory?.tx_stock || 0,

        ga_stock: inventory?.ga_stock || 0,

        raw_variant: variant,
      },
    },

    transaction,
  });

  if (!created) {
    if (createdVariant.deletedAt) {
      console.log("Restoring variant:", createdVariant.id);

      await createdVariant.restore({
        transaction,
      });
    }

    await createdVariant.update(
      {
        is_active: true,

        stock: Number(inventory?.instock || 0),

        quantity: Number(inventory?.instock || 0),

        price: Number(variant.price_1 || 0),

        case_price: Number(variant.price_144 || 0),

        retail_price: Number(variant.price_288 || 0),

        sale_price: Number(variant.price_576 || 0),

        weight: Number(variant.weight || 0),

        color: variant.color,

        color_code: colorCode,

        size: variant.size,

        last_supplier_sync_at: new Date(),

        meta: {
          supplier_status: variant.status,
          material_content: variant.material_content,
          type: variant.type,
          supplier_url: variant.url,
          price_1: variant.price_1,
          price_144: variant.price_144,
          price_288: variant.price_288,
          price_576: variant.price_576,
          price_1296: variant.price_1296,
          ca_stock: inventory?.ca_stock || 0,
          tx_stock: inventory?.tx_stock || 0,
          ga_stock: inventory?.ga_stock || 0,
          raw_variant: variant,
        },
      },
      {
        transaction,
      },
    );
  }

  const variantImages = [
    variant.image_1,
    variant.image_2,
    variant.image_3,
    variant.image_4,
    variant.image_5,
    variant.image_6,
    variant.image_7,
    variant.image_8,
    variant.image_9,
    variant.image_10,
  ].filter(Boolean);

  let variantImageIndex = 1;

  for (const imageUrl of variantImages) {
    const localImage = await downloadSupplierImage({
      supplier: "ottocap",

      imageUrl,

      styleId: parent.sku_no,

      sku: variant.sku_no,

      imageType: `variant-${variantImageIndex}`,
    });

    if (!localImage) {
      variantImageIndex++;
      continue;
    }

    const existingVariantImage = await VariantAttachment.findOne({
      where: {
        variant_id: createdVariant.id,

        source_url: imageUrl,
      },

      paranoid: false,

      transaction,
    });

    if (existingVariantImage) {
      await existingVariantImage.update(
        {
          deleted_at: null,

          file_uri: localImage,

          file_name: localImage.split("/").pop(),
        },
        {
          transaction,
        },
      );
    } else {
      await VariantAttachment.create(
        {
          variant_id: createdVariant.id,

          file_name: localImage.split("/").pop(),

          file_uri: localImage,

          source_url: imageUrl,

          file_type: "image",

          supplier: "OTTOCAP",

          is_primary: variantImageIndex === 1,
        },
        {
          transaction,
        },
      );
    }

    variantImageIndex++;
  }

  return createdVariant;
};

const importSelectedOttoVariants = async (
  parentSku,
  variantSkus = [],
  batchNotes = "",
) => {
  let batch;
  let transaction;

  try {
    if (!parentSku) {
      throw new Error("parentSku is required");
    }

    if (!Array.isArray(variantSkus) || variantSkus.length === 0) {
      throw new Error("variantSkus array is required");
    }

    variantSkus = [...new Set(variantSkus)];

    batch = await ImportBatch.create({
      source_name: "OTTOCAP_SELECTED_VARIANTS",
      status: "processing",
      notes: batchNotes || `Import selected variants for ${parentSku}`,
    });

    transaction = await sequelize.transaction();

    /*
     * Parent
     */
    const parent = await OttocapCatalog.findOne({
      where: {
        sku_no: parentSku,
      },
      raw: true,
    });

    if (!parent) {
      throw new Error(`Parent product ${parentSku} not found`);
    }

    /*
     * Selected Variants
     */
    const variants = await OttocapCatalog.findAll({
      where: {
        sku_parent: parentSku,
        sku_no: variantSkus,
      },
      raw: true,
    });

    if (!variants.length) {
      throw new Error("No matching variants found");
    }

    /*
     * Inventory
     */
    const inventoryRows = await Ottocap.findAll({
      where: {
        sku_no: variantSkus,
      },
      raw: true,
    });

    const inventoryMap = new Map(inventoryRows.map((x) => [x.sku_no, x]));

    /*
     * Create Parent Product
     */
    const { product } = await saveOttoProductBaseOnly({
      parent,
      variants,
      batchId: batch.id,
      transaction,
    });

    let success = 0;
    let failed = 0;

    const failedVariants = [];

    /*
     * Import Selected Variants Only
     */
    for (const variant of variants) {
      try {
        await saveOttoVariantToDB({
          product,
          parent,
          variant,
          inventory: inventoryMap.get(variant.sku_no),
          batchId: batch.id,
          transaction,
        });

        success++;
      } catch (err) {
        failed++;

        failedVariants.push(variant.sku_no);

        console.error(`❌ Variant Failed ${variant.sku_no}`, err.message);
      }
    }

    await transaction.commit();

    await batch.update({
      status:
        failed === 0 ? "success" : success > 0 ? "partial_success" : "failed",

      total_records: variantSkus.length,

      processed_records: success,

      error_message: failed > 0 ? `${failed} variants failed` : null,
    });

    return {
      productId: product.id,
      parentSku,
      success,
      failed,
      failedVariants,
      batchId: batch.id,
    };
  } catch (err) {
    if (transaction) {
      await transaction.rollback();
    }

    if (batch) {
      await batch.update({
        status: "failed",
        error_message: err.message,
      });
    }

    throw err;
  }
};

module.exports = {
  importOttoCapInventory,
  importOttoCapCatalog,
  getOttoProducts,
  getOttoProductDetails,
  saveOttoProductToDB,
  importSelectedOttoVariants,
};
