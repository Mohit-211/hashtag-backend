// A client's previous orders from a CSV file (admin panel: the client's page › Import previous
// orders), so their order history from before the website is in one place. One row per order line;
// rows with the same order number make one order. Built like the other CSV imports: the preview
// lists every problem by spreadsheet row and saves nothing; the import creates every order in the
// file in one transaction, or none.
//
// Every line must be one of our products, and one colour/size of it (by Color and Size, or SKU).
// An imported order is a record, nothing more: no stock is taken, no label is bought, no email is
// sent, and no payment is recorded. It's marked imported_at and import_batch_id, shows in the
// client's My Orders like any order, and stays out of the dashboard's website sales. Undo removes
// every order of one import.

const httpStatus = require("http-status");
const { Op } = require("sequelize");
const he = require("he");

const sequelize = require("../../config/central.db");
const config = require("../../config/config");
const ApiError = require("../../utils/ApiError");
const { decode, parseCsv, toCsv } = require("../../utils/csv");
const decodeHtmlEntities = require("../../utils/decodeHtmlEntities");
const {
  User,
  Profile,
  Order,
  OrderItem,
  Product,
  ProductVariant,
  Size,
  ImportBatch,
} = require("../../models");

const MAX_FILE_ROWS = 2000;
const MAX_FILE_MB = 2; // csvLimits in config/multer.js
const ORDER_NUMBER_MAX = 50; // orders.order_number
const PAYMENT_METHOD_MAX = 50; // orders.payment_method
const TRACKING_MAX = 100; // orders.tracking_number
const SHIP_TO_MAX = 255;
const DECORATION_MAX = 500;
const EARLIEST = new Date(Date.UTC(2000, 0, 1));

// What an imported order's Status can be, and what each sets on the order.
const STATUSES = {
  DELIVERED: { label: "Delivered", status: "DELIVERED", shipment_status: "DELIVERED" },
  SHIPPED: { label: "Shipped", status: "SHIPPED", shipment_status: "IN_TRANSIT" },
  CONFIRMED: { label: "Confirmed", status: "CONFIRMED", shipment_status: "PENDING" },
  CANCELLED: { label: "Cancelled", status: "CANCELLED", shipment_status: "CANCELLED" },
};
const STATUS_WORDS = {
  delivered: "DELIVERED",
  complete: "DELIVERED",
  completed: "DELIVERED",
  fulfilled: "DELIVERED",
  closed: "DELIVERED",
  done: "DELIVERED",
  shipped: "SHIPPED",
  intransit: "SHIPPED",
  sent: "SHIPPED",
  confirmed: "CONFIRMED",
  processing: "CONFIRMED",
  inproduction: "CONFIRMED",
  paid: "CONFIRMED",
  open: "CONFIRMED",
  unfulfilled: "CONFIRMED",
  cancelled: "CANCELLED",
  canceled: "CANCELLED",
  refunded: "CANCELLED",
  void: "CANCELLED",
  voided: "CANCELLED",
};

// A Decoration's print method, as the website and the panel show it (customization_config.print_method).
// Text that isn't one of these is shown as written (cut to 40 characters), so the website's
// decoration pill is never empty.
const PRINT_METHODS = [
  [/embroider/i, "EMBROIDERY"],
  [/screen\s*print/i, "SCREEN_PRINT"],
  [/\bdtf\b|direct\s*to\s*film/i, "DTF"],
  [/\bdtg\b|direct\s*to\s*garment/i, "DTG"],
  [/laser/i, "LASER_ENGRAVING"],
];

