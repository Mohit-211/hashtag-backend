const { parseJson } = require("../orderFormat");

// The graphic fee (decided 4 Nov 2026): $35 for a new graphic on clothing when
// fewer than 12 pieces in the order carry it, whatever the print type. Charged once per
// graphic per order, on the first cart line that has it. A graphic stops being new once it has
// been in a paid order.
const GRAPHIC_FEE = 35;
const GRAPHIC_FEE_WAIVED_FROM = 12;

// Clothing's print types. Promo products and pre-made products have no graphic fee.
const CLOTHING_PRINT_METHODS = ["EMBROIDERY", "DTF", "SCREEN_PRINT", "DTG"];

// The graphics on a cart or order line: one for the whole line, one per location, or one per
// option on pre-made products.
const graphicIdsOf = (customization) => {
  const listOf = (value) => (Array.isArray(value) ? value : []);

  const ids = [
    customization?.graphic_id,
    ...listOf(customization?.locations).map((location) => location?.graphic_id),
    ...listOf(customization?.customization).map((option) => option?.graphic_id),
  ];

  return [...new Set(ids.filter((id) => id !== undefined && id !== null && id !== "").map(Number))];
};

const isClothingLine = (customization, pricingSnapshot) =>
  CLOTHING_PRINT_METHODS.includes(customization?.print_method) &&
  pricingSnapshot?.supplier !== "SAGE";

// The fee on each cart line, as a Map of line id to amount. Graphics that look the same count
// as one. `graphics` is a Map of graphic id to saved graphic.
const assignGraphicFees = (lines, graphics) => {
  const designs = new Map();

  const byId = [...lines].sort((first, second) => Number(first.id) - Number(second.id));

  for (const line of byId) {
    const customization = parseJson(line.customization_config);

    if (!isClothingLine(customization, parseJson(line.pricing_snapshot))) continue;

    const lineDesigns = new Map();

    for (const id of graphicIdsOf(customization)) {
      const graphic = graphics.get(id);

      if (graphic) lineDesigns.set(Number(graphic.same_as_id || graphic.id), graphic);
    }

    for (const [design, graphic] of lineDesigns) {
      const seen = designs.get(design);

      if (seen) {
        seen.pieces += Number(line.quantity);
      } else {
        designs.set(design, {
          pieces: Number(line.quantity),
          firstLineId: Number(line.id),
          isNew: !graphic.first_order_id,
        });
      }
    }
  }

  const fees = new Map();

  for (const { pieces, firstLineId, isNew } of designs.values()) {
    if (isNew && pieces < GRAPHIC_FEE_WAIVED_FROM) {
      fees.set(firstLineId, (fees.get(firstLineId) || 0) + GRAPHIC_FEE);
    }
  }

  return fees;
};

module.exports = {
  GRAPHIC_FEE,
  GRAPHIC_FEE_WAIVED_FROM,
  graphicIdsOf,
  assignGraphicFees,
};
