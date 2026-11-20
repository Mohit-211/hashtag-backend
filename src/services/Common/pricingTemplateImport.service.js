// Pricing templates from a CSV file (admin panel: Pricing Templates › Import from CSV). One row
// per price: a tier of a Variable ranges template, or an exact quantity of a Fixed quantities
// one. Rows with the same template name make one template. The file is checked as a whole, like
// the product import: the preview lists every problem by spreadsheet row, and the import saves
// every template in one transaction, or none. What's saved is what the Pricing Templates page
// saves (pricingTemplate.service.js), checked by the same rules (utils/pricing/pricingRows.js).

const httpStatus = require("http-status");
const { UniqueConstraintError } = require("sequelize");
const sequelize = require("../../config/central.db");
const ApiError = require("../../utils/ApiError");
const { decode, parseCsv, toCsv } = require("../../utils/csv");
const { PricingTemplate } = require("../../models");
const { parseBulkPricing, parseQuantityPricing } = require("../../utils/pricing/pricingRows");
const { NAME_MAX_LENGTH, MAX_ROWS: MAX_PRICES, toTemplate } = require("./pricingTemplate.service");

const MAX_FILE_ROWS = 1000;
const MAX_FILE_MB = 2; // csvLimits in config/multer.js

const STYLES = {
  tiered: "Variable ranges",
  quantity_fixed: "Fixed quantities",
};

// The columns, in the example's order. `aliases` are other headers read as the same column;
// headers compare without case, spaces or punctuation. `style`: the pricing style a column is for.
const COLUMNS = [
  {
    key: "name",
    header: "Template name",
    aliases: ["Name", "Template", "Pricing template", "Template title"],
    level: "template",
    required: true,
    help: `Rows with the same name make one template: one row per tier or quantity. Up to ${NAME_MAX_LENGTH} characters.`,
  },
  {
    key: "style",
    header: "Pricing style",
    aliases: ["Style", "Pricing mode", "Mode", "Pricing type", "Type"],
    level: "template",
    required: true,
    help: "Variable ranges or Fixed quantities. Needed once per template: on its first row, or on every row.",
  },
  {
    key: "from",
    header: "From",
    aliases: ["Min qty", "Min quantity", "Minimum quantity", "From quantity", "Quantity from"],
    level: "row",
    style: "tiered",
    help: "The first quantity of the tier, a whole number.",
  },
  {
    key: "to",
    header: "To",
    aliases: ["Max qty", "Max quantity", "Maximum quantity", "To quantity", "Quantity to"],
    level: "row",
    style: "tiered",
    help: "The last quantity of the tier. Leave it blank on the last tier to cover every larger order.",
  },
  {
    key: "price_per_item",
    header: "Price per item",
    aliases: ["Price per piece", "Unit price", "Price each", "Per item"],
    level: "row",
    style: "tiered",
    help: "What one item costs in this tier, in dollars, more than 0.",
  },
  {
    key: "quantity",
    header: "Quantity",
    aliases: ["Qty", "Exact quantity", "Pack size"],
    level: "row",
    style: "quantity_fixed",
    help: "An exact quantity the shopper can order, a whole number. Each quantity once per template.",
  },
  {
    key: "total_price",
    header: "Total price",
    aliases: ["Pack price", "Price for quantity", "Total"],
    level: "row",
    style: "quantity_fixed",
    help: "What that whole quantity costs, in dollars, more than 0.",
  },
];

const COLUMN_BY_KEY = Object.fromEntries(COLUMNS.map((column) => [column.key, column]));
const headerKey = (text) => String(text ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const HEADER_LOOKUP = new Map([
  ...COLUMNS.flatMap((column) => [column.header, ...column.aliases].map((h) => [headerKey(h), column.key])),
  // A column called just "Price" is read as Price per item or Total price, whichever the
  // template's style uses.
  ["price", "price"],
]);

// Words people may use for the two styles, compared like headers.
const STYLE_WORDS = {
  variableranges: "tiered",
  variablerange: "tiered",
  variable: "tiered",
  ranges: "tiered",
  range: "tiered",
  tiered: "tiered",
  tiers: "tiered",
  bulk: "tiered",
  fixedquantities: "quantity_fixed",
  fixedquantity: "quantity_fixed",
  fixed: "quantity_fixed",
  quantityfixed: "quantity_fixed",
  quantities: "quantity_fixed",
  packs: "quantity_fixed",
  packsizes: "quantity_fixed",
};

const clean = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
const short = (value, max = 40) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);
const lengthOf = (value) => Array.from(value).length;

