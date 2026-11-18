// Products from a CSV file (admin panel: Products, Import CSV). One row per option (variant);
// rows with the same product name make one product. The file is checked as a whole: the preview
// lists every problem by row, and the import creates everything in one transaction, or nothing.
// What gets saved is what Add Product saves: a MANUAL product, its options as size rows and
// meta.options, and variants priced like resolveVariantPricing prices them.

const httpStatus = require("http-status");
const { Op, UniqueConstraintError } = require("sequelize");
const sequelize = require("../../config/central.db");
const ApiError = require("../../utils/ApiError");
const { decode, parseCsv, toCsv } = require("../../utils/csv");
const { parseJson } = require("../../utils/orderFormat");
const {
  Product,
  ProductVariant,
  ProductCategory,
  ProductCategoryMapping,
  ParentCategory,
  ParentCategoryMapping,
  Brand,
  Size,
  PricingTemplate,
  ImportBatch,
} = require("../../models");
const { createSkuGenerator, resolveVariantOptions, resolveVariantPricing } = require("./product.service");

const MAX_ROWS = 1000;
const MAX_FILE_MB = 2;
const MAX_OPTIONS = 3;
const MAX_WEIGHT_LB = 150; // as setAdminWeight
const NAME_MAX = 200; // products.name and product_categories.title
const OPTION_VALUE_MAX = 50; // sizes.name
const SKU_MAX = 100; // product_variants.sku
const SKU_MADE_ON_IMPORT = "(made on import)";

// The columns, in the example's order. `aliases` are other headers read as the same column;
// headers compare without case, spaces or punctuation.
const option = (n) => [
  {
    key: `option${n}_name`,
    header: `Option ${n} name`,
    aliases: n === 1 ? ["Option name"] : [],
    level: "product",
    help: `Optional. What the customer picks, e.g. ${["Size", "Color", "Paper"][n - 1]}. The same on every row of the product.`,
  },
  {
    key: `option${n}_type`,
    header: `Option ${n} type`,
    aliases: [`Option ${n} style`, `Option ${n} display style`],
    level: "product",
    help:
      "Optional. Drop-down, Color, Buttons, Size or Checkboxes. Left blank: Color for an option called " +
      "Color or Colour, Size for one called Size, otherwise Drop-down.",
  },
  {
    key: `option${n}_value`,
    header: `Option ${n} value`,
    aliases: n === 1 ? ["Option value"] : [],
    level: "variant",
    help: `This row's choice for Option ${n}, e.g. ${["Large", "Black", "Matte"][n - 1]}. Needed when the product has Option ${n}. Up to ${OPTION_VALUE_MAX} characters.`,
  },
];

const COLUMNS = [
  {
    key: "name",
    header: "Product name",
    aliases: ["Name", "Product", "Title", "Product title"],
    level: "product",
    required: true,
    help: `Rows with the same product name make one product, one row per option. Up to ${NAME_MAX} characters.`,
  },
  { key: "description", header: "Description", aliases: ["Product description"], level: "product", help: "Optional." },
  {
    key: "brand",
    header: "Brand",
    aliases: ["Brand name"],
    level: "product",
    help: "Optional. The name of a brand that is published in the admin panel.",
  },
  {
    key: "supplier_category",
    header: "Supplier category",
    aliases: ["Supplier categories", "Product category", "Product categories"],
    level: "product",
    help:
      "Optional. The product's own category, shown as Supplier Categories on the product form. When no Manual " +
      "category has this name, a new one is made. Separate several with |.",
  },
  {
    key: "sub_category",
    header: "Parent category",
    // Files made before 18 Nov 2026 say Sub-category; they still work.
    aliases: ["Parent categories", "Sub-category", "Sub-categories", "Subcategory"],
    level: "product",
    help:
      "Optional. An existing parent category. The supplier category is placed in it, so the product can " +
      "show under it on the website. With no supplier category, a Manual one with the " +
      "parent category's name is used. Separate several with |.",
  },
  ...option(1),
  ...option(2),
  ...option(3),
  {
    key: "color_code",
    header: "Color code",
    aliases: ["Colour code", "Hex", "Color hex"],
    level: "variant",
    help: "Optional. The colour of the row's Color option value, as #RRGGBB, e.g. #1A2B3C.",
  },
  {
    key: "sku",
    header: "SKU",
    aliases: ["Variant SKU"],
    level: "variant",
    help: `Optional. Left blank, one is made (MAN-<product id>-001). Must not be used by any other product. Up to ${SKU_MAX} characters.`,
  },
  {
    key: "price",
    header: "Price",
    aliases: ["Price per piece", "Unit price", "Fixed price"],
    level: "variant",
    help: "Price per piece in dollars, more than 0. Use either Price or Pricing template.",
  },
  {
    key: "pricing_template",
    header: "Pricing template",
    aliases: ["Template", "Price template"],
    level: "variant",
    help:
      "The name of a pricing template: its quantity pricing is copied into the option. Use either Price " +
      "or Pricing template. Rows with neither use the default template picked on the upload page.",
  },
  { key: "case_price", header: "Case price", aliases: [], level: "variant", help: "Optional, in dollars." },
  {
    key: "stock",
    header: "Stock",
    aliases: ["Inventory", "Stock quantity"],
    level: "variant",
    help: "A whole number; blank means 0. A product shows on the website only when one of its options has stock.",
  },
  {
    key: "weight_lb",
    header: "Weight (lb)",
    aliases: ["Weight", "Weight lb", "Weight lbs", "Shipping weight"],
    level: "variant",
    help: `Optional. Shipping weight of one piece in pounds, up to ${MAX_WEIGHT_LB}.`,
  },
];