// The columns, in the example's order. "order": the same for every row of an order (fill it on the
// order's first row, or on every row). "line": one value per row. Headers compare without case,
// spaces or punctuation; `aliases` are other headers read as the same column.
const COLUMNS = [
  {
    key: "order_number",
    header: "Order number",
    aliases: ["Order #", "Order no", "Order ID", "Order", "Invoice", "Invoice number", "Invoice #"],
    level: "order",
    required: true,
    help: `The order's number from your old system. Rows with the same number make one order. Up to ${ORDER_NUMBER_MAX} characters; it must not be used by another order.`,
  },
  {
    key: "order_date",
    header: "Order date",
    aliases: ["Date", "Created at", "Created", "Placed at", "Order placed", "Paid at", "Date ordered"],
    level: "order",
    required: true,
    help: "When it was ordered: YYYY-MM-DD (2025-03-14) or MM/DD/YYYY (03/14/2025). A time after it is kept.",
  },
  {
    key: "product_name",
    header: "Product name",
    aliases: ["Product", "Item", "Item name", "Product title", "Lineitem name", "Description"],
    level: "line",
    required: true,
    help: "The product's name exactly as in your Products list (capitals don't matter). A name we don't have is a problem.",
  },
  {
    key: "color",
    header: "Color",
    aliases: ["Colour", "Variant color", "Item color"],
    level: "line",
    required: false,
    help: "The colour, as the product lists it. Needed when the product comes in more than one.",
  },
  {
    key: "size",
    header: "Size",
    aliases: ["Variant size", "Item size"],
    level: "line",
    required: false,
    help: "The size, as the product lists it. Needed when the product comes in more than one.",
  },
  {
    key: "sku",
    header: "SKU",
    aliases: ["Variant SKU", "Item SKU", "Lineitem sku"],
    level: "line",
    required: false,
    help: "Instead of Color and Size: the SKU of the exact colour/size.",
  },
  {
    key: "quantity",
    header: "Quantity",
    aliases: ["Qty", "Units", "Lineitem quantity", "Quantity ordered"],
    level: "line",
    required: true,
    help: "How many, a whole number.",
  },
  {
    key: "unit_price",
    header: "Unit price",
    aliases: ["Price", "Price each", "Item price", "Rate", "Lineitem price", "Price per item"],
    level: "line",
    required: true,
    help: "What one item cost, in dollars, decoration included. Or give Line total instead.",
  },
  {
    key: "line_total",
    header: "Line total",
    aliases: ["Line amount", "Amount", "Item total", "Total price"],
    level: "line",
    required: false,
    help: "Quantity × unit price. Optional: it's checked against them, or used to work out the unit price.",
  },
  {
    key: "decoration",
    header: "Decoration",
    aliases: ["Customization", "Customisation", "Print method", "Imprint", "Decoration method"],
    level: "line",
    required: false,
    help: "Optional. How it was decorated, e.g. Embroidery left chest. Embroidery, Screen print, DTF, DTG and Laser show as the print method.",
  },
  {
    key: "status",
    header: "Status",
    aliases: ["Order status", "Fulfillment status", "Fulfilment status"],
    level: "order",
    required: false,
    help: "Delivered (when empty), Shipped, Confirmed or Cancelled.",
  },
  {
    key: "payment_method",
    header: "Payment method",
    aliases: ["Paid with", "Payment", "Payment type", "Payment gateway"],
    level: "order",
    required: false,
    help: "Optional, e.g. Card, Check, Invoice. Empty: Imported.",
  },
  {
    key: "shipping",
    header: "Shipping",
    aliases: ["Shipping cost", "Shipping amount", "Shipping fee", "Freight", "Delivery"],
    level: "order",
    required: false,
    help: "What the order's shipping cost, in dollars. Empty: 0.",
  },
  {
    key: "tax",
    header: "Tax",
    aliases: ["Tax amount", "Sales tax", "Taxes"],
    level: "order",
    required: false,
    help: "The order's tax, in dollars. Empty: 0.",
  },
  {
    key: "order_total",
    header: "Order total",
    aliases: ["Total", "Grand total", "Order amount"],
    level: "order",
    required: false,
    help: "Optional check: must equal the lines plus shipping and tax.",
  },
  {
    key: "tracking_number",
    header: "Tracking number",
    aliases: ["Tracking", "Tracking #", "Tracking no"],
    level: "order",
    required: false,
    help: "Optional.",
  },
  {
    key: "ship_to_name",
    header: "Ship to name",
    aliases: ["Shipping name", "Recipient", "Ship to"],
    level: "order",
    required: false,
    help: "Optional, like the rest of the address.",
  },
  {
    key: "ship_to_address_line1",
    header: "Address",
    aliases: ["Address 1", "Address line 1", "Street", "Shipping address", "Shipping address 1", "Shipping address1"],
    level: "order",
    required: false,
    help: "Optional: where it shipped.",
  },
  {
    key: "ship_to_address_line2",
    header: "Address 2",
    aliases: ["Address line 2", "Suite", "Apt", "Shipping address 2", "Shipping address2"],
    level: "order",
    required: false,
    help: "Optional.",
  },
  { key: "ship_to_city", header: "City", aliases: ["Shipping city", "Town"], level: "order", required: false, help: "Optional." },
  {
    key: "ship_to_state",
    header: "State",
    aliases: ["Shipping state", "Province", "Shipping province", "Region"],
    level: "order",
    required: false,
    help: "Optional.",
  },
  {
    key: "ship_to_postal_code",
    header: "ZIP",
    aliases: ["ZIP code", "Postal code", "Postcode", "Shipping zip", "Shipping postal code"],
    level: "order",
    required: false,
    help: "Optional.",
  },
  { key: "ship_to_country", header: "Country", aliases: ["Shipping country"], level: "order", required: false, help: "Optional." },
  { key: "ship_to_phone", header: "Phone", aliases: ["Shipping phone", "Phone number"], level: "order", required: false, help: "Optional." },
  {
    key: "product_id",
    header: "Product ID",
    aliases: ["Product #"],
    level: "line",
    required: false,
    help: "Only when two of our products share a name: our product number, shown on the product's page in the panel.",
  },
];

const COLUMN_BY_KEY = Object.fromEntries(COLUMNS.map((column) => [column.key, column]));
const ORDER_KEYS = COLUMNS.filter((column) => column.level === "order" && column.key !== "order_number").map((c) => c.key);
const SHIP_TO_KEYS = ORDER_KEYS.filter((key) => key.startsWith("ship_to_"));
const headerKey = (text) => String(text ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const HEADER_LOOKUP = new Map(COLUMNS.flatMap((column) => [column.header, ...column.aliases].map((h) => [headerKey(h), column.key])));

const clean = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
const short = (value, max = 40) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);
const lengthOf = (value) => Array.from(value).length;
const money = (n) => `$${Number(n).toFixed(2)}`;
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const listOf = (values, max = 12) =>
  values.length > max ? `${values.slice(0, max).join(", ")} and ${values.length - max} more` : values.join(", ");

