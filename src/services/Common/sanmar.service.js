const { Op } = require("sequelize");
const {
  Sanmar,
  Brand,
  ImportBatch,
  SourceRawData,
  Product,
  ProductAttachment,
  ProductVariant,
  VariantAttachment,
  ProductCategory,
  ProductCategoryMapping,
  Size,
} = require("../../models");
const { BRAND_LOGO_MAP, getBrandLogo } = require("../../config/sanmarBrand");
const sequelize = require("../../config/central.db");
const { downloadSupplierImage } = require("./supplierImage.service");
const { getOrCreateColorCode } = require("./colorService");
const { restoreListedVariants, markProductRestored } = require("./supplierStatus.service");

const syncSanmarBrands = async () => {
  let batch;

  try {
    console.log("🚀 Starting Sanmar Brand Sync...");

    // ✅ CREATE BATCH
    batch = await ImportBatch.create({
      source_name: "SANMAR_BRAND",
      status: "processing",
    });

    const brands = Object.entries(BRAND_LOGO_MAP);

    let processed = 0;

    for (const [name, logo] of brands) {
      try {
        await Brand.upsert({
          name,
          supplier: "SANMAR",
          logo,
          import_batch_id: batch.id,
        });

        processed++;
      } catch (err) {
        console.error("❌ Brand failed:", name, err.message);
      }
    }

    await batch.update({
      status: "success",
      total_records: brands.length,
      processed_records: processed,
    });

    console.log("✅ Sanmar brands synced");
  } catch (err) {
    console.error("❌ Sanmar brand sync failed", err.message);

    if (batch) {
      await Brand.destroy({
        where: {
          import_batch_id: batch.id,
        },
      });

      await batch.update({
        status: "failed",
        error_message: err.message,
      });
    }
  }
};

const getSanmarBrands = async () => {
  try {
    const brands = await Brand.findAll({
      where: {
        supplier: "SANMAR",
        is_active: true,
      },
      attributes: ["id", "name", "logo"],
      order: [["name", "ASC"]],
      raw: true,
    });

    return {
      total: brands.length,
      data: brands,
    };
  } catch (err) {
    console.error("❌ Fetch Sanmar brands failed:", err.message);
    throw err;
  }
};

const getSanmarStylesByBrand = async (brand) => {
  try {
    const logo = getBrandLogo(brand);

    if (!logo) {
      return {
        total: 0,
        data: [],
      };
    }

    const styles = await Sanmar.findAll({
      attributes: ["STYLE"],
      where: {
        BRAND_LOGO_IMAGE: logo,
      },
      group: ["STYLE"],
    });

    const importedStyles = await Product.findAll({
      where: {
        supplier: "SANMAR",
      },
      attributes: ["external_style_id"],
      raw: true,
    });

    const importedStyleSet = new Set(
      importedStyles.map((p) =>
        String(p.external_style_id),
      ),
    );

    const formatted = styles.map((s) => ({
      style_name: s.STYLE,
      brand,
      imported: importedStyleSet.has(
        String(s.STYLE),
      ),
    }));

    return {
      total: formatted.length,
      data: formatted,
    };
  } catch (err) {
    console.error(
      "❌ Sanmar styles error:",
      err.message,
    );

    throw err;
  }
};

const safeImages = (arr = []) => [
  ...new Set(
    arr.filter(
      (img) =>
        img &&
        img.startsWith("http") &&
        !img.includes("ImageNotAvailable.jpg") &&
        !img.includes("ImageNotAvailable"),
    ),
  ),
];