const COLUMN_BY_KEY = Object.fromEntries(COLUMNS.map((column) => [column.key, column]));
const headerKey = (text) => String(text ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const HEADER_LOOKUP = new Map(
  COLUMNS.flatMap((column) => [column.header, ...(column.aliases || [])].map((h) => [headerKey(h), column.key])),
);

// Option types as the product form saves them, and the words people may use for them.
const OPTION_TYPES = {
  dropdown: "dropdown",
  dropdownlist: "dropdown",
  select: "dropdown",
  list: "dropdown",
  color: "color",
  colour: "color",
  buttons: "buttons",
  button: "buttons",
  radio: "buttons",
  radiobuttons: "buttons",
  size: "size",
  checkbox: "checkbox",
  checkboxes: "checkbox",
};
const OPTION_TYPE_LABELS = {
  dropdown: "Drop-down",
  color: "Color",
  buttons: "Buttons",
  size: "Size",
  checkbox: "Checkboxes",
};
const guessOptionType = (name) =>
  /^colou?rs?$/i.test(name) ? "color" : /^sizes?$/i.test(name) ? "size" : "dropdown";

const clean = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
const keyOf = (value) => clean(value).toLowerCase();
const short = (value, max = 40) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);
const lengthOf = (value) => Array.from(value).length;
const splitList = (value) => [...new Map(value.split("|").map(clean).filter(Boolean).map((v) => [keyOf(v), v])).values()];

// "$1,234.50" → 1234.5. Anything else → NaN.
const money = (raw) => {
  const text = raw.replace(/[$,\s]/g, "");
  return /^(\d+(\.\d*)?|\.\d+)$/.test(text) ? Math.round(Number(text) * 100) / 100 : NaN;
};

// "1,000" → 1000. Not a whole number of 0 or more → null.
const wholeNumber = (raw) => {
  const text = raw.replace(/[,\s]/g, "");
  return /^\d+$/.test(text) ? Number(text) : null;
};

const hexColour = (raw) => {
  const text = raw.trim().replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(text) ? `#${text.toLowerCase()}` : null;
};

const pricingModeLabel = (mode) => (mode === "tiered" ? "Variable ranges" : "Fixed quantities");

const templateList = (templates) =>
  templates.length ? templates.map((t) => `"${t.name}"`).join(", ") : "none yet: add one on the Pricing Templates page";

// ------------------------------------------------------------------------------------------
// Checking a file
// ------------------------------------------------------------------------------------------