// Names compare like the panel shows them: entities decoded, without case, ™/®/©, curly quotes or
// extra spaces. Each product is found by its stored name and by its name as shown.
const nameKey = (value) =>
  he
    .decode(String(value ?? ""))
    // Before NFKC, which would turn ™ into "TM".
    .replace(/[™®©]/g, "")
    .normalize("NFKC")
    .replace(/[‘’`]/g, "'")
    .replace(/[“”]/g, '"')
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
const optionKey = (value) => nameKey(value).replace(/\s*\/\s*/g, "/");

// Order numbers compare without case, spaces around them or a leading "#".
const orderNumberOf = (raw) => clean(raw).replace(/^#+\s*/, "");
const orderKey = (raw) => orderNumberOf(raw).toLowerCase();

// "1,000" → 1000. Not a whole number above 0 → null.
const wholeNumber = (raw) => {
  const text = raw.replace(/[,\s]/g, "");
  if (!/^\d+(\.0+)?$/.test(text)) return null;
  const n = Number(text);
  return n > 0 && Number.isSafeInteger(n) ? n : null;
};

// "$1,234.50" → 1234.5. 0 is allowed. Not an amount → null.
const dollars = (raw) => {
  const text = raw.replace(/[$,\s]/g, "").replace(/^USD/i, "");
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 && n < 100000000 ? n : null;
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// A date, with an optional time (kept as given, read as UTC). Without a time it's noon UTC, which
// is the same day across the US. Not a date → null.
const parseDate = (raw) => {
  const text = clean(raw);
  let y;
  let m;
  let d;
  let rest = "";
  let match;

  if ((match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s]+(.*))?$/))) {
    [, y, m, d, rest = ""] = match;
  } else if ((match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:\s+(.*))?$/))) {
    [, m, d, y, rest = ""] = match;
    if (y.length === 2) y = `20${y}`;
  } else if ((match = text.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})(?:\s+(.*))?$/))) {
    const month = MONTHS.indexOf(match[1].slice(0, 3).toLowerCase());
    if (month < 0) return null;
    [y, m, d, rest] = [match[3], month + 1, match[2], match[4] || ""];
  } else if ((match = text.match(/^(\d{1,2})[\s-]([A-Za-z]{3,9})\.?[\s-](\d{4})(?:\s+(.*))?$/))) {
    const month = MONTHS.indexOf(match[2].slice(0, 3).toLowerCase());
    if (month < 0) return null;
    [y, m, d, rest] = [match[3], month + 1, match[1], match[4] || ""];
  } else {
    return null;
  }

  [y, m, d] = [Number(y), Number(m), Number(d)];
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;

  let hours = 12;
  let minutes = 0;
  let seconds = 0;
  rest = rest.replace(/(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/i, "").trim();
  if (rest) {
    const time = rest.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/);
    if (!time) return null;
    hours = Number(time[1]);
    minutes = Number(time[2]);
    seconds = Number(time[3] || 0);
    if (time[4]) {
      const pm = time[4].toLowerCase() === "pm";
      if (hours < 1 || hours > 12) return null;
      hours = (hours % 12) + (pm ? 12 : 0);
    }
    if (hours > 23 || minutes > 59 || seconds > 59) return null;
  }

  const date = new Date(Date.UTC(y, m - 1, d, hours, minutes, seconds));
  // 2025-02-31 rolls over: not a date.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
};

const dayOf = (date) => date.toISOString().slice(0, 10);

// "credit card" → CREDIT_CARD, as payment methods are stored. Empty → IMPORTED.
const paymentMethodOf = (raw) => {
  const code = clean(raw).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return (code || "IMPORTED").slice(0, PAYMENT_METHOD_MAX);
};

const printMethodOf = (text) => PRINT_METHODS.find(([pattern]) => pattern.test(text))?.[1] ?? null;

// Words in common, for "did you mean" suggestions. Each product's words are worked out once
// (loadCatalog), and each name's suggestions once per file.
const words = (value) => new Set(nameKey(value).split(/[^a-z0-9]+/).filter((w) => w.length > 1));
const suggester = (catalog) => {
  const memo = new Map();
  return (name) => {
    const key = nameKey(name);
    if (memo.has(key)) return memo.get(key);
    const wanted = words(name);
    const found = !wanted.size
      ? []
      : catalog
          .map((product) => {
            let shared = 0;
            for (const word of wanted) if (product.words.has(word)) shared += 1;
            return { product, score: shared / Math.max(wanted.size, product.words.size) };
          })
          .filter((s) => s.score >= 0.34)
          .sort((a, b) => b.score - a.score || a.product.shown.length - b.product.shown.length)
          .slice(0, 3)
          .map((s) => s.product.shown);
    memo.set(key, found);
    return found;
  };
};

// Two order-level values are the same when they mean the same: 15 and 15.00, Delivered and
// delivered.
const sameValue = (key, a, b) => {
  if (["shipping", "tax", "order_total"].includes(key)) {
    const [x, y] = [dollars(a), dollars(b)];
    if (x !== null && y !== null) return Math.abs(x - y) < 0.005;
  }
  if (key === "status") return (STATUS_WORDS[headerKey(a)] ?? a) === (STATUS_WORDS[headerKey(b)] ?? b);
  if (key === "order_date") {
    const [x, y] = [parseDate(a), parseDate(b)];
    if (x && y) return x.getTime() === y.getTime();
  }
  return a.toLowerCase() === b.toLowerCase();
};

// The client the orders are for: a live customer account.
const findClient = async (userId) => {
  if (!/^\d+$/.test(String(userId ?? ""))) throw new ApiError(httpStatus.NOT_FOUND, "Client not found.");
  const user = await User.findOne({
    where: { id: userId, role_id: config.USR_ROLE_ID, is_active: true },
    include: [{ model: Profile, as: "user_profile", attributes: ["name"] }],
    attributes: ["id", "email"],
  });
  if (!user) throw new ApiError(httpStatus.NOT_FOUND, "Client not found.");
  return { id: Number(user.id), email: user.email, name: user.user_profile?.name ?? null };
};

// Every product, found by name (stored and as shown). Deleted ones aren't ours any more.
const loadCatalog = async () => {
  const products = await Product.findAll({ attributes: ["id", "name", "supplier", "is_active"], raw: true });
  const byName = new Map();
  const byId = new Map();
  const catalog = products.map((p) => {
    const shown = decodeHtmlEntities(p.name) || p.name;
    return { ...p, id: Number(p.id), shown, words: words(shown) };
  });
  for (const product of catalog) {
    byId.set(product.id, product);
    for (const key of new Set([nameKey(product.name), nameKey(product.shown)])) {
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(product);
    }
  }
  return { catalog, byName, byId };
};

// A product's colours and sizes, loaded once per product.
const variantLoader = () => {
  const cache = new Map();
  return async (productId) => {
    if (!cache.has(productId)) {
      const variants = await ProductVariant.findAll({
        where: { product_id: productId },
        attributes: ["id", "sku", "color", "size", "supplier", "is_active", "is_discontinued"],
        include: [{ model: Size, as: "size_details", attributes: ["name"], required: false }],
      });
      cache.set(
        productId,
        variants.map((v) => ({
          id: Number(v.id),
          sku: v.sku || null,
          color: v.color || null,
          size: v.size_details?.name || v.size || null,
          supplier: v.supplier || null,
          // On sale now: preferred when a discontinued twin has the same colour and size.
          live: v.is_active !== false && !v.is_discontinued,
        })),
      );
    }
    return cache.get(productId);
  };
};

const distinct = (values) => [...new Set(values.filter(Boolean))];

// Orders that already have these numbers, deleted ones too (the number stays taken).
const ordersNumbered = async (numbers, transaction) => {
  if (!numbers.length) return new Map();
  const found = await Order.findAll({
    where: { order_number: { [Op.in]: numbers } },
    attributes: ["id", "order_number", "user_id", "imported_at", "deleted_at", "created_at"],
    paranoid: false,
    transaction,
  });
  return new Map(found.map((o) => [String(o.order_number).toLowerCase(), o]));
};

// ------------------------------------------------------------------------------------------
// Checking a file
// ------------------------------------------------------------------------------------------

// Reads and checks the file for one client. Returns { report, plan }: the report is what the admin
// sees, the plan the orders an import would create (only used when the report has no errors).
const checkFile = async (userId, file) => {
  const client = await findClient(userId);
  if (!file?.buffer?.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Choose a CSV file to upload.");
  }

  const errors = [];
  const warnings = [];
  const fail = (row, column, message) => errors.push({ row, column, message });
  const warn = (row, column, message) => warnings.push({ row, column, message });
  const byRow = (a, b) => (a.row ?? 0) - (b.row ?? 0);

  const report = ({ rows = 0, orders = [], already = [], ignored = [] } = {}) => ({
    file_name: file.originalname || null,
    client,
    summary: {
      rows,
      orders: orders.length,
      lines: orders.reduce((n, o) => n + o.lines.length, 0),
      total_amount: round2(orders.reduce((n, o) => n + o.total, 0)),
      already_imported: already.length,
      errors: errors.length,
      warnings: warnings.length,
    },
    orders,
    // Orders of this client imported before: left as they are.
    already_imported: already,
    ignored_columns: ignored,
    errors: [...errors].sort(byRow),
    warnings: [...warnings].sort(byRow),
    can_import: errors.length === 0 && orders.length > 0,
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

  const missing = ["order_number", "order_date", "product_name", "quantity"].filter((key) => !(key in columnIndex));
  if (!("unit_price" in columnIndex) && !("line_total" in columnIndex)) missing.push("unit_price");
  if (missing.length) {
    fail(
      1,
      null,
      `The first row must name the columns, with ${missing.map((k) => `"${COLUMN_BY_KEY[k].header}"`).join(", ")}. Download the example CSV to see the layout.`,
    );
    return { report: report({ ignored }), plan: null };
  }
  if (ignored.length) warn(1, null, `These columns aren't used and are skipped: ${ignored.join(", ")}.`);
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

  // Rows grouped into orders by number. The first row's spelling is the order's number.
  const groups = new Map();
  for (const row of dataRows) {
    const raw = cell(row, "order_number");
    const number = orderNumberOf(raw);
    if (!number) {
      fail(row.number, "Order number", "Add the order number. Every row needs one: rows with the same number make one order.");
      continue;
    }
    if (lengthOf(number) > ORDER_NUMBER_MAX) {
      fail(row.number, "Order number", `An order number can be at most ${ORDER_NUMBER_MAX} characters.`);
      continue;
    }
    const key = orderKey(raw);
    if (!groups.has(key)) groups.set(key, { number, rows: [] });
    groups.get(key).rows.push(row);
  }

  const { catalog, byName, byId } = await loadCatalog();
  const suggestionsFor = suggester(catalog);
  const variantsOf = variantLoader();
  const existing = await ordersNumbered([...groups.values()].map((g) => g.number));
  const now = Date.now();

  const orders = [];
  const already = [];

  for (const group of groups.values()) {
    const first = group.rows[0].number;
    const before = errors.length;

    // Order-level values: on the first row, or the same on every row that has one.
    const values = {};
    for (const key of ORDER_KEYS) {
      let seen = null;
      for (const row of group.rows) {
        const value = cell(row, key);
        if (!value) continue;
        if (!seen) {
          seen = { value, row: row.number };
        } else if (!sameValue(key, seen.value, value)) {
          fail(
            row.number,
            COLUMN_BY_KEY[key].header,
            `Order ${group.number} has "${short(seen.value)}" on row ${seen.row} and "${short(value)}" here. An order has one ${COLUMN_BY_KEY[key].header}: put it on the order's first row, or the same on every row.`,
          );
        }
      }
      values[key] = seen;
    }

    // Order date
    let date = null;
    if (!values.order_date) {
      fail(first, "Order date", `Add the date of order ${group.number}.`);
    } else {
      date = parseDate(values.order_date.value);
      if (!date) {
        fail(values.order_date.row, "Order date", `"${short(values.order_date.value)}" isn't a date. Use YYYY-MM-DD, like 2025-03-14, or MM/DD/YYYY.`);
      } else if (date.getTime() > now + 24 * 60 * 60 * 1000) {
        fail(values.order_date.row, "Order date", `${dayOf(date)} is in the future. Previous orders have happened already.`);
        date = null;
      } else if (date < EARLIEST) {
        fail(values.order_date.row, "Order date", `${dayOf(date)} is before 2000. Check the date.`);
        date = null;
      }
    }

    // Status
    let status = STATUSES.DELIVERED;
    if (values.status) {
      const code = STATUS_WORDS[headerKey(values.status.value)];
      if (!code) {
        fail(values.status.row, "Status", `"${short(values.status.value)}" isn't a status. Use Delivered, Shipped, Confirmed or Cancelled, or leave it empty for Delivered.`);
      } else {
        status = STATUSES[code];
      }
    }

    // Money: shipping, tax, and the optional total to check against
    const amount = (key) => {
      if (!values[key]) return 0;
      const n = dollars(values[key].value);
      if (n === null) {
        fail(values[key].row, COLUMN_BY_KEY[key].header, `"${short(values[key].value)}" isn't an amount in dollars, like 12.50.`);
        return 0;
      }
      return n;
    };
    const shipping = amount("shipping");
    const tax = amount("tax");
    const statedTotal = values.order_total ? amount("order_total") : null;

    // Short text values
    const text = (key, max) => {
      if (!values[key]) return null;
      if (lengthOf(values[key].value) > max) {
        fail(values[key].row, COLUMN_BY_KEY[key].header, `${COLUMN_BY_KEY[key].header} can be at most ${max} characters.`);
        return null;
      }
      return values[key].value;
    };
    const tracking = text("tracking_number", TRACKING_MAX);
    const paymentMethod = paymentMethodOf(values.payment_method?.value ?? "");
    const shipTo = Object.fromEntries(SHIP_TO_KEYS.map((key) => [key, text(key, SHIP_TO_MAX)]));
    const hasShipTo = SHIP_TO_KEYS.some((key) => shipTo[key]);

    // Lines
    const lines = [];
    for (const row of group.rows) {
      const lineBefore = errors.length;
      const productName = cell(row, "product_name");
      const productIdRaw = cell(row, "product_id");

      let product = null;
      if (productIdRaw) {
        const id = /^\d+$/.test(productIdRaw.replace(/^#/, "")) ? Number(productIdRaw.replace(/^#/, "")) : null;
        product = id ? byId.get(id) : null;
        if (!product) {
          fail(row.number, "Product ID", `There's no product ${short(productIdRaw)} in your Products list.`);
        } else if (productName && !(byName.get(nameKey(productName)) ?? []).some((p) => p.id === product.id)) {
          fail(row.number, "Product ID", `Product ${product.id} is "${short(product.shown, 60)}", not "${short(productName, 60)}". Fix one of them.`);
          product = null;
        }
      } else if (!productName) {
        fail(row.number, "Product name", "Add the product name.");
      } else {
        const matches = byName.get(nameKey(productName)) ?? [];
        if (!matches.length) {
          const like = suggestionsFor(productName);
          fail(
            row.number,
            "Product name",
            `"${short(productName, 60)}" isn't in your Products list.${like.length ? ` Did you mean ${like.map((n) => `"${short(n, 60)}"`).join(" or ")}?` : " Add it as a product first, or fix the name."}`,
          );
        } else if (matches.length > 1) {
          fail(
            row.number,
            "Product name",
            `${matches.length} products are called "${short(productName, 60)}": ${matches.map((p) => `${p.id} (${p.supplier || "manual"})`).join(", ")}. Add a Product ID column to say which.`,
          );
        } else {
          [product] = matches;
        }
      }

      // The colour/size
      let variant = null;
      if (product) {
        const variants = await variantsOf(product.id);
        const sku = cell(row, "sku");
        const color = cell(row, "color");
        const size = cell(row, "size");
        if (!variants.length) {
          fail(row.number, "Product name", `"${short(product.shown, 60)}" has no colours or sizes, so it can't be on an order.`);
        } else if (sku) {
          variant = variants.find((v) => v.sku && v.sku.toLowerCase() === sku.toLowerCase()) ?? null;
          if (!variant) fail(row.number, "SKU", `"${short(sku)}" isn't a SKU of "${short(product.shown, 60)}".`);
        } else {
          let options = variants;
          if (color) {
            options = options.filter((v) => v.color && optionKey(v.color) === optionKey(color));
            if (!options.length) {
              fail(row.number, "Color", `"${short(product.shown, 60)}" doesn't come in "${short(color)}". Its colours: ${listOf(distinct(variants.map((v) => v.color)))}.`);
            }
          }
          if (options.length && size) {
            const sized = options.filter((v) => v.size && optionKey(v.size) === optionKey(size));
            if (!sized.length) {
              fail(row.number, "Size", `"${short(product.shown, 60)}"${color ? ` in ${short(color)}` : ""} doesn't come in size "${short(size)}". Its sizes: ${listOf(distinct(options.map((v) => v.size)))}.`);
            }
            options = sized;
          }
          // Old orders can be for discontinued colours, so those count too; but when only one of
          // several matches is on sale now, it's that one.
          const live = options.filter((v) => v.live);
          if (options.length > 1 && live.length === 1 && (color || size)) options = live;
          if (options.length === 1) {
            [variant] = options;
          } else if (options.length > 1) {
            const colors = distinct(options.map((v) => v.color));
            const sizes = distinct(options.map((v) => v.size));
            const need = [colors.length > 1 && !color ? `Color (${listOf(colors, 8)})` : null, sizes.length > 1 && !size ? `Size (${listOf(sizes, 8)})` : null].filter(Boolean);
            fail(
              row.number,
              need.length ? need.map((n) => n.split(" (")[0]).join(" and ") : "SKU",
              `"${short(product.shown, 60)}" comes in ${options.length} ${need.length ? "options" : "options with the same colour and size"}: add ${need.length ? need.join(" and ") : "the SKU"} to say which.`,
            );
          }
        }
      }

      // Quantity and price
      const quantityRaw = cell(row, "quantity");
      const quantity = quantityRaw ? wholeNumber(quantityRaw) : null;
      if (!quantityRaw) fail(row.number, "Quantity", "Add the quantity.");
      else if (quantity === null) fail(row.number, "Quantity", `"${short(quantityRaw)}" isn't a whole number above 0.`);

      const unitRaw = cell(row, "unit_price");
      const totalRaw = cell(row, "line_total");
      let unit = unitRaw ? dollars(unitRaw) : null;
      let lineTotal = totalRaw ? dollars(totalRaw) : null;
      if (unitRaw && unit === null) fail(row.number, "Unit price", `"${short(unitRaw)}" isn't an amount in dollars, like 12.50.`);
      if (totalRaw && lineTotal === null) fail(row.number, "Line total", `"${short(totalRaw)}" isn't an amount in dollars, like 125.00.`);
      if (!unitRaw && !totalRaw) fail(row.number, "Unit price", "Add the unit price (or the line total).");

      if (quantity !== null && unit !== null && lineTotal !== null && Math.abs(round2(quantity * unit) - lineTotal) > 0.01) {
        fail(row.number, "Line total", `${quantity} × ${money(unit)} is ${money(round2(quantity * unit))}, not ${money(lineTotal)}.`);
      }
      if (quantity !== null && unit === null && lineTotal !== null && !unitRaw) unit = round2(lineTotal / quantity);
      if (quantity !== null && unit !== null && lineTotal === null) lineTotal = round2(quantity * unit);
      if (unit === 0) warn(row.number, "Unit price", "The price is 0: the line is recorded as free.");

      // Decoration
      const decoration = cell(row, "decoration");
      if (decoration && lengthOf(decoration) > DECORATION_MAX) {
        fail(row.number, "Decoration", `Decoration can be at most ${DECORATION_MAX} characters.`);
      }

      if (errors.length !== lineBefore || !product || !variant) continue;
      lines.push({
        row: row.number,
        product_id: product.id,
        product_name: product.shown,
        variant_id: variant.id,
        sku: variant.sku,
        color: variant.color,
        size: variant.size,
        supplier: variant.supplier || product.supplier || "MANUAL",
        quantity,
        unit_price: round2(unit),
        line_total: round2(lineTotal),
        decoration: decoration || null,
        print_method: decoration ? printMethodOf(decoration) ?? short(decoration, 40) : null,
      });
    }

    if (errors.length !== before) continue;

    const subtotal = round2(lines.reduce((n, line) => n + line.line_total, 0));
    const total = round2(subtotal + shipping + tax);
    if (statedTotal !== null && Math.abs(statedTotal - total) > 0.01) {
      fail(
        values.order_total.row,
        "Order total",
        `Order ${group.number} says ${money(statedTotal)}, but its lines (${money(subtotal)}), shipping (${money(shipping)}) and tax (${money(tax)}) come to ${money(total)}. Fix the prices, or leave Order total empty.`,
      );
      continue;
    }

    // An order number in use: this client's earlier import is listed and left as it is; anything
    // else is a problem (numbers are unique across every order).
    const taken = existing.get(group.number.toLowerCase());
    if (taken) {
      if (Number(taken.user_id) === client.id && taken.imported_at && !taken.deleted_at) {
        already.push({ order_number: taken.order_number, rows: group.rows.map((r) => r.number), order_id: Number(taken.id), date: taken.created_at });
      } else {
        fail(
          first,
          "Order number",
          Number(taken.user_id) === client.id && !taken.deleted_at
            ? `${group.number} is already the number of one of this client's website orders. Use another number.`
            : `${group.number} is already used by another order${taken.deleted_at ? " (a deleted one)" : ""}. Order numbers are unique: add a prefix, like ${short(`${(client.name || "C").replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "C"}-${group.number}`)}.`,
        );
      }
      continue;
    }

    orders.push({
      order_number: group.number,
      rows: group.rows.map((r) => r.number),
      date: date.toISOString(),
      status: status.status,
      status_label: status.label,
      shipment_status: status.shipment_status,
      payment_method: paymentMethod,
      tracking_number: tracking,
      ship_to: hasShipTo ? shipTo : null,
      subtotal,
      shipping: round2(shipping),
      tax: round2(tax),
      total,
      lines,
    });
  }

  return { report: report({ rows: dataRows.length, orders, already, ignored }), plan: orders };
};

// ------------------------------------------------------------------------------------------
// Importing, and undoing an import
// ------------------------------------------------------------------------------------------

const previewImport = async (userId, file) => (await checkFile(userId, file)).report;

// The order's columns. A ship-to keeps address_line1 ("" when the file gives none) so it reads as
// the order's own copy (utils/orderShipTo.js).
const orderValues = (order, client, batchId, now) => {
  const date = new Date(order.date);
  const shipTo = order.ship_to ? { ...order.ship_to, ship_to_address_line1: order.ship_to.ship_to_address_line1 ?? "" } : {};
  return {
    order_number: order.order_number,
    user_id: client.id,
    address_id: null,
    ...shipTo,
    subtotal_amount: order.subtotal,
    shipping_amount: order.shipping,
    handling_amount: 0,
    tax_amount: order.tax,
    // Exact, not rounded: the panel checks tax = rate × subtotal, and shows the rate rounded.
    tax_rate: order.subtotal > 0 ? (order.tax / order.subtotal) * 100 : 0,
    total_amount: order.total,
    currency: "USD",
    status: order.status,
    payment_status: "SUCCESS",
    payment_method: order.payment_method,
    shipment_status: order.shipment_status,
    tracking_number: order.tracking_number,
    shipped_at: ["DELIVERED", "SHIPPED"].includes(order.status) ? date : null,
    cancelled_at: order.status === "CANCELLED" ? date : null,
    cancel_reason: order.status === "CANCELLED" ? "Cancelled before it was imported (previous order)." : null,
    imported_at: now,
    import_batch_id: batchId,
    created_at: date,
    updated_at: now,
  };
};

// Creates every order in the file, or none. A file with problems returns { imported: false,
// report } and changes nothing.
const importOrders = async (userId, file, { adminId = null } = {}) => {
  const { report, plan } = await checkFile(userId, file);
  if (!report.can_import) return { imported: false, report };

  const client = report.client;
  const now = new Date();

  const created = await sequelize.transaction(async (transaction) => {
    // Someone may have imported or placed orders with these numbers since the check.
    const taken = await ordersNumbered(plan.map((o) => o.order_number), transaction);
    if (taken.size) {
      const numbers = [...taken.values()].map((o) => o.order_number);
      throw new ApiError(
        httpStatus.CONFLICT,
        `${numbers.join(", ")} ${numbers.length === 1 ? "was" : "were"} used by another order while importing. Nothing was imported: check the file again, then import.`,
      );
    }

    const lineCount = plan.reduce((n, o) => n + o.lines.length, 0);
    const batch = await ImportBatch.create(
      {
        source_name: `CSV_ORDER_IMPORT ${file.originalname || "file"}: client ${client.id}, admin ${adminId ?? "?"}`.slice(0, 255),
        status: "success",
        total_records: lineCount,
        processed_records: lineCount,
      },
      { transaction },
    );

    const out = [];
    for (const order of plan) {
      // `silent` keeps the order's own date in created_at instead of now.
      const saved = await Order.create(orderValues(order, client, batch.id, now), { transaction, silent: true });
      await OrderItem.bulkCreate(
        order.lines.map((line) => ({
          order_id: saved.id,
          product_id: line.product_id,
          variant_id: line.variant_id,
          sku: line.sku,
          // As checkout stores it.
          name: line.sku || line.product_name.slice(0, 200),
          quantity: line.quantity,
          price: line.unit_price,
          total_price: line.line_total,
          supplier: line.supplier,
          shipment_status: order.status === "CANCELLED" ? "CANCELLED" : "PENDING",
          customization_config: line.decoration
            ? { imported: true, decoration: line.decoration, ...(line.print_method && { print_method: line.print_method }) }
            : null,
          pricing_snapshot: null,
          created_at: new Date(order.date),
          updated_at: now,
        })),
        { transaction, silent: true },
      );
      out.push({
        id: Number(saved.id),
        order_number: order.order_number,
        date: order.date,
        status: order.status,
        status_label: order.status_label,
        total: order.total,
        lines: order.lines.length,
        units: order.lines.reduce((n, line) => n + line.quantity, 0),
      });
    }
    return { batchId: batch.id, orders: out };
  });

  return {
    imported: true,
    batch_id: created.batchId,
    client,
    orders: created.orders,
    already_imported: report.already_imported,
    summary: {
      orders: created.orders.length,
      lines: report.summary.lines,
      total_amount: report.summary.total_amount,
      already_imported: report.already_imported.length,
    },
    warnings: report.warnings,
  };
};

// Removes every order one import made for this client, with their lines, for good: they were only
// records, nothing was paid or shipped through them, and their numbers can be imported again.
const undoImport = async (userId, batchId, { adminId = null } = {}) => {
  const client = await findClient(userId);
  if (!/^[0-9a-f-]{36}$/i.test(String(batchId ?? ""))) throw new ApiError(httpStatus.NOT_FOUND, "Import not found.");

  return sequelize.transaction(async (transaction) => {
    const orders = await Order.findAll({
      where: { import_batch_id: batchId, user_id: client.id, imported_at: { [Op.ne]: null } },
      attributes: ["id", "order_number"],
      paranoid: false,
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!orders.length) throw new ApiError(httpStatus.NOT_FOUND, "Nothing left of that import to undo.");

    const ids = orders.map((o) => o.id);
    await OrderItem.destroy({ where: { order_id: ids }, force: true, transaction });
    await Order.destroy({ where: { id: ids }, force: true, transaction });
    await ImportBatch.update(
      { error_message: `Undone by admin ${adminId ?? "?"} on ${new Date().toISOString()}: ${ids.length} orders removed.` },
      { where: { id: batchId }, transaction },
    );
    return { removed: ids.length, order_numbers: orders.map((o) => o.order_number) };
  });
};

// ------------------------------------------------------------------------------------------
// The layout, for the upload page
// ------------------------------------------------------------------------------------------

// A product from your own catalog with a colour and a size, so the example checks clean. A
// fallback name when the catalog has none.
const exampleProducts = async () => {
  const pick = async (where) => {
    const variant = await ProductVariant.findOne({
      where,
      attributes: ["id", "sku", "color", "size", "product_id"],
      include: [
        { model: Size, as: "size_details", attributes: ["name"], required: false },
        { model: Product, as: "product", attributes: ["id", "name"], required: true },
      ],
      order: [["id", "ASC"]],
    });
    return variant
      ? { name: decodeHtmlEntities(variant.product.name) || variant.product.name, color: variant.color || "", size: variant.size_details?.name || variant.size || "" }
      : null;
  };
  const apparel = await pick({ color: { [Op.ne]: null }, size_id: { [Op.ne]: null } }).catch(() => null);
  return {
    apparel: apparel ?? { name: "Gildan Heavy Cotton T-Shirt", color: "Black", size: "L" },
  };
};

const exampleRows = (apparel) => {
  const blank = Object.fromEntries(COLUMNS.map((c) => [c.key, ""]));
  const row = (values) => COLUMNS.map((c) => ({ ...blank, ...values })[c.key]);
  return [
    COLUMNS.map((c) => c.header),
    row({ order_number: "SAMPLE-1001", order_date: "2025-03-14", product_name: apparel.name, color: apparel.color, size: apparel.size, quantity: "24", unit_price: "18.50", line_total: "444.00", decoration: "Embroidery, left chest", status: "Delivered", payment_method: "Card", shipping: "15.00", tax: "54.95", order_total: "735.95", tracking_number: "1Z999AA10123456784", ship_to_name: "Acme Roofing", ship_to_address_line1: "4027 Main St", ship_to_city: "Katy", ship_to_state: "TX", ship_to_postal_code: "77494", ship_to_country: "US" }),
    row({ order_number: "SAMPLE-1001", product_name: apparel.name, color: apparel.color, size: apparel.size, quantity: "12", unit_price: "18.50", line_total: "222.00", decoration: "Embroidery, left chest" }),
    row({ order_number: "SAMPLE-1002", order_date: "06/02/2025", product_name: apparel.name, color: apparel.color, size: apparel.size, quantity: "50", unit_price: "9.75", status: "Shipped", payment_method: "Invoice" }),
  ];
};

const getImportFormat = async (userId) => {
  const client = await findClient(userId);
  const { apparel } = await exampleProducts();
  const example = exampleRows(apparel);
  return {
    client,
    columns: COLUMNS.map(({ key, header, required, level, help }) => ({ key, header, required, level, help })),
    statuses: Object.values(STATUSES).map((s) => s.label),
    limits: { max_rows: MAX_FILE_ROWS, max_file_mb: MAX_FILE_MB, order_number_max: ORDER_NUMBER_MAX },
    example_file_name: "previous-orders-example.csv",
    example_csv: toCsv(example),
    example_rows: example,
    template_csv: toCsv([COLUMNS.map((c) => c.header)]),
  };
};

module.exports = { getImportFormat, previewImport, importOrders, undoImport, MAX_FILE_ROWS, parseDate };
