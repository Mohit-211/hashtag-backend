// What a customer approves in an order's approval: its items grouped into lines. The shop makes
// one order item per size of the same design (cartWishlist.service.js, supplier products), so
// items of one product in one colour with the same customization, apart from the size, are one
// line: a T-shirt in S, M and L is one line, the same T-shirt in another colour a second one.
// Items of MANUAL products are never grouped. Pure: approvalStore.js reads the order items and
// passes them in already parsed (see normalizeItem there), so checkApprovalRules.js can test it.

const sortSizes = require("./sortSizes");

const hasText = (value) => typeof value === "string" && value.trim() !== "";
const hasItems = (value) => Array.isArray(value) && value.length > 0;
const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

// Whether an order item's customization_config carries a decoration: a print method or
// location, the customer's graphics, a pre-made product's customization options (logos, text), or
// custom text. Such an order waits for an approval decision when the setting is on
// (approvalStore.js orderNeedsProofDecision).
const isCustomizedConfig = (config) => {
  if (!isObject(config)) return false;
  return (
    hasText(config.print_method) ||
    hasItems(config.locations) ||
    hasItems(config.graphics) ||
    (config.graphic_id !== undefined && config.graphic_id !== null && config.graphic_id !== "") ||
    hasItems(config.customization) ||
    hasText(config.custom_text) ||
    hasText(config.logo_image)
  );
};

// Keys that differ between the order items of one design: the size row and the per-size lines
// with their quantities and prices.
const SIZE_KEYS = ["size", "sizes", "customizations", "quantity"];

// The same JSON for the same value whatever order its keys were written in.
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
};

// The print options as codes in one letter case: "embroidery" and "EMBROIDERY", or "left chest"
// and "LEFT_CHEST", are the same design (lines are saved in capitals since 24 Nov; an older one
// may not be). Text the customer typed is left as it is.
const codeOf = (value) => (typeof value === "string" ? value.trim().toUpperCase().replace(/[\s-]+/g, "_") : value);

const printOptionsAsCodes = (design) => {
  if (!isObject(design)) return design;
  const codes = { ...design };
  if (typeof codes.print_method === "string") codes.print_method = codeOf(codes.print_method);
  if (typeof codes.dtg_style === "string") codes.dtg_style = codeOf(codes.dtg_style);
  if (Array.isArray(codes.locations)) {
    codes.locations = codes.locations.map((entry) =>
      isObject(entry) && typeof entry.location === "string" ? { ...entry, location: codeOf(entry.location) } : entry,
    );
  }
  return codes;
};

const designKey = (item) => {
  const design = isObject(item.config)
    ? printOptionsAsCodes(Object.fromEntries(Object.entries(item.config).filter(([key]) => !SIZE_KEYS.includes(key))))
    : item.config ?? null;
  const color = item.color ? String(item.color).trim().toLowerCase() : null;
  return JSON.stringify([Number(item.product_id) || null, color, canonical(design)]);
};

