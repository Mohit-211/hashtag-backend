/** @format */

// The admin panel's Dashboard: sales, orders and customers for a date range, and the work
// waiting for the team. Read-only. docs/admin-panel-changes.md#2026-11-19-dashboard lists the
// endpoints and their answers.
//
// Every figure follows the same rules:
// - A sale is a paid order (payment_status SUCCESS) that isn't cancelled, counted on the day it
//   was placed (orders.created_at). Paid orders that were cancelled are reported apart: cancelling
//   doesn't refund (orderAdmin.service.js), so the team refunds them by hand.
// - A range is whole days, both ends included, on the store's clock (STORE_TIMEZONE) whoever is
//   looking. It is compared with the period of the same length just before it.
// - Deleted rows don't count (every table here is paranoid).

const httpStatus = require("http-status");
const { QueryTypes } = require("sequelize");
const sequelize = require("../../config/central.db");
const config = require("../../config/config");
const ApiError = require("../../utils/ApiError");

// The store's clock: Texas, where its 8.25% sales tax comes from.
const STORE_TIMEZONE = "America/Chicago";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MAX_DAYS = 731;
const MAX_BUCKETS = 400;

// ---------------------------------------------------------------- days on the store's clock
// A day is a whole number: days since 1970-01-01 for that calendar date, whatever the zone.

const dayNumber = (year, month, day) => Date.UTC(year, month - 1, day) / DAY_MS;
const isoDay = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);
const dayParts = (n) => {
  const d = new Date(n * DAY_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, weekday: (d.getUTCDay() + 6) % 7 }; // 0 = Monday
};
const firstOfMonth = (n) => dayNumber(dayParts(n).year, dayParts(n).month, 1);
const addMonths = (n, months) => dayNumber(dayParts(n).year, dayParts(n).month + months, 1);
const firstOfYear = (n) => dayNumber(dayParts(n).year, 1, 1);

const parseDay = (text) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [year, month, day] = text.split("-").map(Number);
  const n = dayNumber(year, month, day);
  return isoDay(n) === text ? n : null;
};

const clock = new Intl.DateTimeFormat("en-US", {
  timeZone: STORE_TIMEZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

// What the store's clock shows at an instant, written as if that wall time were UTC.
const storeWall = (ms) => {
  const p = {};
  for (const { type, value } of clock.formatToParts(new Date(ms))) p[type] = Number(value);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
};

// The instant the store's clock shows a wall time (written as UTC). Twice, for daylight saving.
const instantAt = (wall) => {
  let ms = wall - (storeWall(wall) - wall);
  ms = wall - (storeWall(ms) - ms);
  return ms;
};

const todayNumber = () => Math.floor(storeWall(Date.now()) / DAY_MS);

// ---------------------------------------------------------------- the range

const PRESETS = {
  today: (t) => [t, t],
  yesterday: (t) => [t - 1, t - 1],
  last_7_days: (t) => [t - 6, t],
  last_30_days: (t) => [t - 29, t],
  last_90_days: (t) => [t - 89, t],
  this_month: (t) => [firstOfMonth(t), t],
  last_month: (t) => [addMonths(t, -1), firstOfMonth(t) - 1],
  this_year: (t) => [firstOfYear(t), t],
  last_12_months: (t) => [t - 364, t],
};
const DEFAULT_PRESET = "last_30_days";

// `range` (a preset) or `from` and `to` (YYYY-MM-DD, both included).
const resolveRange = (query = {}) => {
  const today = todayNumber();
  let from;
  let to;
  let preset = null;

  if (query.from || query.to) {
    from = parseDay(String(query.from || ""));
    to = parseDay(String(query.to || ""));
    if (from === null || to === null) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Send both from and to, as dates written YYYY-MM-DD.");
    }
    if (from > to) throw new ApiError(httpStatus.BAD_REQUEST, "from must be on or before to.");
    // A day that hasn't begun on the store's clock yet (the viewer can be ahead of it) is today.
    to = Math.min(to, today);
    from = Math.min(from, to);
  } else {
    preset = String(query.range || DEFAULT_PRESET);
    if (!Object.prototype.hasOwnProperty.call(PRESETS, preset)) {
      throw new ApiError(httpStatus.BAD_REQUEST, `range must be one of: ${Object.keys(PRESETS).join(", ")}.`);
    }
    [from, to] = PRESETS[preset](today);
  }

  const days = to - from + 1;
  if (days > MAX_DAYS) {
    throw new ApiError(httpStatus.BAD_REQUEST, `A range can be at most ${MAX_DAYS} days.`);
  }
  return { preset, from, to, days, prevFrom: from - days, prevTo: from - 1, today };
};

const describeRange = (r) => ({
  preset: r.preset,
  from: isoDay(r.from),
  to: isoDay(r.to),
  days: r.days,
  previous: { from: isoDay(r.prevFrom), to: isoDay(r.prevTo) },
  timezone: STORE_TIMEZONE,
  // Today's figures are still growing.
  includes_today: r.to === r.today,
});

// Instants for whole days [fromDay, toDay] on the store's clock, for SQL.
const span = (fromDay, toDay) => ({
  start: new Date(instantAt(fromDay * DAY_MS)),
  end: new Date(instantAt((toDay + 1) * DAY_MS)),
});

// ---------------------------------------------------------------- SQL

const select = (sql, replacements = {}) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });

// A sale: paid, not cancelled. `alias` is the orders table.
// A sale on the website: paid, not cancelled, and not a previous order imported from a CSV file.
const sale = (alias) =>
  `${alias}.deleted_at IS NULL AND ${alias}.payment_status = 'SUCCESS' AND ${alias}.status <> 'CANCELLED' AND ${alias}.imported_at IS NULL`;
const SALE = sale("o");
const placed = (column) => `${column} >= :start AND ${column} < :end`;

// Customers are the users table; admins have their own. The role is checked when .env names it.
const customerRole = () => (config.USR_ROLE_ID ? "AND u.role_id = :role" : "");
const withRole = (replacements) => ({ ...replacements, role: Number(config.USR_ROLE_ID) || 0 });

const num = (value) => Number(value) || 0;
const money = (value) => Math.round(num(value) * 100) / 100;
const ratio = (part, whole) => (whole ? part / whole : null);
// The change from the previous period, as a fraction (0.25 = +25%). Null when there was nothing to compare.
const change = (now, before) => (before ? (now - before) / before : null);
const metric = (now, before, round = (x) => x) => ({
  value: round(now),
  previous: round(before),
  change: change(now, before),
});

const SUPPLIERS = { SS: "S&S Activewear", SANMAR: "SanMar", SAGE: "SAGE", OTTOCAP: "Otto Cap", MANUAL: "Manual" };
const supplierLabel = (code) => SUPPLIERS[code] || code || "Unknown";

const PAYMENT_METHODS = {
  CARD: "Card",
  CREDIT_CARD: "Credit card",
  DEBIT_CARD: "Debit card",
  GOOGLE_PAY: "Google Pay",
  APPLE_PAY: "Apple Pay",
  CASH_APP: "Cash App",
  PAYPAL: "PayPal",
  AFTERPAY: "Afterpay",
  ACH: "Bank transfer (ACH)",
  BANK_ACCOUNT: "Bank account",
  UNKNOWN: "Not recorded",
};

// ---------------------------------------------------------------- overview

const salesTotals = async (win) => {
  const [[orders], [items], [signups]] = await Promise.all([
    select(
      `SELECT COUNT(*) AS orders,
              COALESCE(SUM(o.total_amount), 0) AS sales,
              COALESCE(SUM(o.subtotal_amount), 0) AS product_sales,
              COALESCE(SUM(o.shipping_amount), 0) AS shipping,
              COALESCE(SUM(o.handling_amount), 0) AS handling,
              COALESCE(SUM(o.tax_amount), 0) AS tax,
              COALESCE(SUM(CASE WHEN o.label_id IS NOT NULL THEN o.actual_shipping_cost END), 0) AS label_cost,
              COALESCE(SUM(CASE WHEN o.label_id IS NOT NULL THEN o.shipping_amount END), 0) AS shipping_labelled,
              COUNT(DISTINCT o.user_id) AS customers
         FROM orders o
        WHERE ${SALE} AND ${placed("o.created_at")}`,
      win,
    ),
    select(
      `SELECT COALESCE(SUM(oi.quantity), 0) AS items
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id AND oi.deleted_at IS NULL
        WHERE ${SALE} AND ${placed("o.created_at")}`,
      win,
    ),
    select(
      `SELECT COUNT(*) AS customers
         FROM users u
        WHERE u.deleted_at IS NULL ${customerRole()} AND ${placed("u.created_at")}`,
      withRole(win),
    ),
  ]);

  return {
    orders: num(orders.orders),
    sales: num(orders.sales),
    product_sales: num(orders.product_sales),
    shipping: num(orders.shipping),
    handling: num(orders.handling),
    tax: num(orders.tax),
    label_cost: num(orders.label_cost),
    shipping_labelled: num(orders.shipping_labelled),
    customers: num(orders.customers),
    items: num(items.items),
    new_customers: num(signups.customers),
  };
};

