const { Product, ImportBatch } = require("../../models");
const { Op } = require("sequelize");

const { getSSProductByStyle, saveSSProductToDB } = require("./product.service");
const sequelize = require("../../config/central.db");

const syncImportedSSProducts = async () => {
  try {
    console.log("🚀 Starting SS sync");

    const importedStyles = await Product.findAll({
      where: {
        supplier: "SS",
        sync_locked: false,
        is_active: true,
      },
      attributes: ["external_style_id"],
      raw: true,
    });

    const styleIds = [
      ...new Set(
        importedStyles.map((p) => p.external_style_id).filter(Boolean),
      ),
    ];

    const batch = await ImportBatch.create({
      source_name: "SS_PRODUCT_SYNC",
      status: "processing",
      total_records: styleIds.length,
    });

    let success = 0;

    for (const styleId of styleIds) {
      try {
        console.log(`🔄 Syncing style ${styleId}`);

        const data = await getSSProductByStyle(styleId);

        if (data) {
          await saveSSProductToDB(data, batch.id);

          success++;
        }
      } catch (err) {
        console.error(`❌ Failed syncing style ${styleId}`, err.message);

        // 🔥 STYLE REMOVED FROM SUPPLIER
        if (err?.response?.status === 404) {
          console.log(`⚠️ Style ${styleId} missing from supplier`);

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
                supplier: "SS",
              },
            },
          );
        }
      }
    }

    // 🔥 AUTO DISCONTINUE AFTER 30 DAYS
    // await Product.update(
    //   {
    //     is_discontinued: true,
    //     discontinued_at: new Date(),
    //     is_active: false,
    //   },
    //   {
    //     where: {
    //       supplier: "SS",
    //       is_discontinued: false,
    //       supplier_missing_since: {
    //         [Op.not]: null,
    //         [Op.lte]: new Date(
    //           Date.now() - 30 * 24 * 60 * 60 * 1000
    //         ),
    //       },
    //     },
    //   }
    // );

    await batch.update({
      status: "success",
      processed_records: success,
    });

    console.log(`✅ SS Sync Complete ${success}/${styleIds.length}`);
  } catch (err) {
    console.error("❌ SS Sync Fatal Error", err.message);

    throw err;
  }
};

module.exports = {
  syncImportedSSProducts,
};
