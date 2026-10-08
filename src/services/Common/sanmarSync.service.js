const { Product, ImportBatch, Brand } = require("../../models");

const { Op } = require("sequelize");

const sequelize = require("../../config/central.db");

const {
  getSanmarProductsByStyle,
  saveSanmarProductToDB,
} = require("./sanmar.service");

const syncImportedSanmarProducts = async () => {
  try {
    console.log("🚀 Starting SANMAR sync");

    // =========================
    // ✅ FETCH IMPORTED STYLES
    // =========================

    const importedStyles = await Product.findAll({
      where: {
        supplier: "SANMAR",
        sync_locked: false,
        is_active: true,
      },

      attributes: ["external_style_id", "brand_id"],

      raw: true,
    });

    // ✅ REMOVE EMPTY STYLE IDS
    const styleItems = importedStyles.filter((p) => p.external_style_id);

    console.log(`📦 Total SANMAR styles: ${styleItems.length}`);

    // =========================
    // ✅ CREATE IMPORT BATCH
    // =========================

    const batch = await ImportBatch.create({
      source_name: "SANMAR_PRODUCT_SYNC",

      status: "processing",

      total_records: styleItems.length,
    });

    let success = 0;

    let failed = 0;

    // =========================
    // ✅ LOOP STYLES
    // =========================

    for (const item of styleItems) {
      const styleId = item.external_style_id;

      try {
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log(`🔄 Syncing SANMAR style ${styleId}`);

        // =========================
        // ✅ FETCH BRAND
        // =========================

        const brand = await Brand.findByPk(item.brand_id);

        if (!brand) {
          console.log(`⚠️ Brand missing for style ${styleId}`);

          failed++;

          continue;
        }

        console.log(`🏷 Brand: ${brand.name}`);

        // =========================
        // ✅ FETCH PRODUCT
        // =========================

        const data = await getSanmarProductsByStyle(brand.name, styleId);

        if (data) {
          // =========================
          // ✅ SAVE PRODUCT
          // =========================

          await saveSanmarProductToDB(data, batch.id);

          success++;

          console.log(`✅ Synced SANMAR style ${styleId}`);
        } else {
          failed++;

          console.log(`⚠️ No data returned for ${styleId}`);
        }
      } catch (err) {
        failed++;

        console.error(`❌ Failed syncing SANMAR style ${styleId}`, err.message);

        // =========================
        // ✅ STYLE REMOVED FROM SUPPLIER
        // =========================

        if (err?.response?.status === 404) {
          console.log(`⚠️ SANMAR style ${styleId} missing from supplier`);

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
                external_style_id: styleId,
                sync_locked: false,
                supplier: "SANMAR",
              },
            },
          );
        }
      }
    }

    // =========================
    // ✅ UPDATE BATCH
    // =========================

    await batch.update({
      status: success === styleItems.length ? "success" : "partial_success",

      processed_records: success,
    });

    console.log(
      `✅ SANMAR Sync Complete ${success}/${styleItems.length} | Failed: ${failed}`,
    );
  } catch (err) {
    console.error("❌ SANMAR Sync Fatal Error", err.message);

    throw err;
  }
};

module.exports = {
  syncImportedSanmarProducts,
};