// Template names are unique without case or accents (the table's utf8mb4_general_ci collation),
// so "Café" and "cafe" are the same template, in the file and in the database.
const nameKey = (value) =>
  clean(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// "1,000" or "100.0" → 1000 / 100. Not a whole number above 0 → null.
const wholeNumber = (raw) => {
  const text = raw.replace(/[,\s]/g, "");
  if (!/^\d+(\.0+)?$/.test(text)) return null;
  const n = Number(text);
  return n > 0 && Number.isSafeInteger(n) ? n : null;
};

// "$1,234.50" → 1234.5, decimals as given (the Pricing Templates page has no limit either).
// Not an amount above 0 → null.
const dollars = (raw) => {
  const text = raw.replace(/[$,\s]/g, "");
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(text)) return null;
  const n = Number(text);
  return n > 0 && Number.isFinite(n) ? n : null;
};

// 0.4 → "0.40", 0.125 → "0.125", 25 → "25", as the Pricing Templates page shows them.
const money = (n) => {
  const text = String(n);
  if (Number.isInteger(n)) return text;
  return text.split(".")[1]?.length === 1 ? n.toFixed(2) : text;
};

const describe = (mode, rows) =>
  mode === "tiered"
    ? rows
        .map((t) => `${t.max_qty === null ? `${t.min_qty}+` : `${t.min_qty}–${t.max_qty}`}: $${money(t.price)} each`)
        .join(" · ")
    : rows.map((q) => `${q.quantity} for $${money(q.price)}`).join(" · ");

const columnList = (keys) => keys.map((key) => COLUMN_BY_KEY[key].header).join(", ");

// ------------------------------------------------------------------------------------------
// Checking a file
// ------------------------------------------------------------------------------------------

