// The order handling fee rule as the Settings page saves it (HANDLING_FEE_RULE), checked and
// put in one shape. Pure: settings.js calls it for every saved value, so it can't load models.
//
//   { "amount": 35, "label": "Handling fee", "category_ids": [1396], "suppliers": ["SAGE:51093"] }
//
// An order pays `amount` once when at least one of its products is in one of `category_ids`
// (or that list is empty) and from one of `suppliers` (or that list is empty). Both lists
// empty, or an amount of 0, means no fee. See handlingFee.service.js.

const SUPPLIER = /^(SS|SANMAR|OTTOCAP|MANUAL|SAGE)(:\d{1,12})?$/;
const MAX_ENTRIES = 500;
const DEFAULT_LABEL = "Handling fee";

const unique = (list) => [...new Set(list)];

// Returns { value } with the clean rule, or { error } with a sentence for the admin.
const normalizeHandlingFeeRule = (raw) => {
  let rule = raw;

  if (typeof raw === "string") {
    try {
      rule = JSON.parse(raw);
    } catch {
      return { error: "must be the fee's settings as JSON" };
    }
  }

  if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
    return { error: "must be the fee's settings as JSON" };
  }

  const amount = Number(rule.amount);
  if (rule.amount === "" || rule.amount === null || !Number.isFinite(amount) || amount < 0 || amount > 10000) {
    return { error: "needs an amount between $0 and $10,000" };
  }

  const label = rule.label === undefined || rule.label === null ? DEFAULT_LABEL : String(rule.label).trim();
  if (!label || label.length > 60) {
    return { error: "needs a name of 1 to 60 characters, e.g. Handling fee" };
  }

  const categoryIds = rule.category_ids ?? [];
  if (!Array.isArray(categoryIds) || categoryIds.length > MAX_ENTRIES) {
    return { error: "category_ids must be a list of category numbers" };
  }
  const cleanCategories = categoryIds.map(Number);
  if (cleanCategories.some((id) => !Number.isInteger(id) || id <= 0)) {
    return { error: "category_ids must be a list of category numbers" };
  }

  const suppliers = rule.suppliers ?? [];
  if (!Array.isArray(suppliers) || suppliers.length > MAX_ENTRIES) {
    return { error: "suppliers must be a list such as SAGE:51093 or SS" };
  }
  const cleanSuppliers = suppliers.map((entry) => String(entry).trim().toUpperCase());
  const badSupplier = cleanSuppliers.find(
    (entry) => !SUPPLIER.test(entry) || (entry.includes(":") && !entry.startsWith("SAGE:")),
  );
  if (badSupplier !== undefined) {
    return { error: `doesn't know the supplier "${badSupplier}"; use SS, SANMAR, OTTOCAP, MANUAL, SAGE or SAGE:<number>` };
  }

  return {
    value: {
      amount: Math.round(amount * 100) / 100,
      label,
      category_ids: unique(cleanCategories).sort((a, b) => a - b),
      suppliers: unique(cleanSuppliers).sort(),
    },
  };
};

// The rule when it can charge anything, else null.
const activeHandlingFeeRule = (rule) => {
  if (!rule || !(Number(rule.amount) > 0)) return null;
  if (!rule.category_ids?.length && !rule.suppliers?.length) return null;
  return rule;
};

// Whether one product (supplier, supplier_id and its category ids) triggers the rule.
const productMatchesRule = (rule, product, categoryIds = []) => {
  const supplier = String(product?.supplier || "").toUpperCase();
  const sageNumber = String(product?.supplier_id ?? "");

  const supplierOk =
    !rule.suppliers.length ||
    rule.suppliers.some((entry) => {
      const [code, number] = entry.split(":");
      return code === supplier && (number === undefined || number === sageNumber);
    });

  const categoryOk =
    !rule.category_ids.length || categoryIds.some((id) => rule.category_ids.includes(Number(id)));

  return supplierOk && categoryOk;
};

module.exports = {
  normalizeHandlingFeeRule,
  activeHandlingFeeRule,
  productMatchesRule,
  DEFAULT_HANDLING_FEE_LABEL: DEFAULT_LABEL,
};