// GET admin/dashboard/overview
const getOverview = async (query) => {
  const range = resolveRange(query);
  const current = span(range.from, range.to);
  const previous = span(range.prevFrom, range.prevTo);

  const [now, before, statuses, methods, [cancelled]] = await Promise.all([
    salesTotals(current),
    salesTotals(previous),
    // Every order placed in the range, whatever happened to it. PENDING is the old PENDING_PAYMENT.
    select(
      `SELECT CASE WHEN o.status = 'PENDING' THEN 'PENDING_PAYMENT' ELSE o.status END AS status,
              COUNT(*) AS orders,
              COALESCE(SUM(o.total_amount), 0) AS amount,
              SUM(o.payment_status = 'SUCCESS') AS paid
         FROM orders o
        WHERE o.deleted_at IS NULL AND o.imported_at IS NULL AND ${placed("o.created_at")}
        GROUP BY 1`,
      current,
    ),
    select(
      `SELECT COALESCE(NULLIF(o.payment_method, ''), 'UNKNOWN') AS method,
              COUNT(*) AS orders,
              COALESCE(SUM(o.total_amount), 0) AS amount
         FROM orders o
        WHERE ${SALE} AND ${placed("o.created_at")}
        GROUP BY 1
        ORDER BY amount DESC`,
      current,
    ),
    select(
      `SELECT COUNT(*) AS orders, COALESCE(SUM(o.total_amount), 0) AS amount
         FROM orders o
        WHERE o.deleted_at IS NULL AND o.imported_at IS NULL AND o.payment_status = 'SUCCESS' AND o.status = 'CANCELLED'
          AND ${placed("o.created_at")}`,
      current,
    ),
  ]);

  const aov = (t) => (t.orders ? t.sales / t.orders : 0);
  const placedOrders = statuses.reduce((sum, s) => sum + num(s.orders), 0);
  const paidOrders = statuses.reduce((sum, s) => sum + num(s.paid), 0);
  const STATUS_ORDER = ["PENDING_PAYMENT", "FAILED", "CONFIRMED", "SHIPPED", "DELIVERED", "CANCELLED"];

  return {
    range: describeRange(range),
    kpis: {
      sales: metric(now.sales, before.sales, money),
      orders: metric(now.orders, before.orders),
      average_order_value: metric(aov(now), aov(before), money),
      items_sold: metric(now.items, before.items),
      customers: metric(now.customers, before.customers),
      new_customers: metric(now.new_customers, before.new_customers),
    },
    // Where the money in `sales` came from. product_sales + handling + tax + shipping = sales.
    breakdown: {
      product_sales: money(now.product_sales),
      handling: money(now.handling),
      tax: money(now.tax),
      shipping: money(now.shipping),
      total: money(now.sales),
      // The orders that have a label: what their customers paid for shipping, and what the labels
      // cost. The difference is the shipping margin so far.
      shipping_labelled: money(now.shipping_labelled),
      label_cost: money(now.label_cost),
    },
    cancelled_after_payment: { orders: num(cancelled.orders), amount: money(cancelled.amount) },
    checkouts: { placed: placedOrders, paid: paidOrders, paid_rate: ratio(paidOrders, placedOrders) },
    orders_by_status: statuses
      .map((s) => ({ status: s.status, orders: num(s.orders), amount: money(s.amount) }))
      .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)),
    payment_methods: methods.map((m) => ({
      method: m.method,
      label: PAYMENT_METHODS[m.method] || m.method,
      orders: num(m.orders),
      amount: money(m.amount),
      share: ratio(num(m.amount), now.sales),
    })),
  };
};

