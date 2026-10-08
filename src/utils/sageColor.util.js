const { ProductVariant } = require("../models");
const { getOrCreateColorCode } = require("../services/Common/colorService");


async function backfillSageColorCodes() {
  const colors =
    await ProductVariant.findAll({
      attributes: ["color"],
      where: {
        supplier: "SAGE",
      },
      group: ["color"],
    });

  console.log(
    `🎨 Found ${colors.length} unique SAGE colors`
  );

  for (const item of colors) {
    await getOrCreateColorCode(
      "SAGE",
      item.color,
       true,
    );
  }

  console.log(
    "✅ SAGE COLOR BACKFILL COMPLETE"
  );
}

module.exports = {
  backfillSageColorCodes,
};