const getSanmarProductsByStyle = async (brand, style) => {
  try {
    const logo = getBrandLogo(brand);

    const rows = await Sanmar.findAll({
      where: {
        BRAND_LOGO_IMAGE: logo,
        STYLE: style,
      },
    });

    if (!rows.length) return null;

    const first = rows[0];

    const isDiscontinued = rows.every(
      (r) => r.PRODUCT_STATUS === "Discontinued",
    );
    const firstValidRow =
      rows.find(
        (r) =>
          r.FRONT_MODEL_IMAGE_URL &&
          !r.FRONT_MODEL_IMAGE_URL.includes("ImageNotAvailable"),
      ) || rows[0];

    return {
      style,
      brand,

      product: {
        name: first.PRODUCT_TITLE,
        description: first.PRODUCT_DESCRIPTION,
        styleName: first.STYLE,
        brand,

        category: first.CATEGORY_NAME,
        subcategory: first.SUBCATEGORY_NAME,

        // ✅ ONLY VALID IMAGES
        product_images: safeImages([
          firstValidRow.FRONT_MODEL_IMAGE_URL,

          buildSanmarImage(
            firstValidRow.FRONT_MODEL_IMAGE_URL,
            firstValidRow.BACK_MODEL_IMAGE,
          ),
        ]).slice(0, 2),

        // ✅ STORE DECORATION SHEET
        meta: {
          is_discontinued: isDiscontinued,
          spec_sheet: first.PRODUCT_MEASUREMENTS || null,
          decoration_spec_sheet: first.DECORATION_SPEC_SHEET || null,
          category: first.CATEGORY_NAME || null,
          subcategory: first.SUBCATEGORY_NAME || null,
          msrp: Number(first.MSRP || 0),
          map_price: Number(first.MAP_PRICING || 0),
          companion_styles: first.COMPANION_STYLES || null,
          raw_product: first,
        },
      },

      variants: rows.map((r) => ({
        sku: r.UNIQUE_KEY,

        variant_name: `${r.COLOR_NAME} - ${r.SIZE}`,

        status: r.PRODUCT_STATUS, // ✅ variant-level

        color: {
          name: r.COLOR_NAME,
          code: r.PMS_COLOR,
        },

        size: {
          name: r.SIZE,
        },

        pricing: {
          piece: Number(r.PIECE_PRICE || 0),
          dozen: Number(r.DOZENS_PRICE || 0),
          case: Number(r.CASE_PRICE || 0),
          msrp: Number(r.MSRP || 0),
          suggested: Number(r.SUGGESTED_PRICE || 0),
        },

        stock: Number(r.QTY || 0),

        // ✅ ONLY WORKING IMAGES
        images: safeImages([
          buildSanmarImage(r.FRONT_MODEL_IMAGE_URL, r.FRONT_MODEL_IMAGE_URL),

          buildSanmarImage(r.FRONT_MODEL_IMAGE_URL, r.BACK_MODEL_IMAGE),
        ]),

        extra: {
          weight: Number(r.PIECE_WEIGHT || 0),
          case_size: r.CASE_SIZE,
        },

        identifiers: {
          gtin: r.GTIN,
        },
      })),
    };
  } catch (err) {
    console.error("❌ Sanmar product fetch error:", err.message);
    throw err;
  }
};

const restoreSanmarProduct = async (styleId, transaction) => {
  const product = await Product.findOne({
    where: {
      external_style_id: String(styleId),
      supplier: "SANMAR",
    },
    paranoid: false,
    transaction,
  });

  if (!product || !product.deleted_at) {
    return product;
  }

  console.log(`♻️ Fully restoring SANMAR product ${product.id}`);

  await Product.update(
    {
      deleted_at: null,
      is_active: true,
    },
    {
      where: { id: product.id },
      paranoid: false,
      transaction,
    },
  );

  // Shown to admins: the sync brought back a product that had been removed.
  // Variants are restored after the upsert, only the ones SanMar lists
  // (restoreListedVariants in saveSanmarProductToDB).
  await markProductRestored(product.id, transaction);

  await ProductAttachment.update(
    {
      deleted_at: null,
      is_active: true,
    },
    {
      where: {
        product_id: product.id,
      },
      paranoid: false,
      transaction,
    },
  );

  await ProductCategoryMapping.update(
    {
      deleted_at: null,
      is_active: true,
    },
    {
      where: {
        product_id: product.id,
      },
      paranoid: false,
      transaction,
    },
  );

  await Size.update(
    {
      deleted_at: null,
      is_active: true,
    },
    {
      where: {
        product_id: product.id,
      },
      paranoid: false,
      transaction,
    },
  );

  return product;
};