// ---------------------------------------------------------------- trend

const INTERVALS = ["hour", "day", "week", "month"];
const autoInterval = (days) => (days <= 2 ? "hour" : days <= 62 ? "day" : days <= 210 ? "week" : "month");

// The buckets of a range: [startWall, endWall) wall times, clipped to the range.
const bucketsFor = (from, to, interval) => {
  const out = [];
  if (interval === "hour") {
    for (let d = from; d <= to; d++) {
      for (let h = 0; h < 24; h++) out.push([d * DAY_MS + h * HOUR_MS, d * DAY_MS + (h + 1) * HOUR_MS]);
    }
    return out;
  }
  let d = from;
  while (d <= to) {
    let next;
    if (interval === "day") next = d + 1;
    else if (interval === "week") next = d + (7 - dayParts(d).weekday); // the next Monday
    else next = addMonths(d, 1);
    const end = Math.min(next, to + 1);
    out.push([d * DAY_MS, end * DAY_MS]);
    d = end;
  }
  return out;
};

// Sums per 15 minutes (UTC), which every time zone's hours line up with.
const slotSql = (column) =>
  `DATE_FORMAT(${column}, '%Y-%m-%d %H:00:00') AS hour_start, FLOOR(MINUTE(${column}) / 15) AS quarter`;
const slotInstant = (row) => Date.parse(`${row.hour_start.replace(" ", "T")}Z`) + num(row.quarter) * 15 * 60 * 1000;

const labelFor = (startWall, endWall, interval) => {
  const iso = new Date(startWall).toISOString();
  const lastDay = isoDay(Math.floor((endWall - 1) / DAY_MS));
  return interval === "hour"
    ? { label: `${iso.slice(0, 10)} ${iso.slice(11, 16)}`, from: iso.slice(0, 10), to: iso.slice(0, 10) }
    : { label: iso.slice(0, 10), from: iso.slice(0, 10), to: lastDay };
};

// GET admin/dashboard/trend
const getTrend = async (query) => {
  const range = resolveRange(query);
  const interval = query.interval ? String(query.interval) : autoInterval(range.days);
  if (!INTERVALS.includes(interval)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `interval must be one of: ${INTERVALS.join(", ")}.`);
  }
  const walls = bucketsFor(range.from, range.to, interval);
  if (walls.length > MAX_BUCKETS) {
    throw new ApiError(httpStatus.BAD_REQUEST, `That's ${walls.length} points; pick a longer interval (at most ${MAX_BUCKETS}).`);
  }

  // Each bucket and its twin in the previous period, the same length earlier.
  const shift = range.days * DAY_MS;
  const buckets = walls.map(([startWall, endWall]) => ({
    ...labelFor(startWall, endWall, interval),
    start: instantAt(startWall),
    end: instantAt(endWall),
    sales: 0,
    orders: 0,
    items: 0,
    new_customers: 0,
    previous: {
      ...labelFor(startWall - shift, endWall - shift, interval),
      start: instantAt(startWall - shift),
      end: instantAt(endWall - shift),
      sales: 0,
      orders: 0,
      items: 0,
      new_customers: 0,
    },
  }));

  const win = { start: new Date(buckets[0].previous.start), end: new Date(buckets[buckets.length - 1].end) };
  const [orderSlots, itemSlots, userSlots] = await Promise.all([
    select(
      `SELECT ${slotSql("o.created_at")}, COUNT(*) AS orders, COALESCE(SUM(o.total_amount), 0) AS sales
         FROM orders o
        WHERE ${SALE} AND ${placed("o.created_at")}
        GROUP BY hour_start, quarter`,
      win,
    ),
    select(
      `SELECT ${slotSql("o.created_at")}, COALESCE(SUM(oi.quantity), 0) AS items
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id AND oi.deleted_at IS NULL
        WHERE ${SALE} AND ${placed("o.created_at")}
        GROUP BY hour_start, quarter`,
      win,
    ),
    select(
      `SELECT ${slotSql("u.created_at")}, COUNT(*) AS customers
         FROM users u
        WHERE u.deleted_at IS NULL ${customerRole()} AND ${placed("u.created_at")}
        GROUP BY hour_start, quarter`,
      withRole(win),
    ),
  ]);

  // The bucket (current or previous) an instant falls in.
  const find = (ms) => {
    for (const b of buckets) {
      if (ms >= b.start && ms < b.end) return b;
      if (ms >= b.previous.start && ms < b.previous.end) return b.previous;
    }
    return null;
  };
  const add = (rows, apply) => {
    for (const row of rows) {
      const bucket = find(slotInstant(row));
      if (bucket) apply(bucket, row);
    }
  };
  add(orderSlots, (b, row) => {
    b.orders += num(row.orders);
    b.sales += num(row.sales);
  });
  add(itemSlots, (b, row) => {
    b.items += num(row.items);
  });
  add(userSlots, (b, row) => {
    b.new_customers += num(row.customers);
  });

  const finish = (b) => ({
    label: b.label,
    from: b.from,
    to: b.to,
    sales: money(b.sales),
    orders: b.orders,
    items: b.items,
    average_order_value: money(b.orders ? b.sales / b.orders : 0),
    new_customers: b.new_customers,
  });

  const now = Date.now();
  return {
    range: describeRange(range),
    interval,
    buckets: buckets.map((b) => ({
      ...finish(b),
      // Later today, on an hourly chart: nothing can have happened yet.
      upcoming: b.start > now,
      // Under way now: its figures are still growing.
      partial: b.start <= now && now < b.end,
      previous: finish(b.previous),
    })),
  };
};

