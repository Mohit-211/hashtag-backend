const { ProductVariant } = require("../models");
const { getOrCreateColorCode } = require("../services/Common/colorService");


const backfillSanmarColorCodes = async () => {
  try {
    console.log(
      "🚀 STARTING SANMAR COLOR BACKFILL"
    );

    const variants =
      await ProductVariant.findAll({
        where: {
          supplier: "SANMAR",
        },

        attributes: [
          "id",
          "color",
          "color_code",
        ],

        raw: true,
      });

    console.log(
      `📦 Found ${variants.length} variants`
    );

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    const uniqueColors = [
      ...new Set(
        variants
          .map((x) => x.color)
          .filter(Boolean)
      ),
    ];

    console.log(
      `🎨 Found ${uniqueColors.length} unique colors`
    );

    for (const color of uniqueColors) {
      try {
        const code =
          await getOrCreateColorCode(
            "SANMAR",
            color
          );

        console.log(
          `🎨 ${color} -> ${code}`
        );

        updated++;
      } catch (err) {
        failed++;

        console.error(
          `❌ Failed color ${color}`,
          err.message
        );
      }
    }

    console.log(
      `✅ Completed`
    );

    console.log(
      `📊 Updated: ${updated}`
    );

    console.log(
      `📊 Failed: ${failed}`
    );
  } catch (err) {
    console.error(
      "❌ Backfill failed",
      err
    );
  }
};

module.exports = {
  backfillSanmarColorCodes,
};