const {
  Product,
  ProductVariant,
  ProductAttachment,
  ImportBatch,
} = require("../../models");

const sequelize = require("../../config/central.db");
const { getProductDetails, saveSageProductToDB, isStockReported } = require("./sage.service");

// meta comes back as text from MariaDB.
const parseMeta = (meta) => {
  if (!meta || typeof meta !== "string") return meta || {};
  try {
    return JSON.parse(meta);
  } catch {
    return {};
  }
};

const syncImportedSageProducts = async () => {
  try {
    console.log("🚀 Starting SAGE sync");

    // Inactive (e.g. discontinued) products are checked too, so one SAGE offers again
    // comes back. Deleted products are left alone.
    const importedStyles = await Product.findAll({
      where: {
        supplier: "SAGE",
        sync_locked: false,
      },

      attributes: ["external_style_id"],

      raw: true,
    });
    const styleIds = [
      ...new Set(
        importedStyles.map((p) => p.external_style_id).filter(Boolean),
      ),
    ];

    console.log(`📦 Found ${styleIds.length} imported SAGE products`);

    const batch = await ImportBatch.create({
      source_name: "SAGE_PRODUCT_SYNC",

      status: "processing",

      total_records: styleIds.length,
    });

    let success = 0;
    let skipped = 0;
    let failed = 0;

    for (const prodEId of styleIds) {
      try {
        console.log(`🔄 Syncing product ${prodEId}`);

        const sageProduct = await getProductDetails(prodEId, true);

        if (!sageProduct) {
          console.log(`⚠️ Product ${prodEId} missing from supplier`);

          failed++;

          continue;
        }

        const existingProduct = await Product.findOne({
          where: {
            supplier: "SAGE",

            external_style_id: String(prodEId),
          },

          include: [
            {
              model: ProductVariant,
              as: "variants",
            },
            {
              model: ProductAttachment,
              as: "attachments",
            },
          ],
        });

        if (!existingProduct) {
          console.log(`⚠️ Local product missing ${prodEId}`);

          failed++;

          continue;
        }

        let hasChanges = false;

        const listPrice = sageProduct.prc?.length
          ? Number(sageProduct.prc[0]) || 0
          : 0;

        const netPrice = sageProduct.net?.length
          ? Number(sageProduct.net[0]) || 0
          : 0;

        // ====================
        // PRODUCT CHECK
        // ====================

        // Prices live on the variants and in meta, which are compared below (products
        // have no price columns, so comparing them flagged every product as changed).
        if (
          existingProduct.name !== sageProduct.prName ||
          existingProduct.description !== (sageProduct.description || "") ||
          !!existingProduct.is_discontinued !== !!sageProduct.discontinued
        ) {
          console.log(`📝 Product details or discontinued status changed`);

          hasChanges = true;
        }

        const productMeta = parseMeta(existingProduct.meta);

        // ====================
        // META CHECK (compares actual tier values, not just presence)
        // ====================

        const arraysMatch = (a = [], b = []) => {
          if (a.length !== b.length) return false;
          return a.every((val, i) => String(val) === String(b[i]));
        };

        const incomingPriceTiers = (sageProduct.prc || []).map((v) =>
          v === "" || v == null ? null : Number(v),
        );
        let incomingNetTiers = (sageProduct.net || []).map((v) =>
          v === "" || v == null ? null : Number(v),
        );
        if (
          !incomingNetTiers.length ||
          incomingNetTiers.length !== incomingPriceTiers.length
        ) {
          incomingNetTiers = [...incomingPriceTiers];
        }
        const incomingQtyTiers = (sageProduct.qty || []).map((v) => String(v));

        if (
          !productMeta?.priceTiers ||
          !productMeta?.netTiers ||
          !productMeta?.qtyTiers ||
          !arraysMatch(productMeta.priceTiers, incomingPriceTiers) ||
          !arraysMatch(productMeta.netTiers, incomingNetTiers) ||
          !arraysMatch(productMeta.qtyTiers, incomingQtyTiers)
        ) {
          console.log(`📝 Tier data missing or changed`);

          hasChanges = true;
        }

        // ====================
        // PRODUCT IMAGE CHECK
        // ====================

        const primaryImage = existingProduct.attachments?.[0];

        if (!primaryImage) {
          console.log(`🖼 Missing product image`);

          hasChanges = true;
        }

        // ====================
        // VARIANT CHECK
        // ====================

        const colors =
          sageProduct.colors
            ?.split(",")
            .map((x) => x.trim())
            .filter(Boolean) || [];

        const localColors = existingProduct.variants.map((v) => v.color).sort();

        if (colors.length && colors.slice().sort().join("|") !== localColors.join("|")) {
          console.log(`🎨 Colors changed`);

          hasChanges = true;
        }

        // Stock as saveSageProductToDB stores it: SAGE's number, or untracked when SAGE
        // doesn't report one.
        const stockReported = isStockReported(sageProduct.onHand);
        const expectedStock = stockReported ? Number(sageProduct.onHand) : null;

        for (const variant of existingProduct.variants) {
          if (
            Number(variant.price) !== listPrice ||
            Number(variant.case_price) !== listPrice ||
            Number(variant.retail_price) !== netPrice
          ) {
            console.log(`💲 Variant pricing changed`);

            hasChanges = true;

            break;
          }

          if (
            (variant.stock ?? null) !== expectedStock ||
            !!variant.track_inventory !== stockReported ||
            !!variant.is_discontinued !== !!sageProduct.discontinued
          ) {
            console.log(`📦 Stock or discontinued status changed`);

            hasChanges = true;

            break;
          }
        }

        // ====================
        // SKIP
        // ====================

        if (!hasChanges) {
          skipped++;

          console.log(`⏩ No changes detected for ${prodEId}`);

          continue;
        }

        console.log(`📝 Changes detected. Updating ${prodEId}`);

        await saveSageProductToDB(sageProduct, batch.id);

        success++;

        console.log(`✅ Updated ${prodEId}`);
      } catch (err) {
        failed++;

        console.error(`❌ Failed syncing ${prodEId}`, err.message);

        if (err?.response?.status === 404) {
          await Product.update(
            {
              supplier_missing_since: sequelize.literal(
                "COALESCE(supplier_missing_since, NOW())",
              ),

              is_discontinued: true,

              discontinued_at: new Date(),

              is_active: false,
            },
            {
              where: {
                external_style_id: String(prodEId),

                supplier: "SAGE",
              },
            },
          );
        }
      }
    }

    await batch.update({
      status: "success",

      processed_records: success,
    });

    console.log(`✅ SAGE Sync Complete`);

    console.log(`📊 Updated: ${success}`);

    console.log(`📊 Skipped: ${skipped}`);

    console.log(`📊 Failed: ${failed}`);
  } catch (err) {
    console.error("❌ SAGE Sync Fatal Error", err.message);

    throw err;
  }
};

module.exports = {
  syncImportedSageProducts,
};