// Reads and checks the file. Returns { report, plan }: the report is what the admin sees,
// the plan is what an import would create (only used when the report has no errors).
const checkFile = async (file, { defaultTemplateId = null } = {}) => {
  if (!file?.buffer?.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Choose a CSV file to upload.");
  }

  const errors = [];
  const warnings = [];
  const fail = (row, column, message) => errors.push({ row, column, message });
  const warn = (row, column, message) => warnings.push({ row, column, message });

  const report = (extra = {}) => ({
    file_name: file.originalname || null,
    summary: {
      rows: extra.rows || 0,
      products: extra.products?.length || 0,
      variants: (extra.products || []).reduce((n, p) => n + p.variants.length, 0),
      new_supplier_categories: extra.newCategories?.length || 0,
      sub_category_links: extra.links?.length || 0,
      errors: errors.length,
      warnings: warnings.length,
    },
    products: extra.products || [],
    new_supplier_categories: extra.newCategories || [],
    sub_category_links: extra.links || [],
    ignored_columns: extra.ignored || [],
    errors,
    warnings,
    can_import: errors.length === 0 && (extra.products?.length || 0) > 0,
  });

  const decoded = decode(file.buffer);
  let rows;
  try {
    rows = parseCsv(decoded);
  } catch (error) {
    fail(null, null, error.message);
    return { report: report(), plan: null };
  }

  // Header row
  const [header = [], ...body] = rows;
  const columnIndex = {};
  const ignored = [];

  header.forEach((raw, index) => {
    const text = clean(raw);
    if (!text) return;

    const key = HEADER_LOOKUP.get(headerKey(text));
    if (!key) {
      ignored.push(text);
    } else if (key in columnIndex) {
      fail(1, text, `Two columns mean "${COLUMN_BY_KEY[key].header}": "${clean(header[columnIndex[key]])}" and "${text}". Keep one of them.`);
    } else {
      columnIndex[key] = index;
    }
  });

  if (!("name" in columnIndex)) {
    fail(
      1,
      null,
      'The first row must name the columns, and one must be called "Product name". Download the example CSV to see the layout.',
    );
    return { report: report({ ignored }), plan: null };
  }

  if (ignored.length) {
    warn(1, null, `These columns aren't used by the import and are skipped: ${ignored.join(", ")}.`);
  }

  if (decoded.includes("�")) {
    warn(null, null, 'Some characters couldn\'t be read. In Excel, save the file as "CSV UTF-8" and upload it again.');
  }

  const cell = (row, key) => (key in columnIndex ? clean(row.cells[columnIndex[key]]) : "");
  const textCell = (row, key) => (key in columnIndex ? String(row.cells[columnIndex[key]] ?? "").trim() : "");

  // Spreadsheet row numbers: the header is row 1. Blank rows are skipped.
  const dataRows = body
    .map((cells, index) => ({ number: index + 2, cells }))
    .filter((row) => row.cells.some((value) => clean(value) !== ""));

  if (!dataRows.length) {
    fail(null, null, "The file has no product rows under the header.");
    return { report: report({ ignored }), plan: null };
  }

  if (dataRows.length > MAX_ROWS) {
    fail(null, null, `The file has ${dataRows.length} rows. Import at most ${MAX_ROWS} at a time: split it into smaller files.`);
    return { report: report({ rows: dataRows.length, ignored }), plan: null };
  }

  // Rows grouped into products by name.
  const groups = new Map();
  for (const row of dataRows) {
    const name = cell(row, "name");

    if (!name) {
      fail(row.number, "Product name", "Add the product name. Every row needs one, rows of the same product too.");
      continue;
    }
    if (lengthOf(name) > NAME_MAX) {
      fail(row.number, "Product name", `A product name can be at most ${NAME_MAX} characters.`);
      continue;
    }

    const key = keyOf(name);
    if (!groups.has(key)) groups.set(key, { name, rows: [] });
    groups.get(key).rows.push(row);
  }

  // What the names in the file refer to.
  const templates = await PricingTemplate.findAll({
    attributes: ["id", "name", "pricing_mode", "pricing_rows"],
    order: [["name", "ASC"]],
  });
  const templateByName = new Map(templates.map((t) => [keyOf(t.name), t]));

  let defaultTemplate = null;
  if (defaultTemplateId !== null && defaultTemplateId !== undefined && defaultTemplateId !== "") {
    defaultTemplate = templates.find((t) => t.id === Number(defaultTemplateId)) || null;
    if (!defaultTemplate) {
      throw new ApiError(httpStatus.BAD_REQUEST, "The default pricing template wasn't found. It may have been deleted: pick another.");
    }
  }

  const brands = await Brand.findAll({
    where: { show_on_website: true, is_active: true },
    attributes: ["id", "name"],
    order: [["id", "ASC"]],
  });
  // Several rows with one name: the oldest is used.
  const firstByName = (items, field) => {
    const map = new Map();
    for (const item of items) {
      if (!map.has(keyOf(item[field]))) map.set(keyOf(item[field]), item);
    }
    return map;
  };
  const brandByName = firstByName(brands, "name");

  const manualCategories = await ProductCategory.findAll({
    where: { supplier: "MANUAL", is_active: true },
    attributes: ["id", "title"],
    order: [["id", "ASC"]],
  });
  const manualByTitle = firstByName(manualCategories, "title");

  const subCategories = await ParentCategory.findAll({
    where: { is_active: true },
    attributes: ["id", "title"],
    order: [["id", "ASC"]],
  });
  const subByTitle = firstByName(subCategories, "title");

  // Links that already exist between Manual categories and parent categories (deleted ones too:
  // the import restores those, as the Parent Categories page does).
  const existingLinks = await ParentCategoryMapping.findAll({
    where: { product_category_id: { [Op.in]: manualCategories.map((c) => c.id) } },
    attributes: ["parent_category_id", "product_category_id", "deleted_at"],
    paranoid: false,
  });
  const liveLinks = new Set(
    existingLinks.filter((l) => !l.deleted_at).map((l) => `${l.product_category_id}:${l.parent_category_id}`),
  );

  const newCategories = new Map(); // key -> title, shared by every product in the file
  const links = new Map(); // "category key:sub id" -> { category, sub }
  const skuRows = new Map(); // key -> row number
  const products = [];
  const plans = [];

  for (const group of groups.values()) {
    const first = group.rows[0];

    // A product-level value: the first one given; any other row must leave it blank or repeat it.
    const productValue = (key, { multiline = false, exact = false } = {}) => {
      let value = "";
      let fromRow = null;
      for (const row of group.rows) {
        const v = multiline ? textCell(row, key) : cell(row, key);
        if (!v) continue;
        if (!value) {
          value = v;
          fromRow = row.number;
        } else if (exact ? v !== value : keyOf(v) !== keyOf(value)) {
          fail(
            row.number,
            COLUMN_BY_KEY[key].header,
            `Differs from row ${fromRow} ("${short(value)}") for the same product. Give it once, or the same on every row.`,
          );
        }
      }
      return value;
    };

    const description = productValue("description", { multiline: true, exact: true });

    // Brand
    const brandName = productValue("brand");
    let brand = null;
    if (brandName) {
      brand = brandByName.get(keyOf(brandName)) || null;
      if (!brand) {
        fail(first.number, "Brand", `No published brand is called "${brandName}". Check the spelling, or publish the brand first.`);
      }
    }

    // Supplier categories and parent categories
    const categoryTitles = splitList(productValue("supplier_category"));
    const subTitles = splitList(productValue("sub_category"));

    const subs = [];
    for (const title of subTitles) {
      const sub = subByTitle.get(keyOf(title));
      if (!sub) {
        fail(first.number, "Parent category", `No parent category is called "${title}". Use a name from the Parent Categories page.`);
      } else {
        subs.push(sub);
      }
    }

    const categoryFor = (title) => {
      const existing = manualByTitle.get(keyOf(title));
      if (existing) return { id: existing.id, key: keyOf(title), title: existing.title, is_new: false };
      if (!newCategories.has(keyOf(title))) newCategories.set(keyOf(title), title);
      return { id: null, key: keyOf(title), title: newCategories.get(keyOf(title)), is_new: true };
    };

    // Every supplier category goes into every parent category given. With no supplier category,
    // each parent category gets a Manual category of its own name.
    const categories = [];
    const pairs = [];
    if (categoryTitles.length) {
      for (const title of categoryTitles) {
        if (lengthOf(title) > NAME_MAX) {
          fail(first.number, "Supplier category", `A category name can be at most ${NAME_MAX} characters.`);
          continue;
        }
        const category = categoryFor(title);
        categories.push(category);
        subs.forEach((sub) => pairs.push({ category, sub }));
      }
    } else {
      for (const sub of subs) {
        const category = categoryFor(sub.title);
        if (!categories.some((c) => c.key === category.key)) categories.push(category);
        pairs.push({ category, sub });
      }
    }

    for (const { category, sub } of pairs) {
      if (category.id && liveLinks.has(`${category.id}:${sub.id}`)) continue;
      const linkKey = `${category.key}:${sub.id}`;
      if (!links.has(linkKey)) links.set(linkKey, { category, sub });
    }

    // Options
    const options = [];
    for (let n = 1; n <= MAX_OPTIONS; n++) {
      const name = productValue(`option${n}_name`);
      const typeText = productValue(`option${n}_type`);
      const valueRow = group.rows.find((row) => cell(row, `option${n}_value`));

      if (!name) {
        if (valueRow) {
          fail(valueRow.number, `Option ${n} value`, `Option ${n} has a value but no name. Add "Option ${n} name", e.g. Size.`);
        }
        continue;
      }

      if (lengthOf(name) > OPTION_VALUE_MAX) {
        fail(first.number, `Option ${n} name`, `An option name can be at most ${OPTION_VALUE_MAX} characters.`);
      }

      let type = guessOptionType(name);
      if (typeText) {
        type = OPTION_TYPES[headerKey(typeText)];
        if (!type) {
          fail(first.number, `Option ${n} type`, `"${typeText}" isn't an option type. Use Drop-down, Color, Buttons, Size or Checkboxes.`);
          type = "dropdown";
        }
      }

      if (options.some((o) => keyOf(o.name) === keyOf(name))) {
        fail(first.number, `Option ${n} name`, `Two options are called "${name}". Give each option its own name.`);
      }
      if (type === "color" && options.some((o) => o.type === "color")) {
        fail(first.number, `Option ${n} type`, "Only one option of a product can be a Color option.");
      }

      options.push({ slot: n, name, type, values: new Map() });
    }

    const hasColour = options.some((o) => o.type === "color");

    // Variants: one per row
    const variants = [];
    const combos = new Map();

    for (const row of group.rows) {
      const optionValues = [];
      let complete = true;

      for (const o of options) {
        const value = cell(row, `option${o.slot}_value`);
        const column = `Option ${o.slot} value`;

        if (!value) {
          fail(row.number, column, `Give this row's ${o.name} (Option ${o.slot} value).`);
          complete = false;
          continue;
        }
        if (lengthOf(value) > OPTION_VALUE_MAX) {
          fail(row.number, column, `An option value can be at most ${OPTION_VALUE_MAX} characters.`);
          complete = false;
          continue;
        }

        // The first spelling of a value is the one saved.
        if (!o.values.has(keyOf(value))) o.values.set(keyOf(value), { name: value, color_code: null, row: row.number });
        const known = o.values.get(keyOf(value));
        const entry = { name: o.name, value: known.name, type: o.type, display_style: o.type };

        if (o.type === "color") {
          const codeText = cell(row, "color_code");
          if (codeText) {
            const code = hexColour(codeText);
            if (!code) {
              fail(row.number, "Color code", `"${codeText}" isn't a colour code. Use #RRGGBB, e.g. #1A2B3C.`);
            } else if (known.color_code && known.color_code !== code) {
              fail(row.number, "Color code", `${known.name} has colour code ${known.color_code} on row ${known.row}. Use one code per colour.`);
            } else {
              known.color_code = code;
            }
          }
          entry.color_code = known.color_code;
        }

        optionValues.push(entry);
      }

      if (!hasColour && cell(row, "color_code")) {
        warn(row.number, "Color code", "Skipped: the product has no Color option.");
      }

      if (complete) {
        const combo = optionValues.map((e) => keyOf(e.value)).join("\u0000");
        if (combos.has(combo)) {
          fail(
            row.number,
            options.length ? "Option values" : "Product name",
            options.length
              ? `Same options as row ${combos.get(combo)}. Each row of a product needs different option values.`
              : `Row ${combos.get(combo)} is already this product. To give a product several rows, add an option (Option 1 name and value) to tell them apart.`,
          );
        } else {
          combos.set(combo, row.number);
        }
      }

      // SKU
      const sku = cell(row, "sku");
      if (sku) {
        if (sku.length > SKU_MAX) {
          fail(row.number, "SKU", `A SKU can be at most ${SKU_MAX} characters.`);
        } else if (skuRows.has(keyOf(sku))) {
          fail(row.number, "SKU", `SKU ${sku} is also on row ${skuRows.get(keyOf(sku))}. Each SKU can be used once.`);
        } else {
          skuRows.set(keyOf(sku), row.number);
        }
      }

      // Price or pricing template
      const priceText = cell(row, "price");
      const templateText = cell(row, "pricing_template");
      let pricing = null;

      if (priceText && templateText) {
        fail(row.number, "Price", "Give a Price or a Pricing template, not both.");
      } else if (priceText) {
        const price = money(priceText);
        if (!(price > 0)) {
          fail(row.number, "Price", `"${priceText}" isn't a price above 0.`);
        } else {
          pricing = { pricing_mode: "fixed", price, label: `$${price.toFixed(2)}` };
        }
      } else {
        const template = templateText ? templateByName.get(keyOf(templateText)) : defaultTemplate;
        if (templateText && !template) {
          fail(row.number, "Pricing template", `No pricing template is called "${templateText}". Templates: ${templateList(templates)}.`);
        } else if (!template) {
          fail(row.number, "Price", "Add a Price or a Pricing template, or pick a default pricing template on the upload page.");
        } else {
          const rows = parseJson(template.pricing_rows) || [];
          pricing =
            template.pricing_mode === "tiered"
              ? { pricing_mode: "tiered", bulk_pricing: rows }
              : { pricing_mode: "quantity_fixed", quantity_pricing: rows };
          pricing.label = `Template: ${template.name} (${pricingModeLabel(template.pricing_mode)})`;
          pricing.template_id = template.id;
        }
      }

      // Case price, stock, weight
      const caseText = cell(row, "case_price");
      let casePrice = 0;
      if (caseText) {
        casePrice = money(caseText);
        if (!(casePrice >= 0)) fail(row.number, "Case price", `"${caseText}" isn't a price.`);
      }

      const stockText = cell(row, "stock");
      let stock = 0;
      if (stockText) {
        stock = wholeNumber(stockText);
        if (stock === null) fail(row.number, "Stock", `"${stockText}" isn't a whole number of 0 or more.`);
      }

      const weightText = cell(row, "weight_lb");
      let weight = null;
      if (weightText) {
        const value = Number(weightText.replace(/[,\s]|lbs?$/gi, ""));
        if (!(Number.isFinite(value) && value > 0 && value <= MAX_WEIGHT_LB)) {
          fail(row.number, "Weight (lb)", `"${weightText}" isn't a weight above 0 and up to ${MAX_WEIGHT_LB} lb.`);
        } else {
          weight = Number(value.toFixed(3));
        }
      }

      variants.push({ row: row.number, sku: sku || null, optionValues, pricing, casePrice, stock, weight });
    }

    if (variants.length && variants.every((v) => v.stock === 0)) {
      warn(
        first.number,
        "Stock",
        `${short(group.name)}: every option has stock 0, so the product won't show on the website until one has stock.`,
      );
    }
    if (!subs.length) {
      warn(
        first.number,
        "Parent category",
        `${short(group.name)}: no parent category, so the product won't appear under any category on the website (search still finds it).`,
      );
    }

    const optionsMeta = options.map((o) => ({
      name: o.name,
      type: o.type,
      values: [...o.values.values()].map((v) => (o.type === "color" ? { name: v.name, color_code: v.color_code } : { name: v.name })),
    }));

    products.push({
      name: group.name,
      rows: group.rows.map((row) => row.number),
      brand: brand ? brand.name : null,
      supplier_categories: categories.map(({ title, is_new }) => ({ title, is_new })),
      sub_categories: subs.map((s) => s.title),
      options: optionsMeta.map((o) => ({
        name: o.name,
        type: OPTION_TYPE_LABELS[o.type],
        values: o.values.map((v) => v.name),
      })),
      variants: variants.map((v) => ({
        row: v.row,
        sku: v.sku || SKU_MADE_ON_IMPORT,
        options: v.optionValues.map((e) => e.value),
        pricing: v.pricing?.label || null,
        stock: v.stock,
        weight_lb: v.weight,
      })),
    });

    plans.push({
      name: group.name,
      description: description || null,
      brandId: brand ? brand.id : null,
      categories,
      optionsMeta,
      variants,
    });
  }

  // SKUs taken by products already in the shop, deleted ones too (the column is unique).
  if (skuRows.size) {
    const taken = await ProductVariant.findAll({
      where: { sku: { [Op.in]: [...skuRows.keys()] } },
      attributes: ["sku", "product_id"],
      paranoid: false,
    });
    for (const variant of taken) {
      fail(skuRows.get(keyOf(variant.sku)), "SKU", `SKU ${variant.sku} is already used by product ${variant.product_id}.`);
    }
  }

  // Names already in the shop: allowed, but worth knowing before a second import of one file.
  if (groups.size) {
    const sameName = await Product.findAll({
      where: { name: { [Op.in]: [...groups.values()].map((g) => g.name) } },
      attributes: ["id", "name"],
    });
    for (const product of sameName) {
      const group = groups.get(keyOf(product.name));
      if (group) {
        warn(group.rows[0].number, "Product name", `A product called "${product.name}" already exists (${product.id}). Importing adds another one.`);
      }
    }
  }

  errors.sort((a, b) => (a.row ?? 0) - (b.row ?? 0));
  warnings.sort((a, b) => (a.row ?? 0) - (b.row ?? 0));

  const linkList = [...links.values()];
  return {
    report: report({
      rows: dataRows.length,
      products,
      newCategories: [...newCategories.values()],
      links: linkList.map(({ category, sub }) => ({ supplier_category: category.title, sub_category: sub.title })),
      ignored,
    }),
    plan: { products: plans, newCategories, links: linkList },
  };
};