// ---------------------------------------------------------------- top products, suppliers, categories

const TOP_BY = ["product", "supplier", "grand_category"];
const TOP_SORT = { revenue: "revenue", units: "units" };

// GET admin/dashboard/top
const getTop = async (query) => {
  const range = resolveRange(query);
  const by = String(query.by || "product");
  const sort = String(query.sort || "revenue");
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 50);
  if (!TOP_BY.includes(by)) throw new ApiError(httpStatus.BAD_REQUEST, `by must be one of: ${TOP_BY.join(", ")}.`);
  if (!TOP_SORT[sort]) throw new ApiError(httpStatus.BAD_REQUEST, "sort must be revenue or units.");

  const win = span(range.from, range.to);
  // The lines of the range's sales.
  const itemsFrom = "FROM orders o JOIN order_items oi ON oi.order_id = o.id AND oi.deleted_at IS NULL";
  const itemsWhere = `WHERE ${SALE} AND ${placed("o.created_at")}`;
  const items = `${itemsFrom} ${itemsWhere}`;

  const [total] = await select(
    `SELECT COALESCE(SUM(oi.total_price), 0) AS revenue, COALESCE(SUM(oi.quantity), 0) AS units ${items}`,
    win,
  );
  const totals = { revenue: money(total.revenue), units: num(total.units) };
  const share = (row) => ({ ...row, share: ratio(sort === "units" ? row.units : row.revenue, totals[sort]) });
  const order = `ORDER BY ${TOP_SORT[sort]} DESC, revenue DESC`;

  let rows;
  let overlaps = false;
  if (by === "product") {
    // The product's name today: an order line's own name is the variant's SKU
    // (order.service.js), kept only for a product that no longer exists.
    const found = await select(
      `SELECT oi.product_id AS id, COALESCE(MAX(p.name), MAX(oi.name)) AS name, MAX(oi.supplier) AS supplier,
              SUM(oi.quantity) AS units, SUM(oi.total_price) AS revenue, COUNT(DISTINCT o.id) AS orders
       ${itemsFrom}
       LEFT JOIN products p ON p.id = oi.product_id
       ${itemsWhere}
       GROUP BY oi.product_id
       ${order}
       LIMIT :limit`,
      { ...win, limit },
    );
    // The product's main picture, when it still has one.
    const ids = found.map((r) => r.id);
    const pictures = ids.length
      ? await select(
          `SELECT a.product_id, a.file_uri
             FROM product_attachments a
            WHERE a.deleted_at IS NULL AND a.product_id IN (:ids)
            ORDER BY a.is_primary DESC, a.id ASC`,
          { ids },
        )
      : [];
    const pictureOf = new Map();
    for (const p of pictures) if (!pictureOf.has(String(p.product_id))) pictureOf.set(String(p.product_id), p.file_uri);
    rows = found.map((r) => ({
      id: Number(r.id),
      name: r.name,
      supplier: r.supplier,
      supplier_label: supplierLabel(r.supplier),
      image: pictureOf.get(String(r.id)) || null,
      units: num(r.units),
      revenue: money(r.revenue),
      orders: num(r.orders),
    }));
  } else if (by === "supplier") {
    const found = await select(
      `SELECT oi.supplier AS id, SUM(oi.quantity) AS units, SUM(oi.total_price) AS revenue, COUNT(DISTINCT o.id) AS orders
       ${items}
       GROUP BY oi.supplier
       ${order}
       LIMIT :limit`,
      { ...win, limit },
    );
    rows = found.map((r) => ({
      id: r.id,
      name: supplierLabel(r.id),
      units: num(r.units),
      revenue: money(r.revenue),
      orders: num(r.orders),
    }));
  } else {
    // A product counts in every grand category it's in today: supplier category › parent category
    // › grand category, none of them deleted. A product in none counts once, under id null.
    const found = await select(
      `SELECT t.grand_id AS id, MAX(g.title) AS name,
              SUM(t.quantity) AS units, SUM(t.total_price) AS revenue, COUNT(DISTINCT t.order_id) AS orders
         FROM (
               SELECT oi.order_id, oi.quantity, oi.total_price, pg.grand_id
               ${itemsFrom}
                 LEFT JOIN (
                       SELECT DISTINCT pcm.product_id, gm.grand_category_id AS grand_id
                         FROM product_category_mapping pcm
                         JOIN product_categories sc ON sc.id = pcm.product_category_id AND sc.deleted_at IS NULL
                         JOIN parent_category_mapping pm ON pm.product_category_id = pcm.product_category_id AND pm.deleted_at IS NULL
                         JOIN parent_categories pc ON pc.id = pm.parent_category_id AND pc.deleted_at IS NULL
                         JOIN grand_category_mapping gm ON gm.parent_category_id = pm.parent_category_id AND gm.deleted_at IS NULL
                         JOIN grand_categories gc ON gc.id = gm.grand_category_id AND gc.deleted_at IS NULL
                        WHERE pcm.deleted_at IS NULL
                          AND pcm.product_id IN (
                                SELECT si.product_id
                                  FROM orders so
                                  JOIN order_items si ON si.order_id = so.id AND si.deleted_at IS NULL
                                 WHERE ${sale("so")} AND ${placed("so.created_at")})
                      ) pg ON pg.product_id = oi.product_id
               ${itemsWhere}
              ) t
         LEFT JOIN grand_categories g ON g.id = t.grand_id
        GROUP BY t.grand_id
        ${order}
        LIMIT :limit`,
      { ...win, limit },
    );
    rows = found.map((r) => ({
      id: r.id === null ? null : Number(r.id),
      name: r.id === null ? "Not in a grand category" : r.name || `Grand category ${r.id}`,
      units: num(r.units),
      revenue: money(r.revenue),
      orders: num(r.orders),
    }));
    overlaps = rows.reduce((sum, r) => sum + r.revenue, 0) > totals.revenue + 0.005;
  }

  const listed = rows.reduce((acc, r) => ({ revenue: acc.revenue + r.revenue, units: acc.units + r.units }), {
    revenue: 0,
    units: 0,
  });

  return {
    range: describeRange(range),
    by,
    sort,
    totals,
    rows: rows.map(share),
    // The part of the totals not in `rows` (beyond the limit). Zero when categories overlap.
    others: overlaps
      ? null
      : { revenue: money(Math.max(totals.revenue - listed.revenue, 0)), units: Math.max(totals.units - listed.units, 0) },
    // True when a product sits in several grand categories, so the rows add up to more than the totals.
    overlaps,
  };
};

