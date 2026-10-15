// Supplier cost and markup must never reach shoppers. Every response that isn't for a
// signed-in admin goes through hideSupplierPricing, which removes the fields below
// wherever they appear (product and variant objects, `meta`, cart and order snapshots).
// Shoppers get selling prices only: `price`, `total_price`, `price_tiers`, etc.
const config = require("../config/config");

const HIDDEN_KEYS = new Set([
  // cost and markup on products, variants, cart lines
  "original_price",
  "case_price",
  "base_price",
  "markup_percent",
  "markup_amount",
  "used_case_price",
  "retail_price",
  "sale_price",
  "map_price",
  "msrp",
  "suggested_price",
  "dozen_price",
  "cost_price",
  "supplier_last_hash",
  // pricing snapshots and order breakdowns
  "actual_price",
  "actual_product_price",
  "supplier_markup",
  "supplier_price",
  "list_price",
  "net_price",
  // supplier tiers and raw supplier payloads kept in meta
  "netTiers",
  "priceTiers",
  "minPrice",
  "maxPrice",
  "pricing_tiers",
  "pricing_tiers_customer",
  "raw_variant",
  "raw_product",
  "supplier_raw",
  "raw_json",
]);

// OttoCap price breaks in meta: price_1, price_144, ...
const isHiddenKey = (key) => HIDDEN_KEYS.has(key) || /^price_\d+$/.test(key);

const strip = (value) => {
  if (Array.isArray(value)) return value.map(strip);
  if (!value || typeof value !== "object") return value;
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  if (typeof value.toJSON === "function") return strip(value.toJSON());

  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (isHiddenKey(key)) continue;
    // MariaDB returns JSON columns as text; keep the same type after cleaning.
    if (key === "meta" && typeof child === "string") {
      try {
        out[key] = JSON.stringify(strip(JSON.parse(child)));
      } catch {
        out[key] = child;
      }
      continue;
    }
    out[key] = strip(child);
  }
  return out;
};

// Express middleware: cleans res.json bodies, except for admin requests and while
// EXPOSE_SUPPLIER_COST=true (only for the switch-over, until the shop no longer reads them).
const hideSupplierPricing = (req, res, next) => {
  const json = res.json.bind(res);
  res.json = (body) => {
    if (req.admin || config.exposeSupplierCost) return json(body);
    return json(strip(body));
  };
  next();
};

module.exports = { hideSupplierPricing, strip, isHiddenKey };
