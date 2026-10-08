const {
  Product,
  ProductVariant,
  ProductAttachment,
  ImportBatch,
  OttocapCatalog,
  Ottocap,
} = require("../../models");

const { saveOttoProductToDB } = require("./ottoCap.service");

const syncImportedOttoProducts = async () => {
  try {
    console.log("🚀 Starting OTTOCAP sync");

    const importedStyles = await Product.findAll({
      where: {
        supplier: "OTTOCAP",
          sync_locked: false,
    is_active: true,
      },

      attributes: ["external_style_id"],

      raw: true,
    });

    const styleIds = [
      ...new Set(
        importedStyles
          .map((p) => p.external_style_id)
          .filter(Boolean),
      ),
    ];

    console.log(
      `📦 Found ${styleIds.length} imported OTTOCAP styles`,
    );

    const batch = await ImportBatch.create({
      source_name: "OTTOCAP_PRODUCT_SYNC",

      status: "processing",

      total_records: styleIds.length,
    });

    let success = 0;
    let skipped = 0;
    let failed = 0;

    for (const styleId of styleIds) {
      try {
        console.log(
          "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        );

        console.log(
          `🔄 Checking style ${styleId}`,
        );

        const parent =
          await OttocapCatalog.findOne({
            where: {
              sku_no: styleId,
            },

            raw: true,
          });

        if (!parent) {
          console.log(
            `⚠️ Style ${styleId} missing from supplier catalog`,
          );

          failed++;

          continue;
        }

        const product =
          await Product.findOne({
            where: {
              supplier: "OTTOCAP",

              external_style_id: styleId,
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

        if (!product) {
          console.log(
            `⚠️ Product ${styleId} not found locally`,
          );

          failed++;

          continue;
        }

        const variants =
          await OttocapCatalog.findAll({
            where: {
              sku_parent: styleId,
            },

            raw: true,
          });

        const inventoryRows =
          await Ottocap.findAll({
            where: {
              sku_parent: styleId,
            },

            raw: true,
          });

        const inventoryMap = new Map(
          inventoryRows.map((x) => [
            x.sku_no,
            x,
          ]),
        );

        let hasChanges = false;

        // =====================================
        // PRODUCT CHECK
        // =====================================

        const latestPrice =
          Number(parent.price_1 || 0) ||
          Number(
            variants?.[0]?.price_1 || 0,
          );

        if (
          product.name !== parent.name ||
          product.description !==
            (parent.description ||
              parent.plain_description) ||
          Number(product.price) !==
            latestPrice
        ) {
          console.log(
            `📝 Product data changed for ${styleId}`,
          );

          hasChanges = true;
        }

        // =====================================
        // PRODUCT IMAGES CHECK
        // =====================================

        const supplierImages = [
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
        ]
          .filter(Boolean)
          .sort();

        const dbImages = (
          product.attachments || []
        )
          .map((x) => x.source_url)
          .filter(Boolean)
          .sort();

        if (
          JSON.stringify(
            supplierImages,
          ) !==
          JSON.stringify(dbImages)
        ) {
          console.log(
            `🖼 Images changed for ${styleId}`,
          );

          hasChanges = true;
        }

        // =====================================
        // VARIANT CHECK
        // =====================================

        const variantMap = new Map(
          product.variants.map((x) => [
            x.sku,
            x,
          ]),
        );

        for (const variant of variants) {
          const existingVariant =
            variantMap.get(
              variant.sku_no,
            );

          if (!existingVariant) {
            console.log(
              `➕ New variant detected ${variant.sku_no}`,
            );

            hasChanges = true;

            break;
          }

          const inventory =
            inventoryMap.get(
              variant.sku_no,
            );

          const inventoryQty =
            Number(
              inventory?.instock || 0,
            );

          if (
            Number(
              existingVariant.price,
            ) !==
              Number(
                variant.price_1 || 0,
              ) ||
            Number(
              existingVariant.case_price,
            ) !==
              Number(
                variant.price_144 || 0,
              ) ||
            Number(
              existingVariant.retail_price,
            ) !==
              Number(
                variant.price_288 || 0,
              ) ||
            Number(
              existingVariant.sale_price,
            ) !==
              Number(
                variant.price_576 || 0,
              ) ||
            Number(
              existingVariant.stock,
            ) !== inventoryQty
          ) {
            console.log(
              `💲 Variant changed ${variant.sku_no}`,
            );

            hasChanges = true;

            break;
          }
        }

        // =====================================
        // NO CHANGES
        // =====================================

        if (!hasChanges) {
          skipped++;

          console.log(
            `⏩ No changes detected for ${styleId}`,
          );

          continue;
        }

        // =====================================
        // UPDATE PRODUCT
        // =====================================

        console.log(
          `📝 Changes detected. Updating ${styleId}`,
        );

        await saveOttoProductToDB(
          styleId,
          batch.id,
        );

        success++;

        console.log(
          `✅ Successfully updated ${styleId}`,
        );
      } catch (err) {
        failed++;

        console.error(
          `❌ Failed syncing ${styleId}`,
          err.message,
        );
      }
    }

    await batch.update({
      status: "success",

      processed_records: success,
    });

    console.log(
      `✅ OTTOCAP Sync Complete`,
    );

    console.log(
      `📊 Updated: ${success}`,
    );

    console.log(
      `📊 Skipped: ${skipped}`,
    );

    console.log(
      `📊 Failed: ${failed}`,
    );
  } catch (err) {
    console.error(
      "❌ OTTOCAP Sync Fatal Error",
      err.message,
    );

    throw err;
  }
};

module.exports = {
  syncImportedOttoProducts,
};