// ------------------------------------------------------------------------------------------
// Importing
// ------------------------------------------------------------------------------------------

const previewImport = async (file, options) => (await checkFile(file, options)).report;

// Creates every product in the file, or nothing. A file with errors returns { imported: false,
// report } and changes nothing.
const importProducts = async (file, options) => {
  const { report, plan } = await checkFile(file, options);
  if (!report.can_import) {
    return { imported: false, report };
  }

  const variantCount = plan.products.reduce((n, p) => n + p.variants.length, 0);

  try {
    const result = await sequelize.transaction(async (transaction) => {
      const batch = await ImportBatch.create(
        {
          source_name: `CSV_PRODUCT_IMPORT ${file.originalname || ""}`.trim().slice(0, 255),
          status: "success",
          total_records: variantCount,
          processed_records: variantCount,
        },
        { transaction },
      );

      // New Manual categories, as "Add category" on the product form makes them.
      const newCategoryIds = new Map();
      for (const [key, title] of plan.newCategories) {
        const category = await ProductCategory.create(
          { title, supplier: "MANUAL", external_id: null, import_batch_id: null },
          { transaction },
        );
        newCategoryIds.set(key, category.id);
      }
      const categoryId = (category) => category.id || newCategoryIds.get(category.key);

      // Supplier categories into parent categories, as the Parent Categories page does (restoring a deleted link).
      for (const { category, sub } of plan.links) {
        const productCategoryId = categoryId(category);
        const existing = await ParentCategoryMapping.findOne({
          where: { parent_category_id: sub.id, product_category_id: productCategoryId },
          paranoid: false,
          transaction,
        });
        if (existing) {
          if (existing.deleted_at) await existing.restore({ transaction });
        } else {
          await ParentCategoryMapping.create(
            { parent_category_id: sub.id, product_category_id: productCategoryId },
            { transaction },
          );
        }
      }

      const created = [];
      for (const p of plan.products) {
        // The product, as createProduct saves it.
        const product = await Product.create(
          {
            name: p.name,
            description: p.description,
            brand_id: p.brandId,
            supplier: "MANUAL",
            last_supplier_sync_at: new Date(),
            import_batch_id: batch.id,
            meta: p.optionsMeta.length ? { options: p.optionsMeta } : {},
          },
          { transaction },
        );

        // One size row per option value, as createProduct makes them.
        const sizeRows = p.optionsMeta.flatMap((o) =>
          o.values.map((v) => ({ product_id: product.id, name: v.name, type: o.name, display_style: o.type, measurements: null })),
        );
        if (sizeRows.length) await Size.bulkCreate(sizeRows, { transaction });
        const sizes = await Size.findAll({ where: { product_id: product.id }, transaction });
        const sizeByOption = new Map(sizes.map((s) => [`${keyOf(s.type)}\u0000${keyOf(s.name)}`, s]));

        if (p.categories.length) {
          await ProductCategoryMapping.bulkCreate(
            p.categories.map((category) => ({ product_id: product.id, product_category_id: categoryId(category) })),
            { transaction },
          );
        }

        // Variants, as addProductVariants saves them.
        const nextSku = await createSkuGenerator(product.id, p.variants);
        for (const v of p.variants) {
          const sku = v.sku || nextSku();
          const { optionValues, color, colorCode, sizeName, optionName } = resolveVariantOptions({
            option_values: v.optionValues,
          });
          const size = sizeName ? sizeByOption.get(`${keyOf(optionName)}\u0000${keyOf(sizeName)}`) : null;
          const { price, meta } = resolveVariantPricing(v.pricing, sku);

          await ProductVariant.create(
            {
              product_id: product.id,
              sku,
              price,
              case_price: v.casePrice,
              stock: v.stock,
              color,
              color_code: colorCode,
              size_id: size ? size.id : null,
              size: size ? size.name : null,
              supplier: "MANUAL",
              last_supplier_sync_at: new Date(),
              import_batch_id: batch.id,
              admin_weight_lb: v.weight,
              meta: { ...meta, option_values: optionValues },
            },
            { transaction },
          );
        }

        created.push({ id: product.id, name: product.name, variants: p.variants.length });
      }

      return { batch_id: batch.id, products: created };
    });

    return {
      imported: true,
      batch_id: result.batch_id,
      products: result.products,
      summary: {
        products: result.products.length,
        variants: variantCount,
        new_supplier_categories: plan.newCategories.size,
        sub_category_links: plan.links.length,
      },
      warnings: report.warnings,
    };
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      throw new ApiError(
        httpStatus.CONFLICT,
        "Something in the file was saved by someone else while importing (a SKU or a category link). Nothing was imported: check the file again, then import.",
      );
    }
    throw error;
  }
};