// ---------------------------------------------------------------- customers

// GET admin/dashboard/customers
const getCustomers = async (query) => {
  const range = resolveRange(query);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 8, 1), 50);
  const win = span(range.from, range.to);

  const [buyers, [registered], [ordered]] = await Promise.all([
    // Each customer who bought in the range, and when they first bought at all.
    select(
      `SELECT o.user_id,
              COUNT(*) AS orders,
              SUM(o.total_amount) AS spent,
              MAX(o.created_at) AS last_order_at,
              (SELECT MIN(p.created_at)
                 FROM orders p
                WHERE p.user_id = o.user_id AND p.deleted_at IS NULL
                  AND p.payment_status = 'SUCCESS' AND p.status <> 'CANCELLED') AS first_order_at
         FROM orders o
        WHERE ${SALE} AND ${placed("o.created_at")}
        GROUP BY o.user_id`,
      win,
    ),
    select(`SELECT COUNT(*) AS customers FROM users u WHERE u.deleted_at IS NULL ${customerRole()}`, withRole({})),
    select(`SELECT COUNT(DISTINCT o.user_id) AS customers FROM orders o WHERE ${SALE}`),
  ]);

  const rangeStart = win.start.getTime();
  const firstTime = { customers: 0, orders: 0, sales: 0 };
  const returning = { customers: 0, orders: 0, sales: 0 };
  for (const b of buyers) {
    const group = new Date(b.first_order_at).getTime() >= rangeStart ? firstTime : returning;
    group.customers += 1;
    group.orders += num(b.orders);
    group.sales += num(b.spent);
  }

  const top = [...buyers].sort((a, b) => num(b.spent) - num(a.spent)).slice(0, limit);
  const ids = top.map((b) => b.user_id);
  const people = ids.length
    ? await select(
        `SELECT u.id, u.email, u.user_name, p.name
           FROM users u
           LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL
          WHERE u.id IN (:ids)`,
        { ids },
      )
    : [];
  const person = new Map(people.map((p) => [String(p.id), p]));

  const round = (g) => ({ customers: g.customers, orders: g.orders, sales: money(g.sales) });
  return {
    range: describeRange(range),
    summary: {
      buyers: buyers.length,
      first_time: round(firstTime),
      returning: round(returning),
      returning_rate: ratio(returning.customers, buyers.length),
      registered_total: num(registered.customers),
      ordered_total: num(ordered.customers),
    },
    top: top.map((b) => {
      const p = person.get(String(b.user_id)) || {};
      return {
        user_id: Number(b.user_id),
        name: p.name || p.user_name || null,
        email: p.email || null,
        orders: num(b.orders),
        spent: money(b.spent),
        last_order_at: b.last_order_at,
        first_order_at: b.first_order_at,
        returning: new Date(b.first_order_at).getTime() < rangeStart,
      };
    }),
  };
};