// Reads and checks the file. Returns { report, plan }: the report is what the admin sees, the
// plan is what an import would save (only used when the report has no errors).
// replaceExisting: a template whose name is already taken replaces that template, instead of
// being a problem.
const checkFile = async (file, { replaceExisting = false } = {}) => {
  if (!file?.buffer?.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Choose a CSV file to upload.");
  }

  const errors = [];
  const warnings = [];
  const fail = (row, column, message) => errors.push({ row, column, message });
  const warn = (row, column, message) => warnings.push({ row, column, message });

  // Problems are listed top to bottom, as the spreadsheet reads; the file's own come first.
  const byRow = (a, b) => (a.row ?? 0) - (b.row ?? 0);

  const report = ({ rows = 0, templates = [], ignored = [], alreadyExist = [] } = {}) => ({
    file_name: file.originalname || null,
    replace_existing: Boolean(replaceExisting),
    // Templates in the file whose name is already a template: the panel asks whether to update
    // them (replace_existing). Listed whether or not that was chosen.
    already_exist: alreadyExist,
    summary: {
      rows,
      templates: templates.length,
      new_templates: templates.filter((t) => t.action === "create").length,
      replaced_templates: templates.filter((t) => t.action === "replace").length,
      variable_ranges: templates.filter((t) => t.pricing_mode === "tiered").length,
      fixed_quantities: templates.filter((t) => t.pricing_mode === "quantity_fixed").length,
      errors: errors.length,
      warnings: warnings.length,
    },
    templates,
    ignored_columns: ignored,
    errors: [...errors].sort(byRow),
    warnings: [...warnings].sort(byRow),
    can_import: errors.length === 0 && templates.length > 0,
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
      const meant = key === "price" ? "Price" : COLUMN_BY_KEY[key].header;
      fail(1, text, `Two columns mean "${meant}": "${clean(header[columnIndex[key]])}" and "${text}". Keep one of them.`);
    } else {
      columnIndex[key] = index;
    }
  });

  if (!("name" in columnIndex)) {
    fail(
      1,
      null,
      'The first row must name the columns, and one must be called "Template name". Download the example CSV to see the layout.',
    );
    return { report: report({ ignored }), plan: null };
  }

  if (ignored.length) {
    warn(1, null, `These columns aren't used and are skipped: ${ignored.join(", ")}.`);
  }

  if (decoded.includes("�")) {
    warn(null, null, 'Some characters couldn\'t be read. In Excel, save the file as "CSV UTF-8" and upload it again.');
  }

  const cell = (row, key) => (key in columnIndex ? clean(row.cells[columnIndex[key]]) : "");

  // Spreadsheet row numbers: the header is row 1. Blank rows are skipped.
  const dataRows = body
    .map((cells, index) => ({ number: index + 2, cells }))
    .filter((row) => row.cells.some((value) => clean(value) !== ""));

  if (!dataRows.length) {
    fail(null, null, "The file has no rows under the header.");
    return { report: report({ ignored }), plan: null };
  }

  if (dataRows.length > MAX_FILE_ROWS) {
    fail(null, null, `The file has ${dataRows.length} rows. Import at most ${MAX_FILE_ROWS} at a time: split it into smaller files.`);
    return { report: report({ rows: dataRows.length, ignored }), plan: null };
  }

  // Rows grouped into templates by name. The first row's spelling is the template's name.
  const groups = new Map();
  for (const row of dataRows) {
    const name = cell(row, "name");

    if (!name) {
      fail(row.number, "Template name", "Add the template name. Every row needs one, rows of the same template too.");
      continue;
    }
    if (lengthOf(name) > NAME_MAX_LENGTH) {
      fail(row.number, "Template name", `A template's name can be at most ${NAME_MAX_LENGTH} characters.`);
      continue;
    }

    const key = nameKey(name);
    if (!groups.has(key)) groups.set(key, { name, rows: [] });
    groups.get(key).rows.push(row);
  }

  const existing = await PricingTemplate.findAll({ attributes: ["id", "name", "pricing_mode"] });
  const existingByName = new Map(existing.map((t) => [nameKey(t.name), t]));

  const plan = [];
  const templates = [];
  const alreadyExist = [];

  for (const group of groups.values()) {
    const { name } = group;
    const first = group.rows[0].number;
    const before = errors.length;

    // The style: given on one row or more, the same on each.
    let mode = null;
    let modeRow = null;
    for (const row of group.rows) {
      const raw = cell(row, "style");
      if (!raw) continue;

      const given = STYLE_WORDS[headerKey(raw)];
      if (!given) {
        fail(row.number, "Pricing style", `"${short(raw)}" isn't a pricing style. Use Variable ranges or Fixed quantities.`);
      } else if (mode && given !== mode) {
        fail(
          row.number,
          "Pricing style",
          `"${short(name)}" is ${STYLES[mode]} on row ${modeRow}, so every row of it must be. A template has one style.`,
        );
      } else if (!mode) {
        mode = given;
        modeRow = row.number;
      }
    }

    if (!mode) {
      if (errors.length === before) {
        fail(first, "Pricing style", `Add the pricing style of "${short(name)}": Variable ranges or Fixed quantities.`);
      }
      continue;
    }

    if (group.rows.length > MAX_PRICES) {
      fail(
        first,
        "Template name",
        `"${short(name)}" has ${group.rows.length} rows. A template can have at most ${MAX_PRICES} ${mode === "tiered" ? "tiers" : "quantities"}.`,
      );
      continue;
    }

    const tiered = mode === "tiered";
    const ownColumns = tiered ? ["from", "to", "price_per_item"] : ["quantity", "total_price"];
    const otherColumns = tiered ? ["quantity", "total_price"] : ["from", "to", "price_per_item"];
    const priceColumn = tiered ? "Price per item" : "Total price";
    const prices = [];
    const quantityRows = new Map();

    for (const row of group.rows) {
      const misplaced = otherColumns.filter((key) => cell(row, key));
      if (misplaced.length) {
        fail(
          row.number,
          columnList(misplaced),
          `${columnList(misplaced)} ${misplaced.length === 1 ? "is" : "are"} for ${STYLES[tiered ? "quantity_fixed" : "tiered"]} templates. ` +
            `"${short(name)}" is ${STYLES[mode]}: use ${columnList(ownColumns)}.`,
        );
      }

      const priceRaw = cell(row, tiered ? "price_per_item" : "total_price") || cell(row, "price");
      const price = dollars(priceRaw);
      if (!priceRaw) {
        fail(row.number, priceColumn, tiered ? "Add the price per item for this tier." : "Add the total price for this quantity.");
      } else if (price === null) {
        fail(row.number, priceColumn, `"${short(priceRaw)}" isn't a price above 0, like 12.50.`);
      }

      if (tiered) {
        const fromRaw = cell(row, "from");
        const toRaw = cell(row, "to");
        const from = fromRaw ? wholeNumber(fromRaw) : null;
        const to = toRaw ? wholeNumber(toRaw) : null;

        if (!fromRaw) {
          fail(row.number, "From", "Add From: the first quantity of this tier.");
        } else if (from === null) {
          fail(row.number, "From", `"${short(fromRaw)}" isn't a whole number above 0.`);
        }

        if (toRaw && to === null) {
          fail(row.number, "To", `"${short(toRaw)}" isn't a whole number above 0. Leave To blank to cover every larger order.`);
        } else if (to !== null && from !== null && to <= from) {
          fail(row.number, "To", `To (${to}) must be more than From (${from}).`);
        }

        prices.push({ row: row.number, min_qty: from, max_qty: toRaw ? to : null, price });
      } else {
        const quantityRaw = cell(row, "quantity");
        const quantity = quantityRaw ? wholeNumber(quantityRaw) : null;

        if (!quantityRaw) {
          fail(row.number, "Quantity", "Add the quantity: an exact amount the shopper can order.");
        } else if (quantity === null) {
          fail(row.number, "Quantity", `"${short(quantityRaw)}" isn't a whole number above 0.`);
        } else if (quantityRows.has(quantity)) {
          fail(row.number, "Quantity", `Quantity ${quantity} is already on row ${quantityRows.get(quantity)}. List each quantity once.`);
        } else {
          quantityRows.set(quantity, row.number);
        }

        prices.push({ row: row.number, quantity, price });
      }
    }

    if (errors.length !== before) continue;

    // Tiers in quantity order, whatever order the rows are in. Then the same rules as the
    // Pricing Templates page: only the last tier can leave To blank, and tiers can't overlap.
    if (tiered) {
      prices.sort((a, b) => a.min_qty - b.min_qty);

      prices.forEach((tier, index) => {
        const previous = prices[index - 1];

        if (tier.max_qty === null && index < prices.length - 1) {
          fail(
            tier.row,
            "To",
            `Only the tier with the largest From can leave To blank. Add a To below ${prices[index + 1].min_qty}, where the tier on row ${prices[index + 1].row} starts.`,
          );
        } else if (previous && previous.max_qty !== null && tier.min_qty <= previous.max_qty) {
          fail(
            tier.row,
            "From",
            `From ${tier.min_qty} overlaps the tier on row ${previous.row} (${previous.min_qty}–${previous.max_qty}). Start this tier at ${previous.max_qty + 1} or later.`,
          );
        }
      });

      if (errors.length !== before) continue;
    }

    // The shared check, as the Pricing Templates page saves it. The row checks above already
    // cover it, so this only guards against them drifting apart.
    let saved;
    try {
      saved = tiered ? parseBulkPricing(prices, "Pricing") : parseQuantityPricing(prices, "Pricing");
    } catch (error) {
      fail(first, null, `"${short(name)}": ${error.message}.`);
      continue;
    }

    // Quantities no tier covers can't be ordered: the cart refuses them. Allowed (a minimum
    // order, say), so only worth a look.
    if (tiered) {
      if (saved[0].min_qty > 1) {
        warn(prices[0].row, "From", `"${short(name)}" starts at ${saved[0].min_qty}: orders of fewer than ${saved[0].min_qty} can't be placed with it.`);
      }
      saved.forEach((tier, index) => {
        const previous = saved[index - 1];
        if (previous && tier.min_qty > previous.max_qty + 1) {
          const gap = tier.min_qty - 1 === previous.max_qty + 1 ? `Quantity ${previous.max_qty + 1} isn't` : `Quantities ${previous.max_qty + 1} to ${tier.min_qty - 1} aren't`;
          warn(prices[index].row, "From", `${gap} in any tier of "${short(name)}", so ${gap.startsWith("Quantity ") ? "it" : "they"} can't be ordered.`);
        }
      });
      const last = saved[saved.length - 1];
      if (last.max_qty !== null) {
        warn(
          prices[prices.length - 1].row,
          "To",
          `The last tier of "${short(name)}" ends at ${last.max_qty}: larger orders can't be placed. Leave To blank to cover them.`,
        );
      }
    }

    const match = existingByName.get(nameKey(name));
    if (match) {
      alreadyExist.push({
        name: match.name,
        file_name: name,
        rows: group.rows.map((row) => row.number),
        style: STYLES[match.pricing_mode],
      });
    }
    if (match && !replaceExisting) {
      fail(
        first,
        "Template name",
        `"${match.name}" is already a template. Choose to update it with this file's prices, or give it another name in the file to add a new template.`,
      );
      continue;
    }

    plan.push({ name, pricing_mode: mode, pricing_rows: saved, existingId: match?.id ?? null });
    templates.push({
      name,
      rows: group.rows.map((row) => row.number),
      pricing_mode: mode,
      style: STYLES[mode],
      bulk_pricing: tiered ? saved : null,
      quantity_pricing: tiered ? null : saved,
      description: describe(mode, saved),
      action: match ? "replace" : "create",
      replaces: match ? { id: match.id, name: match.name, style: STYLES[match.pricing_mode] } : null,
    });
  }

  return { report: report({ rows: dataRows.length, templates, ignored, alreadyExist }), plan };
};