const saveSanmarProductToDB = async (data, batchId) => {
  let transaction;

  const { product: pData, variants, style, brand: brandName } = data;

  try {
    // =====================================================
    // CHECK SYNC LOCK
    // =====================================================

    const existingProduct = await Product.findOne({
      where: {
        external_style_id: String(style),
        supplier: "SANMAR",
      },
      attributes: ["id", "sync_locked"],
      paranoid: false,
    });

    if (existingProduct?.sync_locked) {
      console.log(`⏭️ SANMAR product ${style} is sync locked. Skipping.`);

      return {
        skipped: true,
        product_id: existingProduct.id,
      };
    }
    // =========================
    // ✅ PRE DOWNLOAD PRODUCT IMAGES
    // =========================

    const downloadedProductImages = {};

    for (const [index, url] of (pData.product_images || []).entries()) {
      const localImage = await downloadSupplierImage({
        supplier: "SANMAR",
        imageUrl: url,
        styleId: style,
        sku: style,
        imageType: `product-${index}`,
      });

      downloadedProductImages[url] = localImage;
    }

    // =========================
    // ✅ PRE DOWNLOAD VARIANT IMAGES
    // =========================

    const downloadedVariantImages = {};

    for (const v of variants) {
      for (const [index, img] of (v.images || []).entries()) {
        if (!img || !img.startsWith("http")) continue;

        const localImage = await downloadSupplierImage({
          supplier: "SANMAR",
          imageUrl: img,
          styleId: style,
          sku: v.sku,
          imageType: `variant-${index}`,
        });

        downloadedVariantImages[`${v.sku}-${img}`] = localImage;
      }
    }

    // =========================
    // ✅ START TRANSACTION
    // =========================

    transaction = await sequelize.transaction();

    // =========================
    // ✅ HELPERS
    // =========================

    const normalizeSize = (size) => {
      if (!size) return null;

      const s = size.trim().toUpperCase();

      if (["SM", "SML"].includes(s)) return "S";
      if (["MED", "M"].includes(s)) return "M";
      if (["LRG", "L"].includes(s)) return "L";
      if (["XL", "X-LARGE"].includes(s)) return "XL";

      return s;
    };

    const normalize = (str) => str?.trim().toLowerCase();

    // =========================
    // ✅ BRAND
    // =========================

    let brand = await Brand.findOne({
      where: {
        name: brandName,
        supplier: "SANMAR",
      },
      transaction,
    });

    if (!brand) {
      brand = await Brand.findOne({
        where: {
          name: "Unknown",
        },
        transaction,
      });
    }

    // =========================
    // ✅ RAW DATA
    // =========================

    await SourceRawData.upsert(
      {
        source_name: "SANMAR",
        external_id: String(style),
        raw_json: data,
        import_batch_id: batchId,
      },
      { transaction },
    );

    await restoreSanmarProduct(style, transaction);

    const [product] = await Product.upsert(
      {
        name: pData.name,

        deleted_at: null,

        description: pData.description,

        brand_id: brand?.id || null,

        external_style_id: String(style),

        external_style_name: pData.styleName,

        supplier: "SANMAR",

        import_batch_id: batchId,

        meta: pData.meta || {},

        // 🔥 DISCONTINUED
        is_discontinued: pData.meta?.is_discontinued || false,

        discontinued_at: pData.meta?.is_discontinued ? new Date() : null,

        is_active: !pData.meta?.is_discontinued,

        // 🔥 TRACKING
        last_supplier_sync_at: new Date(),
      },
      {
        returning: true,

        transaction,

        fields: [
          "name",
          "description",
          "brand_id",
          "external_style_id",
          "external_style_name",
          "supplier",
          "import_batch_id",
          "meta",
          "is_discontinued",
          "discontinued_at",
          "is_active",
          "last_supplier_sync_at",
          "deleted_at",
        ],
      },
    );

    // MySQL reports no id when the upsert changed nothing (the same data saved twice
    // within one second); look the row up in that case.
    if (!product.id) {
      const saved = await Product.findOne({
        where: { supplier: "SANMAR", external_style_id: String(style) },
        attributes: ["id"],
        transaction,
      });
      product.id = saved.id;
    }

    // =========================
    // ✅ CATEGORY
    // =========================

    if (pData.category) {
      const categoryName = normalize(pData.category);

      let category = await ProductCategory.findOne({
        where: {
          title: categoryName,
          supplier: "SANMAR",
        },
        transaction,
      });

      if (!category) {
        category = await ProductCategory.create(
          {
            title: categoryName,
            supplier: "SANMAR",
            import_batch_id: batchId,
          },
          { transaction },
        );
      }

      const [mapping] = await ProductCategoryMapping.findOrCreate({
        where: {
          product_id: product.id,
          product_category_id: category.id,
        },
        defaults: {
          is_active: true,
        },
        transaction,
      });

      if (mapping.deleted_at) {
        await mapping.update(
          {
            deleted_at: null,
            is_active: true,
          },
          {
            paranoid: false,
            transaction,
          },
        );
      }
    }

    // =========================
    // ✅ PRODUCT IMAGES
    // =========================

    for (const [index, url] of (pData.product_images || []).entries()) {
      const localImage = downloadedProductImages[url];

      if (!localImage) continue;

      // ✅ FIND OLD CDN ROW OR NEW SOURCE_URL ROW
      const exists = await ProductAttachment.findOne({
        where: {
          product_id: product.id,
          file_type: "image",
          [Op.or]: [
            {
              source_url: url,
            },
            {
              file_uri: url,
            },
          ],
        },
        paranoid: false,
        order: [["id", "ASC"]],

        transaction,
      });

      // =========================
      // ✅ UPDATE EXISTING
      // =========================

      if (exists) {
        await ProductAttachment.update(
          {
            file_uri: localImage,
            deleted_at: null,
            source_url: url,
            file_name: localImage.split("/").pop(),
            supplier: "SANMAR",
            updated_at: new Date(),
          },
          {
            where: {
              id: exists.id,
            },

            transaction,

            hooks: false,

            validate: false,
          },
        );
      }

      // =========================
      // ✅ CREATE NEW
      // =========================
      else {
        await ProductAttachment.create(
          {
            product_id: product.id,

            file_name: localImage.split("/").pop(),

            file_uri: localImage,

            source_url: url,

            supplier: "SANMAR",

            file_type: "image",

            is_primary: index === 0,
          },
          {
            transaction,
          },
        );
      }
    }

    const productRows = await ProductAttachment.findAll({
      where: {
        product_id: product.id,
        file_type: "image",
      },
      paranoid: false,
      order: [["id", "DESC"]],
      transaction,
    });

    const keepIds = productRows.slice(0, 2).map((r) => r.id);

    await ProductAttachment.destroy({
      where: {
        product_id: product.id,
        id: {
          [Op.notIn]: keepIds,
        },
      },
      transaction,
    });

    // ✅ SIZES

    const normalizedSizes = [
      ...new Set(variants.map((v) => normalizeSize(v.size?.name))),
    ].filter(Boolean);

    await Size.bulkCreate(
      normalizedSizes.map((s) => ({
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

    // =========================
    // ✅ VARIANTS
    // =========================

    const uniqueColors = [
      ...new Set(variants.map((v) => v.color?.name).filter(Boolean)),
    ];

    const colorMap = {};
    for (const color of uniqueColors) {
      try {
        colorMap[color] = await getOrCreateColorCode("SANMAR", color);
      } catch (err) {
        console.error(`❌ Color mapping failed: ${color}`);

        colorMap[color] = "#CCCCCC";
      }
    }

    const variantPayload = variants.map((v) => {
      const normalized = normalizeSize(v.size?.name);

      return {
        sku: String(v.sku),

        product_id: product.id,

        // 🔥 PRICING
        price: v.pricing?.piece ?? 0,

        case_price: v.pricing?.case ?? 0,

        retail_price: v.pricing?.msrp ?? null,

        sale_price: v.pricing?.suggested ?? null,

        // 🔥 INVENTORY
        stock: v.stock ?? 0,

        // 🔥 ATTRIBUTES
        size: normalized,

        color: v.color?.name || null,
        color_code: colorMap[v.color?.name] || "#CCCCCC",

        size_id: sizeMap.get(normalized)?.id || null,

        // 🔥 SUPPLIER
        supplier: "SANMAR",

        import_batch_id: batchId,

        // 🔥 EXTRA
        unit_weight: v.extra?.weight ?? null,

        gtin: v.identifiers?.gtin ?? null,

        // 🔥 STATUS
        is_active: v.status !== "Discontinued",

        // 🔥 META
        meta: {
          supplier_status: v.status,
          dozen_price: v.pricing?.dozen ?? 0,
          case_price: v.pricing?.case ?? 0,
          suggested_price: v.pricing?.suggested ?? 0,
          msrp: v.pricing?.msrp ?? 0,
          case_size: v.extra?.case_size || null,
          pms_color: v.color?.code || null,
          gtin: v.identifiers?.gtin || null,
          raw_variant: v,
        },

        // 🔥 TRACKING
        last_supplier_sync_at: new Date(),

        supplier_image_synced: false,

        is_discontinued: v.status === "Discontinued",

        discontinued_at: v.status === "Discontinued" ? new Date() : null,
      };
    });

    await ProductVariant.bulkCreate(variantPayload, {
      updateOnDuplicate: [
        "price",
        "case_price",
        "color_code",
        "stock",
        "retail_price",
        "sale_price",
        "unit_weight",
        "meta",
        "size_id",
        "gtin",
        "supplier_image_synced",
        "is_active",
        "is_discontinued",
        "discontinued_at",
        "last_supplier_sync_at",
      ],
      transaction,
    });

    // Every variant SanMar lists is on sale, including ones it marks Discontinued
    // (those carry is_discontinued for the admin panel). Listed variants that had been
    // removed come back, with restored_at set. (The old restore checked
    // variant.deleted_at, which variants don't have, so it never ran.)
    const listedSkus = variantPayload.map((p) => String(p.sku));

    await restoreListedVariants({ productId: product.id, skus: listedSkus, transaction });

    await ProductVariant.update(
      {
        is_active: true,
      },
      {
        where: {
          product_id: product.id,
          sku: listedSkus,
        },
        transaction,
      },
    );

    // =========================
    // ✅ FETCH VARIANTS
    // =========================

    const createdVariants = await ProductVariant.findAll({
      where: {
        product_id: product.id,
        sku: listedSkus,
      },
      transaction,
    });

    const variantMap = new Map(createdVariants.map((v) => [v.sku, v]));

    // =========================
    // ✅ VARIANT IMAGES
    // =========================

    for (const v of variants) {
      const variant = variantMap.get(String(v.sku));

      if (!variant) continue;

      /*
   |--------------------------------------------------------------------------
   | REMOVE DUPLICATE IMAGES
   |--------------------------------------------------------------------------
   */

      const uniqueImages = [
        ...new Set(
          (v.images || []).filter(
            (img) =>
              img &&
              img.startsWith("http") &&
              !img.includes("ImageNotAvailable"),
          ),
        ),
      ]
        .filter(Boolean)
        .slice(0, 2);

      /*
   |--------------------------------------------------------------------------
   | FETCH EXISTING ROWS
   |--------------------------------------------------------------------------
   */

      const existingRows = await VariantAttachment.findAll({
        where: {
          variant_id: variant.id,
          file_type: "image",
        },
        paranoid: false,
        order: [["id", "ASC"]],
        transaction,
      });

      // ✅ REMOVE TN / BAD / DUPLICATE ROWS
      const cleanedRows = existingRows.filter((row) => {
        const source = row.source_url || row.file_uri || "";

        return (
          !source.includes("TN.") &&
          !source.includes("frontTN") &&
          !source.includes("thumbnail") &&
          !source.includes("ImageNotAvailable")
        );
      });

      /*
   |--------------------------------------------------------------------------
   | UPDATE / CREATE
   |--------------------------------------------------------------------------
   */

      for (const [index, img] of uniqueImages.entries()) {
        try {
          const localImage = downloadedVariantImages[`${v.sku}-${img}`];

          if (!localImage) continue;

          let exists = null;

          // ✅ FIRST IMAGE -> FIRST ROW
          if (index === 0) {
            exists = cleanedRows[0] || null;
          }

          // ✅ SECOND IMAGE -> SECOND ROW
          if (index === 1) {
            exists = cleanedRows[1] || null;
          }

          // ✅ FALLBACK
          if (!exists) {
            exists = await VariantAttachment.findOne({
              where: {
                variant_id: variant.id,
                source_url: img,
              },

              paranoid: false, // 🔥 include deleted rows

              transaction,
            });
          }

          /*
       |--------------------------------------------------------------------------
       | UPDATE
       |--------------------------------------------------------------------------
       */

          if (exists) {
            await VariantAttachment.update(
              {
                file_uri: localImage,

                source_url: img,

                file_name: localImage.split("/").pop(),

                supplier: "SANMAR",

                deleted_at: null, // 🔥 RESTORE ROW

                updated_at: new Date(),
              },
              {
                where: {
                  id: exists.id,
                },

                paranoid: false,

                transaction,

                hooks: false,

                validate: false,
              },
            );
          } else {
            /*
       |--------------------------------------------------------------------------
       | CREATE
       |--------------------------------------------------------------------------
       */
            await VariantAttachment.create(
              {
                variant_id: variant.id,

                file_name: localImage.split("/").pop(),

                file_uri: localImage,

                source_url: img,

                supplier: "SANMAR",

                file_type: "image",

                is_primary: index === 0,
              },
              {
                transaction,
              },
            );
          }
        } catch (imgErr) {
          console.error(`❌ Variant image failed: ${v.sku} ${img}`, imgErr);
        }
      }

      /*
|--------------------------------------------------------------------------
| DELETE EXTRA / TN / DUPLICATE ROWS
|--------------------------------------------------------------------------
*/

      const latestRows = await VariantAttachment.findAll({
        where: {
          variant_id: variant.id,
          file_type: "image",
        },

        paranoid: false,

        order: [["id", "ASC"]],

        transaction,
      });
      const keepIds = latestRows
        .filter((row) => {
          const source = row.source_url || row.file_uri || "";

          return (
            source &&
            !source.includes("TN.") &&
            !source.includes("frontTN") &&
            !source.includes("thumbnail") &&
            !source.includes("ImageNotAvailable")
          );
        })
        .slice(0, uniqueImages.length)
        .map((r) => r.id);

      // ✅ DELETE EVERYTHING ELSE
      await VariantAttachment.destroy({
        where: {
          variant_id: variant.id,

          id: {
            [Op.notIn]: keepIds,
          },
        },

        transaction,
      });
    }

    // =========================
    // ✅ COMMIT
    // =========================

    await transaction.commit();

    return {
      product_id: product.id,
      total_variants: variants.length,
    };
  } catch (err) {
    if (transaction) {
      await transaction.rollback();
    }

    console.error("❌ Sanmar save failed:", err);

    throw err;
  }
};

const buildSanmarImage = (baseUrl, filename) => {
  if (!filename) return null;

  if (filename.startsWith("http")) {
    return filename;
  }

  if (!baseUrl) return null;

  const basePath = baseUrl.substring(0, baseUrl.lastIndexOf("/") + 1);

  return `${basePath}${filename}`;
};

module.exports = {
  syncSanmarBrands,
  getSanmarBrands,
  getSanmarStylesByBrand,
  getSanmarProductsByStyle,
  saveSanmarProductToDB,
};
