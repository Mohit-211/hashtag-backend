const { ProductVariant } = require("../models");
const { getOrCreateColorCode } = require("../services/Common/colorService");

async function backfillOttoCapColorCodes() {
  const variants = await ProductVariant.findAll({
    where: {
      supplier: "OTTOCAP",
    },
  });

  console.log(
    `🎨 Found ${variants.length} OTTOCAP variants`
  );

  for (const variant of variants) {
    try {
      const colorCode =
        await getOrCreateColorCode(
          "OTTOCAP",
          variant.color,
        );

      await variant.update({
        color_code: colorCode,
      });

      console.log(
        `✅ ${variant.color} -> ${colorCode}`
      );
    } catch (err) {
      console.error(
        `❌ Failed: ${variant.color}`,
        err.message
      );
    }
  }

  console.log(
    "🎉 OTTOCAP COLOR BACKFILL COMPLETE"
  );
}
module.exports = {
  backfillOttoCapColorCodes,
};