// "LEFT_CHEST" → "Left chest". A short code is an abbreviation and stays as it is ("DTF").
const humanize = (code) => {
  const text = String(code ?? "").trim();
  if (!text) return null;
  if (!/[\s_]/.test(text) && text.length <= 3) return text.toUpperCase();
  const words = text.replace(/_/g, " ").replace(/\s+/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const unique = (values) => [...new Set(values.filter(Boolean))];

// The decoration: "Screen print (2 colors)", "DTG (Front regular)", or a pre-made product's
// options with the text the customer typed ("Imprint: 1 color", 'Name: "ACME"').
const printMethodsOf = (item) => {
  const config = isObject(item.config) ? item.config : {};

  if (!item.manual) {
    if (!hasText(config.print_method)) return [];
    const extras = [];
    const colors = Number(config.colors);
    if (Number.isInteger(colors) && colors > 0) extras.push(`${colors} color${colors === 1 ? "" : "s"}`);
    if (hasText(config.dtg_style)) extras.push(humanize(config.dtg_style));
    return [`${humanize(config.print_method)}${extras.length ? ` (${extras.join(", ")})` : ""}`];
  }

  const chosen = Array.isArray(config.customization) ? config.customization : [];
  const textOf = (optionId, valueId) => {
    const entry = chosen.find(
      (option) =>
        Number(option?.customization_option_id) === Number(optionId) &&
        Number(option?.customization_option_value_id) === Number(valueId),
    );
    return hasText(entry?.text) ? ` "${entry.text.trim()}"` : "";
  };

  const priced = item.snapshot?.customization?.items;
  if (hasItems(priced)) {
    return unique(
      priced.map((option) =>
        option?.option_name || option?.value_name
          ? `${[option.option_name, option.value_name].filter(Boolean).join(": ")}${textOf(option.customization_option_id, option.customization_option_value_id)}`
          : null,
      ),
    );
  }
  return unique(chosen.map((option) => (hasText(option?.text) ? `"${option.text.trim()}"` : null)));
};

const locationsOf = (config) =>
  unique((isObject(config) && Array.isArray(config.locations) ? config.locations : []).map((spot) => humanize(spot?.location)));

const fileNameOf = (filePath) => String(filePath).split("/").pop() || null;

// The customer's own files: their graphics (supplier products), the logos picked for a pre-made
// product's options, and last the shop's preview of the design. Paths as stored; the views turn
// them into links.
const artworkOf = (group) => {
  const artwork = [];
  const add = (filePath, name) => {
    if (hasText(filePath) && !artwork.some((entry) => entry.path === filePath)) {
      artwork.push({ path: filePath, name: name || fileNameOf(filePath) });
    }
  };

  for (const item of group) {
    const config = isObject(item.config) ? item.config : {};
    for (const graphic of Array.isArray(config.graphics) ? config.graphics : []) {
      add(graphic?.file_path, graphic?.original_name);
    }
    for (const option of Array.isArray(config.customization) ? config.customization : []) {
      add(option?.logo_image, item.artwork_names?.get(Number(option?.graphic_id)));
    }
  }
  for (const item of group) add(item.design_preview, "Design preview");

  return artwork;
};

// Sizes and quantities of a line, in size order, one entry per size.
const sizesOf = (group) => {
  const first = group[0];
  if (first.manual) return [{ size: first.options || first.size || null, quantity: Number(first.quantity) || 0 }];

  const bySize = new Map();
  for (const item of group) {
    const size = item.size || null;
    bySize.set(size, (bySize.get(size) || 0) + (Number(item.quantity) || 0));
  }
  return sortSizes([...bySize].map(([size, quantity]) => ({ size, quantity })));
};

const describe = (group) => {
  const first = group[0];
  const sizes = sizesOf(group);

  return {
    color: first.color || null,
    sizes,
    sizes_text: sizes.map(({ size, quantity }) => (size ? `${size} × ${quantity}` : `Quantity ${quantity}`)).join(", "),
    print_methods: printMethodsOf(first),
    locations: locationsOf(first.config),
    customer_artwork: artworkOf(group),
  };
};

/**
 * The lines of an order, in the order its items were added.
 * @param {Array<{id, product_id, title, color, size, options, quantity, manual, config, snapshot,
 *   design_preview, artwork_names?: Map<number, string>}>} items  normalized order items
 * @returns {Array<{position, product_id, order_item_ids, title, detail}>}
 */
const groupLines = (items) => {
  const groups = new Map();
  for (const item of [...items].sort((first, second) => Number(first.id) - Number(second.id))) {
    const key = item.manual ? `item:${item.id}` : designKey(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  return [...groups.values()].map((group, index) => ({
    position: index + 1,
    product_id: Number(group[0].product_id) || null,
    order_item_ids: group.map((item) => Number(item.id)),
    title: group[0].title,
    detail: describe(group),
  }));
};

module.exports = {
  isCustomizedConfig,
  groupLines,
  humanize,
};