// ---------------------------------------------------------------- activity: work waiting, recent orders

const UNPAID_DAYS = 7;

// The same rule as the Buy label button (orderActions.js): paid, not cancelled, no label yet.
const NO_LABEL = `${SALE} AND o.label_id IS NULL AND o.shipment_status IN ('PENDING', 'FAILED')`;

// Orders whose label waits for a decision or for the customer's approval (Approval page). They're
// counted on their own, not as orders to ship.
const HELD_FOR_APPROVAL = `EXISTS (SELECT 1 FROM order_approvals a
                                     WHERE a.order_id = o.id AND a.locked_at IS NULL
                                       AND a.hold_state IN ('PENDING_DECISION', 'HOLD'))`;

// Artwork approvals still open, by the rule that makes the customer's page read-only
// (approvalReadOnlyReason in orderActions.js): not locked for production, and the order isn't
// cancelled or with the carrier.
const OPEN_APPROVAL = `a.locked_at IS NULL AND ${SALE} AND o.status NOT IN ('SHIPPED', 'DELIVERED')
                       AND COALESCE(o.shipment_status, '')
                           NOT IN ('IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED', 'EXCEPTION')`;

// GET admin/dashboard/activity
const getActivity = async (query = {}) => {
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 8, 1), 25);
  const unpaidSince = new Date(Date.now() - UNPAID_DAYS * DAY_MS);

  const [[ship], [held], [approvals], [attention], [unpaid], sourcing, [messages], [stock], recent] = await Promise.all([
    select(
      `SELECT COUNT(*) AS orders,
              SUM(o.shipment_status = 'FAILED') AS label_failed,
              MIN(o.created_at) AS oldest_at
         FROM orders o
        WHERE ${NO_LABEL} AND NOT ${HELD_FOR_APPROVAL}`,
    ),
    select(
      `SELECT COUNT(*) AS orders, MIN(o.created_at) AS oldest_at
         FROM orders o
        WHERE ${NO_LABEL} AND ${HELD_FOR_APPROVAL}`,
    ),
    // Open approvals where it's the team's turn: the customer rejected an item (upload a new
    // version), or approved everything (lock for production).
    select(
      `SELECT SUM(a.status = 'CHANGES_REQUESTED') AS changes, SUM(a.status = 'APPROVED') AS approved
         FROM order_approvals a
         JOIN orders o ON o.id = a.order_id
        WHERE ${OPEN_APPROVAL}`,
    ),
    select(
      `SELECT COUNT(*) AS orders FROM orders o
        WHERE o.deleted_at IS NULL AND o.status <> 'CANCELLED' AND o.attention_note IS NOT NULL AND o.attention_note <> ''`,
    ),
    select(
      `SELECT COUNT(*) AS orders, COALESCE(SUM(o.total_amount), 0) AS amount FROM orders o
        WHERE o.deleted_at IS NULL AND o.payment_status <> 'SUCCESS' AND o.status IN ('PENDING', 'PENDING_PAYMENT')
          AND o.created_at >= :since`,
      { since: unpaidSince },
    ),
    select(
      `SELECT s.status, COUNT(*) AS requests FROM sourcing_requests s
        WHERE s.deleted_at IS NULL AND s.status IN ('PENDING', 'IN_REVIEW')
        GROUP BY s.status`,
    ),
    select(`SELECT COUNT(*) AS messages FROM contactus c WHERE c.deleted_at IS NULL AND c.status = 'NEW'`),
    // Manual products the website hides because no option is in stock.
    select(
      `SELECT COUNT(*) AS products FROM products p
        WHERE p.deleted_at IS NULL AND p.supplier = 'MANUAL' AND p.is_active = 1 AND COALESCE(p.is_discontinued, 0) = 0
          AND NOT EXISTS (
                SELECT 1 FROM product_variants v
                 WHERE v.product_id = p.id AND v.deleted_at IS NULL AND COALESCE(v.is_active, 1) = 1
                   AND COALESCE(v.is_discontinued, 0) = 0 AND (v.track_inventory = 0 OR v.stock > 0))`,
    ),
    select(
      `SELECT o.id, o.order_number, o.created_at, o.status, o.shipment_status, o.total_amount, o.payment_method,
              u.email, u.user_name, p.name,
              (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi
                WHERE oi.order_id = o.id AND oi.deleted_at IS NULL) AS items
         FROM orders o
         LEFT JOIN users u ON u.id = o.user_id
         LEFT JOIN profiles p ON p.user_id = o.user_id AND p.deleted_at IS NULL
        WHERE o.deleted_at IS NULL AND o.payment_status = 'SUCCESS'
        ORDER BY o.created_at DESC, o.id DESC
        LIMIT :limit`,
      { limit },
    ),
  ]);

  const sourcingCount = (status) => num((sourcing.find((s) => s.status === status) || {}).requests);
  return {
    generated_at: new Date().toISOString(),
    timezone: STORE_TIMEZONE,
    to_ship: { orders: num(ship.orders), label_failed: num(ship.label_failed), oldest_at: ship.oldest_at || null },
    waiting_for_approval: { count: num(held.orders), oldest_at: held.oldest_at || null },
    approval_changes: { count: num(approvals.changes) },
    approval_ready: { count: num(approvals.approved) },
    needs_attention: { orders: num(attention.orders) },
    unpaid_checkouts: { orders: num(unpaid.orders), amount: money(unpaid.amount), days: UNPAID_DAYS },
    sourcing_requests: { new: sourcingCount("PENDING"), in_review: sourcingCount("IN_REVIEW") },
    messages: { new: num(messages.messages) },
    out_of_stock: { manual_products: num(stock.products) },
    recent_orders: recent.map((o) => ({
      id: Number(o.id),
      order_number: o.order_number,
      created_at: o.created_at,
      status: o.status,
      shipment_status: o.shipment_status,
      payment_method: o.payment_method,
      total: money(o.total_amount),
      items: num(o.items),
      customer: { name: o.name || o.user_name || null, email: o.email || null },
    })),
  };
};

module.exports = {
  getOverview,
  getTrend,
  getTop,
  getCustomers,
  getActivity,
  // For tests.
  resolveRange,
  STORE_TIMEZONE,
};
