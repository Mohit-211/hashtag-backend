// The order handling fee (Settings page, Order fees). An order pays the rule's amount once when at
// least one of its products matches; see utils/pricing/handlingFeeRule.js for the rule itself.
// The cart shows it in its summary, POST order stores it in orders.handling_amount, and product
// pages say when a product triggers it.

const { Op } = require("sequelize");
const settings = require("../../config/settings");
const { Product, ProductCategory, ProductCategoryMapping } = require("../../models");
const {
  activeHandlingFeeRule,
  productMatchesRule,
  DEFAULT_HANDLING_FEE_LABEL,
} = require("../../utils/pricing/handlingFeeRule");

const NO_FEE = (label = DEFAULT_HANDLING_FEE_LABEL) => ({ amount: 0, label });

const currentRule = () => activeHandlingFeeRule(settings.get("HANDLING_FEE_RULE"));

// product id -> its category ids.
const categoryIdsByProduct = async (productIds) => {
  const rows = await ProductCategoryMapping.findAll({
    where: { product_id: productIds },
    attributes: ["product_id", "product_category_id"],
    raw: true,
  });

  const map = new Map();
  for (const row of rows) {
    const id = Number(row.product_id);
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(Number(row.product_category_id));
  }
  return map;
};

// The products among these ids that trigger the rule.
const matchingProductIds = async (rule, productIds) => {
  const products = await Product.findAll({
    where: { id: productIds },
    attributes: ["id", "supplier", "supplier_id"],
    // An order keeps its fee even if a product is deleted later.
    paranoid: false,
    raw: true,
  });

  const categories = rule.category_ids.length ? await categoryIdsByProduct(productIds) : new Map();

  return products
    .filter((product) => productMatchesRule(rule, product, categories.get(Number(product.id)) || []))
    .map((product) => Number(product.id));
};

// The fee for a cart or an order made of these products: { amount, label }, amount 0 when none.
const handlingFeeFor = async (productIds) => {
  const rule = currentRule();
  const ids = [...new Set((productIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];

  if (!rule || !ids.length) return NO_FEE(rule?.label);

  const matches = await matchingProductIds(rule, ids);
  return matches.length ? { amount: rule.amount, label: rule.label } : NO_FEE(rule.label);
};

// For a product page: { amount, label } when this product triggers the fee, else null.
const productHandlingFee = async (productId) => {
  const fee = await handlingFeeFor([productId]);
  return fee.amount > 0 ? fee : null;
};

const SUPPLIER_LABELS = {
  SS: "S&S Activewear (all products)",
  SANMAR: "SanMar (all products)",
  OTTOCAP: "OTTO Cap (all products)",
  MANUAL: "Products added by hand (all)",
  SAGE: "SAGE (every SAGE supplier)",
};

// What the Settings page lets an admin pick: every category, and every supplier, with each SAGE
// supplier (SAGE has hundreds, identified by number) on its own.
const handlingFeeOptions = async () => {
  const categories = await ProductCategory.findAll({
    attributes: ["id", "title", "supplier"],
    order: [["title", "ASC"], ["supplier", "ASC"], ["id", "ASC"]],
    raw: true,
  });

  const sageSuppliers = await Product.findAll({
    attributes: [
      "supplier_id",
      [Product.sequelize.fn("MAX", Product.sequelize.col("supplier_name")), "supplier_name"],
    ],
    where: { supplier: "SAGE", supplier_id: { [Op.ne]: null } },
    group: ["supplier_id"],
    raw: true,
  });

  const sage = sageSuppliers
    .filter((row) => /^\d{1,12}$/.test(String(row.supplier_id)))
    .map((row) => ({
      value: `SAGE:${row.supplier_id}`,
      label: `SAGE · ${row.supplier_name || "Unnamed supplier"} (${row.supplier_id})`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    categories: categories.map((category) => ({
      id: Number(category.id),
      title: category.title,
      supplier: category.supplier || null,
    })),
    suppliers: [
      ...Object.entries(SUPPLIER_LABELS).map(([value, label]) => ({ value, label })),
      ...sage,
    ],
  };
};

module.exports = {
  handlingFeeFor,
  productHandlingFee,
  handlingFeeOptions,
};
