// Quantity pricing rows in the ProductVariant.meta shape, checked the same way wherever they're
// saved: manual product variants (resolveVariantPricing) and pricing templates. `where` starts
// every message, e.g. `Variant "MUG-1"` or `Pricing`, so an admin can find the row.
const httpStatus = require("http-status");
const ApiError = require("../ApiError");

const fail = (message) => {
  throw new ApiError(httpStatus.BAD_REQUEST, message);
};

// Fixed quantities ({ quantity, price }): each quantity a whole number above 0 and listed once,
// each price above 0. Returns the rows as numbers, smallest quantity first.
const parseQuantityPricing = (rows, where) => {
  const seenQuantities = new Set();

  const parsed = rows.map((item, index) => {
    const quantity = Number(item?.quantity);
    const price = Number(item?.price);

    if (!Number.isInteger(quantity) || quantity <= 0) {
      fail(`${where}, Quantity ${index + 1}: quantity must be a positive whole number`);
    }

    if (!Number.isFinite(price) || price <= 0) {
      fail(`${where}, Quantity ${index + 1}: price must be more than 0`);
    }

    if (seenQuantities.has(quantity)) {
      fail(`${where}: quantity ${quantity} is duplicated`);
    }

    seenQuantities.add(quantity);

    return { quantity, price };
  });

  return parsed.sort((a, b) => a.quantity - b.quantity);
};

// Variable ranges ({ min_qty, max_qty, price }), worded like the admin panel's own check:
// "From" a whole number above 0, "To" blank (null) on the last tier only and otherwise a whole
// number above "From", each tier starting after the previous one ends (gaps are fine, overlaps
// aren't), each price above 0. Returns the rows as numbers, in the order given.
const parseBulkPricing = (rows, where) =>
  rows.map((item, index, all) => {
    const tier = `${where}, Tier ${index + 1}`;
    const isLast = index === all.length - 1;
    const minQty = Number(item?.min_qty);
    const rawMax = item?.max_qty;
    const maxQty = rawMax === null || rawMax === undefined || rawMax === "" ? null : Number(rawMax);
    const price = Number(item?.price);

    if (!Number.isInteger(minQty) || minQty <= 0) {
      fail(`${tier}: "From" must be a whole number more than 0`);
    }

    if (!Number.isFinite(price) || price <= 0) {
      fail(`${tier}: price must be more than 0`);
    }

    if (maxQty === null && !isLast) {
      fail(`${tier}: only the last tier can leave "To" blank`);
    }

    if (maxQty !== null && (!Number.isInteger(maxQty) || maxQty <= minQty)) {
      fail(`${tier}: "To" must be a whole number more than "From"`);
    }

    if (index > 0) {
      // Every tier but the last has a "To", checked above.
      const previousMax = Number(all[index - 1].max_qty);

      if (minQty <= previousMax) {
        fail(`${tier}: "From" must be more than Tier ${index}'s "To" (${previousMax})`);
      }
    }

    return { min_qty: minQty, max_qty: maxQty, price };
  });

module.exports = { parseQuantityPricing, parseBulkPricing };
