/** @format */

/**
 * Builds a quantity-based pricing table (for the "buy more, pay less" table
 * shown on product pages) from a product/variant's stored `meta` tiers.
 *
 * Admin view (isAdmin = true): returns raw supplier numbers, no markup —
 * matches the rest of the admin panel's "no markup" convention. Includes
 * both `list_price` and `net_price` so admin can compare/audit both.
 *
 * Customer view (isAdmin = false): returns BOTH values with markup applied —
 * `price` (from the list/price tier) for display, and `net` (from the net
 * tier) which is what the frontend should actually use for cart/checkout
 * calculations, per the client's requirement that net pricing drives orders.
 *
 * Safe against SAGE data gaps: rows with no usable net/price value, or a
 * "0" placeholder quantity (SAGE's trailing empty tier), are skipped. If a
 * tier is missing one of the two values, it falls back to the other so
 * neither field is ever silently blank.
 */
const applyMarkup = (base, markupPercent) => {
  const markupAmount = Number(base) * (Number(markupPercent) / 100);
  return Number((Number(base) + markupAmount).toFixed(2));
};

const buildPricingTiers = (meta, markupPercent = 0, isAdmin = false) => {
  if (!meta) return [];

  let parsedMeta = meta;

  if (typeof meta === "string") {
    try {
      parsedMeta = JSON.parse(meta);
    } catch {
      return [];
    }
  }

  const { qtyTiers = [], netTiers = [], priceTiers = [] } = parsedMeta || {};

  if (!Array.isArray(qtyTiers) || !qtyTiers.length) return [];

  return qtyTiers
    .map((qty, i) => {
      const rawList = priceTiers?.[i];
      const rawNet = netTiers?.[i];

      // Fall back each field to the other if one is missing/blank, so a
      // tier is only skipped entirely when BOTH are unusable.
      const listBase =
        rawList !== null && rawList !== undefined && rawList !== ""
          ? rawList
          : rawNet;
      const netBase =
        rawNet !== null && rawNet !== undefined && rawNet !== ""
          ? rawNet
          : rawList;

      const qtyNum = Number(qty);

      const hasUsableValue =
        (listBase !== null && listBase !== undefined && listBase !== "") ||
        (netBase !== null && netBase !== undefined && netBase !== "");

      if (!qty || qty === "0" || !qtyNum || !hasUsableValue) {
        return null;
      }

      if (isAdmin) {
        return {
          quantity: qtyNum,
          list_price: listBase !== null && listBase !== undefined && listBase !== "" ? Number(listBase) : null,
          net_price: netBase !== null && netBase !== undefined && netBase !== "" ? Number(netBase) : null,
        };
      }

      return {
        quantity: qtyNum,
        price:
          listBase !== null && listBase !== undefined && listBase !== ""
            ? applyMarkup(listBase, markupPercent)
            : null,
        net:
          netBase !== null && netBase !== undefined && netBase !== ""
            ? applyMarkup(netBase, markupPercent)
            : null,
      };
    })
    .filter(Boolean);
};

module.exports = { buildPricingTiers };