// ------------------------------------------------------------------------------------------
// The layout, for the upload page
// ------------------------------------------------------------------------------------------

const exampleRows = (templateName) => {
  const blank = Object.fromEntries(COLUMNS.map((c) => [c.key, ""]));
  const row = (values) => COLUMNS.map((c) => ({ ...blank, ...values })[c.key]);
  const tee = {
    name: "Classic Tee",
    supplier_category: "Tees",
    sub_category: "T Shirts",
    option1_name: "Color",
    option1_type: "Color",
    option2_name: "Size",
    option2_type: "Size",
    price: "12.50",
    weight_lb: "0.4",
  };
  const cards = { name: "Premium Business Cards", supplier_category: "Premium Business cards", sub_category: "Premium", option1_name: "Paper" };
  const cardPrice = templateName ? { pricing_template: templateName } : { price: "0.25" };

  return [
    COLUMNS.map((c) => c.header),
    row({
      name: "Marketing Starter Box",
      description: "Business cards, flyers and stickers in one box",
      supplier_category: "Business Boxes",
      sub_category: "Business Boxes",
      price: "49.99",
      stock: "100",
      weight_lb: "2",
    }),
    row({ ...tee, description: "Soft cotton T-shirt", option1_value: "Black", color_code: "#000000", option2_value: "M", sku: "TEE-BLK-M", stock: "25" }),
    row({ ...tee, option1_value: "Black", color_code: "#000000", option2_value: "L", sku: "TEE-BLK-L", stock: "25" }),
    row({ ...tee, option1_value: "White", color_code: "#FFFFFF", option2_value: "M", sku: "TEE-WHT-M", stock: "30" }),
    row({ ...cards, description: "16 pt card, full colour on both sides", option1_type: "Drop-down", option1_value: "Matte", ...cardPrice, stock: "999999" }),
    row({ ...cards, option1_value: "Gloss", ...cardPrice, stock: "999999" }),
  ];
};

const getImportFormat = async () => {
  const templates = await PricingTemplate.findAll({
    attributes: ["id", "name", "pricing_mode"],
    order: [["name", "ASC"]],
  });

  return {
    columns: COLUMNS.map(({ key, header, required, level, help }) => ({
      key,
      header,
      required: Boolean(required),
      level,
      help,
    })),
    option_types: Object.values(OPTION_TYPE_LABELS),
    pricing_templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      pricing_mode: t.pricing_mode,
      label: pricingModeLabel(t.pricing_mode),
    })),
    limits: { max_rows: MAX_ROWS, max_file_mb: MAX_FILE_MB, max_options: MAX_OPTIONS },
    example_file_name: "product-import-example.csv",
    example_csv: toCsv(exampleRows(templates[0]?.name)),
    template_csv: toCsv([COLUMNS.map((c) => c.header)]),
  };
};

module.exports = { getImportFormat, previewImport, importProducts, MAX_FILE_MB };
