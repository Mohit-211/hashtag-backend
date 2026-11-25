/** @format */

// Quantity-based customization values (pricing_type QUANTITY_BASED) are sold only at their listed
// quantities (audit F03, decided 24 Nov 2026), as on the product page: each pricing row is the
// price of the option for exactly that many pieces. Before this, the server charged the highest
// row at or below the quantity, so 49 pieces paid the 25-piece price.
const { CustomizationOptionValue, CustomizationOptionValuePricing } = require("../../models");
const { parseJson } = require("../../utils/orderFormat");

// The value's price row for exactly this quantity: its active one, the oldest if two were ever
// saved for the same quantity.
const quantityRowFor = (valueId, quantity, transaction) =>
  CustomizationOptionValuePricing.findOne({
    where: { customization_option_value_id: valueId, is_active: true, quantity },
    order: [["id", "ASC"]],
    transaction,
  });

// The quantities the value is sold in, smallest first.
const listedQuantities = async (valueId, transaction) => {
  const rows = await CustomizationOptionValuePricing.findAll({
    attributes: ["quantity"],
    where: { customization_option_value_id: valueId, is_active: true },
    order: [["quantity", "ASC"]],
    transaction,
  });

  return [...new Set(rows.map((row) => Number(row.quantity)).filter((quantity) => quantity > 0))];
};

// "A", "A and B", "A, B and C" (joiner "and"), or "25 or 50" (joiner "or").
const listOf = (items, joiner) =>
  items.length > 1 ? `${items.slice(0, -1).join(", ")} ${joiner} ${items[items.length - 1]}` : String(items[0]);

// POST product/cart and the cart's quantity changes (400). It names the option's value, since a
// line can have several options: 'The "Velcro" option is sold in 25 or 50 pieces. Please choose
// one of those quantities.'
const quantityNotListed = (valueName, quantities) => {
  if (!quantities.length) return `The "${valueName}" option has no quantities for sale right now.`;

  return quantities.length > 1
    ? `The "${valueName}" option is sold in ${listOf(quantities, "or")} pieces. Please choose one of those quantities.`
    : `The "${valueName}" option is sold in ${quantities[0]} ${quantities[0] === 1 ? "piece" : "pieces"}. Please choose that quantity.`;
};

// POST order (400), naming the products of the lines whose quantity-based option isn't sold at
// their quantity.
const orderLinesQuantityNotSold = (names) =>
  names.length > 1
    ? `Options on ${listOf(names, "and")} aren't sold in the quantities in your cart. Please change the quantities or remove them.`
    : `An option on ${names[0]} isn't sold in the quantity in your cart. Please change the quantity or remove it.`;

// The pre-made (MANUAL) cart lines with a quantity-based option that isn't sold at the line's
// quantity: added before this rule, or the option's quantities changed since. POST order refuses
// them, so none is ordered at another quantity's price.
const linesWithQuantityNotSold = async (cartItems, transaction) => {
  const refused = [];

  for (const item of cartItems) {
    const customization = parseJson(item.customization_config);
    if (customization?.type !== "MANUAL") continue;

    const chosen = Array.isArray(customization.customization) ? customization.customization : [];
    const valueIds = [...new Set(chosen.map((entry) => Number(entry?.customization_option_value_id)).filter(Boolean))];
    if (!valueIds.length) continue;

    // A value deleted since still counts: the cart keeps such a line priced (allowInactiveCustomization).
    const values = await CustomizationOptionValue.findAll({
      attributes: ["id"],
      where: { id: valueIds, pricing_type: "QUANTITY_BASED" },
      paranoid: false,
      transaction,
    });

    for (const value of values) {
      if (!(await quantityRowFor(value.id, Number(item.quantity), transaction))) {
        refused.push(item);
        break;
      }
    }
  }

  return refused;
};

module.exports = {
  quantityRowFor,
  listedQuantities,
  quantityNotListed,
  orderLinesQuantityNotSold,
  linesWithQuantityNotSold,
};