// ------------------------------------------------------------------------------------------
// Importing
// ------------------------------------------------------------------------------------------

const previewImport = async (file, options) => (await checkFile(file, options)).report;

// Saves every template in the file, or none. A file with problems returns { imported: false,
// report } and changes nothing. A replaced template keeps its id; products that loaded it keep
// their own copy of its prices, as when it's edited on the Pricing Templates page.
const importTemplates = async (file, { replaceExisting = false, adminId = null } = {}) => {
  const { report, plan } = await checkFile(file, { replaceExisting });
  if (!report.can_import) {
    return { imported: false, report };
  }

  try {
    const saved = await sequelize.transaction(async (transaction) => {
      const out = [];

      for (const t of plan) {
        const values = { name: t.name, pricing_mode: t.pricing_mode, pricing_rows: t.pricing_rows };

        if (t.existingId) {
          const template = await PricingTemplate.findByPk(t.existingId, { transaction, lock: transaction.LOCK.UPDATE });
          if (!template) {
            throw new ApiError(
              httpStatus.CONFLICT,
              `"${t.name}" was deleted by someone else while importing. Nothing was imported: check the file again, then import.`,
            );
          }
          template.set(values);
          template.changed("pricing_rows", true);
          await template.save({ transaction });
          out.push({ ...toTemplate(template), action: "replace" });
        } else {
          const template = await PricingTemplate.create({ ...values, created_by: adminId }, { transaction });
          out.push({ ...toTemplate(template), action: "create" });
        }
      }

      return out;
    });

    return {
      imported: true,
      templates: saved,
      summary: {
        templates: saved.length,
        created: saved.filter((t) => t.action === "create").length,
        replaced: saved.filter((t) => t.action === "replace").length,
      },
      warnings: report.warnings,
    };
  } catch (error) {
    // Two saves of one name at the same moment: the unique key on active_name stops the second.
    if (error instanceof UniqueConstraintError) {
      throw new ApiError(
        httpStatus.CONFLICT,
        "A template with one of these names was saved by someone else while importing. Nothing was imported: check the file again, then import.",
      );
    }
    throw error;
  }
};

// ------------------------------------------------------------------------------------------
// The layout, for the upload page
// ------------------------------------------------------------------------------------------

const exampleRows = () => {
  const blank = Object.fromEntries(COLUMNS.map((c) => [c.key, ""]));
  const row = (values) => COLUMNS.map((c) => ({ ...blank, ...values })[c.key]);
  const cards = { name: "Example: business cards by volume", style: STYLES.tiered };
  const stickers = { name: "Example: sticker packs", style: STYLES.quantity_fixed };

  return [
    COLUMNS.map((c) => c.header),
    row({ ...cards, from: "1", to: "249", price_per_item: "0.40" }),
    row({ ...cards, from: "250", to: "499", price_per_item: "0.30" }),
    row({ ...cards, from: "500", to: "999", price_per_item: "0.22" }),
    row({ ...cards, from: "1000", price_per_item: "0.15" }),
    row({ ...stickers, quantity: "50", total_price: "25.00" }),
    row({ ...stickers, quantity: "100", total_price: "40.00" }),
    row({ ...stickers, quantity: "250", total_price: "85.00" }),
    row({ ...stickers, quantity: "500", total_price: "150.00" }),
  ];
};

const getImportFormat = async () => {
  const existing = await PricingTemplate.count();
  const example = exampleRows();

  return {
    columns: COLUMNS.map(({ key, header, required, level, style, help }) => ({
      key,
      header,
      required: Boolean(required),
      level,
      style: style ? STYLES[style] : null,
      help,
    })),
    styles: [
      {
        key: "tiered",
        label: STYLES.tiered,
        columns: ["From", "To", "Price per item"],
        description: "A price per item for each range of quantities, e.g. 1–249 at $0.40 each, 1000+ at $0.15 each.",
      },
      {
        key: "quantity_fixed",
        label: STYLES.quantity_fixed,
        columns: ["Quantity", "Total price"],
        description: "Exact quantities the shopper picks from, each with a total price, e.g. 50 for $25, 100 for $40.",
      },
    ],
    limits: {
      max_rows: MAX_FILE_ROWS,
      max_file_mb: MAX_FILE_MB,
      max_prices_per_template: MAX_PRICES,
      name_max: NAME_MAX_LENGTH,
    },
    existing_templates: existing,
    example_file_name: "pricing-templates-example.csv",
    example_csv: toCsv(example),
    example_rows: example,
    template_csv: toCsv([COLUMNS.map((c) => c.header)]),
  };
};

module.exports = { getImportFormat, previewImport, importTemplates, MAX_FILE_MB };
