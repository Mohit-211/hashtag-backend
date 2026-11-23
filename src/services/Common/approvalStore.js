// The records behind an order's approval (proofs the customer approves through an emailed link;
// Orders, Approval in the admin panel): reading them, appending events and rewriting the cached
// statuses, the link's key, the payment hold and the Buy label check. orderApproval.service.js
// (the team) and approvalPublic.service.js (the customer) build on it, and shipment.service.js
// uses the hold, so this file must not require shipment.service.js or orderActions.js.

const crypto = require("crypto");
const httpStatus = require("http-status");
const { QueryTypes } = require("sequelize");

const sequelize = require("../../config/central.db");
const config = require("../../config/config");
const logger = require("../../config/logger");
const settings = require("../../config/settings");
const {
  Order,
  OrderItem,
  Product,
  ProductVariant,
  Size,
  User,
  Profile,
  Address,
  UserGraphic,
  OrderApproval,
  OrderApprovalLine,
  OrderApprovalFile,
  OrderApprovalEvent,
} = require("../../models");
const ApiError = require("../../utils/ApiError");
const decodeHtmlEntities = require("../../utils/decodeHtmlEntities");
const { parseJson, isManualItem } = require("../../utils/orderFormat");
const { EVENT, ACTOR, HOLD, approvalState, idOf } = require("../../utils/approvalState");
const { isCustomizedConfig, groupLines } = require("../../utils/approvalLines");

// ---------------------------------------------------------------- text

// Text for a column, cut to its size (strict mode refuses longer values) in whole characters, so
// an emoji isn't split in half.
const clip = (value, max) => {
  if (value === null || value === undefined) return null;
  const characters = [...String(value).replace(/\u0000/g, "")];
  return characters.length > max ? characters.slice(0, max).join("") : characters.join("");
};

// ---------------------------------------------------------------- the link's key

// 32 random bytes as 64 hex characters, in the link after a # (browsers don't send it to the
// server). The database keeps its SHA-256, to find the approval, and a copy encrypted with a key
// of its own derived from SETTINGS_MASTER_KEY, so Copy link and every email give the same link.
// npm run settings:rekey re-encrypts it with the settings.
const TOKEN_KEY_LABEL = "order_approvals token v1";
const TOKEN_FORMAT = /^[a-f0-9]{64}$/i;

let tokenKey = null;
const currentTokenKey = () => {
  tokenKey ||= settings.deriveKey(config.settingsMasterKey, TOKEN_KEY_LABEL);
  return tokenKey;
};

const hashToken = (token) => crypto.createHash("sha256").update(String(token).toLowerCase()).digest("hex");

const newToken = () => {
  const token = crypto.randomBytes(32).toString("hex");
  return { token_hash: hashToken(token), token_enc: settings.encrypt(token, currentTokenKey()) };
};

// The approval page's address (Settings, Website and links) with the key after a #, or null
// before the first send.
const linkOf = (approval) => {
  if (!approval?.token_enc) return null;
  const site = settings.get("APPROVAL_SITE_URL");
  if (!site) return null;
  try {
    return `${site}#${settings.decrypt(approval.token_enc, currentTokenKey())}`;
  } catch {
    logger.warn(
      `Approval ${approval.id}: its link can't be decrypted. Was SETTINGS_MASTER_KEY changed without npm run settings:rekey? Replace the link to make a new one.`,
    );
    return null;
  }
};

const LINK_GONE = "This link isn't valid any more. Please ask us for a new one.";
const linkGone = () => new ApiError(httpStatus.NOT_FOUND, LINK_GONE);

// The approval a customer's link opens: { id, order_id, token_hash }. Unknown, replaced and
// switched-off links, and links of deleted orders, all get the same 404.
const findByToken = async (token) => {
  if (typeof token !== "string" || !TOKEN_FORMAT.test(token)) throw linkGone();

  const approval = await OrderApproval.findOne({
    attributes: ["id", "order_id", "token_hash", "link_disabled_at"],
    where: { token_hash: hashToken(token) },
  });
  if (!approval || approval.link_disabled_at) throw linkGone();
  if (!(await Order.findByPk(approval.order_id, { attributes: ["id"] }))) throw linkGone();

  return { id: idOf(approval.id), order_id: idOf(approval.order_id), token_hash: approval.token_hash };
};

// ---------------------------------------------------------------- the order

// An order with what its approval shows: its items (product, colour, size and options) for the
// lines, the account's email and name, and the name on the shipping address. Deleted products,
// variants and closed accounts still belong to the order.
const loadOrder = (orderId, { items = true, transaction } = {}) =>
  Order.findByPk(orderId, {
    include: [
      ...(items
        ? [
            {
              model: OrderItem,
              as: "items",
              include: [
                { model: Product, as: "product", paranoid: false, attributes: ["id", "name"] },
                {
                  model: ProductVariant,
                  as: "variant",
                  paranoid: false,
                  attributes: ["id", "color", "meta", "supplier"],
                  include: [{ model: Size, as: "size_details", attributes: ["name"], required: false }],
                },
              ],
            },
          ]
        : []),
      {
        model: User,
        as: "user",
        attributes: ["id", "email", "deleted_at"],
        paranoid: false,
        required: false,
        include: [{ model: Profile, as: "user_profile", attributes: ["name"], required: false }],
      },
      { model: Address, as: "address", attributes: ["id", "name"], paranoid: false, required: false },
    ],
    transaction,
  });

// An order item as approvalLines.js groups it.
const normalizeItem = (item, artworkNames) => {
  const customization = parseJson(item.customization_config);
  const snapshot = parseJson(item.pricing_snapshot);
  const variant = item.variant;

  // A variant made in the admin panel keeps its options in meta.option_values (see optionsOf in
  // orderEmails.service.js); the colour goes in its own field.
  let meta = parseJson(variant?.meta);
  if (typeof meta === "string") meta = parseJson(meta);
  const options = Array.isArray(meta?.option_values) ? meta.option_values.filter((option) => option?.value) : [];
  const colorOption = options.find((option) => option.type === "color");

  return {
    id: idOf(item.id),
    product_id: idOf(item.product_id),
    title: clip(decodeHtmlEntities(item.product?.name || "") || item.name || `Item ${item.id}`, 255),
    color: variant?.color || (colorOption ? String(colorOption.value) : null),
    size: variant?.size_details?.name || null,
    options:
      options
        .filter((option) => option.type !== "color")
        .map((option) => (option.name ? `${option.name}: ${option.value}` : String(option.value)))
        .join(" · ") || null,
    quantity: Number(item.quantity) || 0,
    manual: isManualItem(item, customization, snapshot),
    config: customization,
    snapshot,
    design_preview: item.logo_image || null,
    artwork_names: artworkNames,
  };
};

// The lines an order's items make (approvalLines.js). Logos picked for a pre-made product's
// options are named after the customer's file.
const linesForOrder = async (order, transaction) => {
  const graphicIds = [
    ...new Set(
      (order.items || []).flatMap((item) => {
        const options = parseJson(item.customization_config)?.customization;
        return Array.isArray(options) ? options.map((option) => Number(option?.graphic_id)).filter(Boolean) : [];
      }),
    ),
  ];
  const graphics = graphicIds.length
    ? await UserGraphic.findAll({ attributes: ["id", "original_name"], where: { id: graphicIds }, raw: true, transaction })
    : [];
  const names = new Map(graphics.map((graphic) => [Number(graphic.id), graphic.original_name]));

  return groupLines((order.items || []).map((item) => normalizeItem(item, names)));
};

// Whether a paid order waits for an approval decision while the hold is on: one of its items is
// customized (approvalLines.js isCustomizedConfig). `order` needs its items.
const orderNeedsProofDecision = (order) =>
  (order?.items || []).some((item) => isCustomizedConfig(parseJson(item.customization_config)));

// ---------------------------------------------------------------- the approval's records

// Saves the order's lines. They're frozen from here on, whatever happens to the order's items.
const createLines = async (approval, order, transaction) => {
  for (const line of await linesForOrder(order, transaction)) {
    await OrderApprovalLine.create(
      {
        approval_id: approval.id,
        position: line.position,
        product_id: line.product_id,
        order_item_ids: JSON.stringify(line.order_item_ids),
        title: line.title,
        detail: JSON.stringify(line.detail),
      },
      { transaction },
    );
  }
};

// Everything that decides an approval's state, oldest first.
const loadBundle = async (approvalId, transaction) => {
  const lines = await OrderApprovalLine.findAll({
    where: { approval_id: approvalId },
    order: [
      ["position", "ASC"],
      ["id", "ASC"],
    ],
    transaction,
  });
  const files = await OrderApprovalFile.findAll({ where: { approval_id: approvalId }, order: [["id", "ASC"]], transaction });
  const events = await OrderApprovalEvent.findAll({ where: { approval_id: approvalId }, order: [["id", "ASC"]], transaction });
  return { lines, files, events };
};

// Appends events to the approval's history (and to bundle.events). who: { actor, adminId } for
// the team, { actor, ip, userAgent } for the customer.
const addEvents = async (approval, bundle, events, { transaction, actor, adminId = null, ip = null, userAgent = null }) => {
  const created = [];
  for (const event of events) {
    const row = await OrderApprovalEvent.create(
      {
        approval_id: approval.id,
        line_id: event.line_id ?? null,
        file_id: event.file_id ?? null,
        type: event.type,
        actor,
        admin_id: actor === ACTOR.ADMIN ? adminId : null,
        version: event.version ?? null,
        target_event_id: event.target_event_id ?? null,
        batch_id: event.batch_id ?? null,
        body: event.body ?? null,
        meta: event.meta ? JSON.stringify(event.meta) : null,
        ip: clip(ip, 64),
        user_agent: clip(userAgent, 255),
      },
      { transaction },
    );
    bundle.events.push(row);
    created.push(row);
  }
  return created;
};

// Rewrites the cached statuses from the history (the rules: utils/approvalState.js). Runs in
// every write's transaction, after its events. Returns the state.
const recompute = async (approval, bundle, transaction) => {
  const state = approvalState(bundle);

  for (const line of bundle.lines) {
    const next = state.lines.get(idOf(line.id));
    await line.update(
      {
        status: next.status,
        current_version: next.current_version,
        approved_version: next.approved_version,
        approved_event_id: next.approved_event_id,
      },
      { transaction },
    );
  }

  await approval.update(
    {
      status: state.status,
      approved_at: state.approved_at,
      last_customer_event_id: state.last_customer_event_id,
    },
    { transaction },
  );
  return state;
};

// Runs fn(approval, transaction) holding the approval's row lock, so two changes to one approval
// never interleave. approval is null when there's none.
const withApproval = (where, fn) =>
  sequelize.transaction(async (transaction) => {
    const approval = await OrderApproval.findOne({ where, transaction, lock: transaction.LOCK.UPDATE });
    return fn(approval, transaction);
  });

// For the two changes that can create an approval (Start, and the payment hold): runs
// fn(approval, transaction) holding the order's row lock, so they never run together for one
// order, and the approval's row lock when it exists (approval null: fn may create it). A locking
// read of an approval that doesn't exist locks the gap next to it in the order_id index, and two
// orders' approvals created at the same moment then deadlock on their inserts. So whether it
// exists is read first, outside the transaction (approvals are never deleted), and it's only
// locked when it does. If another request creates it in between, the insert fails on the unique
// order_id and the change runs once more.
const withOrderApproval = async (orderId, fn) => {
  for (let attempt = 1; ; attempt++) {
    const exists = (await OrderApproval.count({ where: { order_id: orderId } })) > 0;
    try {
      return await sequelize.transaction(async (transaction) => {
        await Order.findByPk(orderId, { attributes: ["id"], transaction, lock: transaction.LOCK.UPDATE });
        const approval = exists
          ? await OrderApproval.findOne({ where: { order_id: orderId }, transaction, lock: transaction.LOCK.UPDATE })
          : null;
        return fn(approval, transaction);
      });
    } catch (error) {
      if (exists || attempt > 1 || error.name !== "SequelizeUniqueConstraintError") throw error;
    }
  }
};

// ---------------------------------------------------------------- labels

const HELD = [HOLD.PENDING_DECISION, HOLD.HOLD];

// The automatic label step's hold (shipment.service.js shipPaidOrder). With "Hold customized
// orders for an approval decision" on (Settings, Shipping), a paid order with a customized item
// gets an approval that waits for the team's decision (PENDING_DECISION) on its Approval page,
// unless the team released it already. Returns true when the label must wait. With the setting
// off it returns false without reading anything.
const holdForApprovalDecision = async (orderId) => {
  if (settings.get("APPROVAL_HOLD_CUSTOMIZED") !== true) return false;

  const order = await loadOrder(orderId);
  if (!order || !orderNeedsProofDecision(order)) return false;

  // A Start approval at the same moment waits for this one (withOrderApproval).
  const held = await withOrderApproval(order.id, async (found, transaction) => {
    let approval = found;
    if (approval && (approval.hold_state === HOLD.RELEASED || approval.locked_at)) return false;
    if (approval && HELD.includes(approval.hold_state)) return true;

    if (approval) {
      await approval.update({ hold_state: HOLD.PENDING_DECISION }, { transaction });
    } else {
      approval = await OrderApproval.create({ order_id: order.id, hold_state: HOLD.PENDING_DECISION }, { transaction });
      await createLines(approval, order, transaction);
    }

    const bundle = await loadBundle(approval.id, transaction);
    await addEvents(approval, bundle, [{ type: EVENT.HOLD_PENDING, meta: { hold_state: HOLD.PENDING_DECISION } }], {
      transaction,
      actor: ACTOR.SYSTEM,
    });
    await recompute(approval, bundle, transaction);
    return true;
  });

  if (held) logger.info(`Label for order ${order.order_number} not bought: it waits for a decision on its Approval page.`);
  return held;
};

// Buy label (POST order/admin/:id/label) on an order whose proof the customer is still looking
// at asks first: 409 with data.code APPROVAL_OPEN. With confirm the approval is locked, so the
// customer's page turns read-only, and the label is bought as before. A held label is released
// either way, since buying it is the team's decision. An order without an approval is untouched.
const confirmLabelPurchase = (orderId, { confirm = false, adminId = null } = {}) =>
  withApproval({ order_id: orderId }, async (approval, transaction) => {
    if (!approval) return;

    const open = Boolean(approval.first_sent_at) && !approval.locked_at;
    const held = HELD.includes(approval.hold_state);
    if (!open && !held) return;

    if (open && !confirm) {
      const error = new ApiError(httpStatus.CONFLICT, "This order is waiting for the customer's approval. Buy the label anyway?");
      error.details = { code: "APPROVAL_OPEN" };
      throw error;
    }

    const values = {};
    const events = [];
    if (open) {
      Object.assign(values, { locked_at: new Date(), locked_by: adminId });
      events.push({ type: EVENT.LOCKED, meta: { reason: "label" } });
    }
    if (held) {
      values.hold_state = HOLD.RELEASED;
      events.push({ type: EVENT.HOLD_SET, meta: { hold_state: HOLD.RELEASED, reason: "label" } });
    }

    const bundle = await loadBundle(approval.id, transaction);
    await approval.update(values, { transaction });
    await addEvents(approval, bundle, events, { transaction, actor: ACTOR.ADMIN, adminId });
    await recompute(approval, bundle, transaction);
  });

// ---------------------------------------------------------------- the Orders list

// Each order's approval for the Orders list, by order id: { status, hold_state, locked, unseen,
// sent }. unseen counts the customer's actions since an admin last opened the Approval page.
const approvalSummaries = async (orderIds) => {
  if (!orderIds.length) return new Map();

  const rows = await sequelize.query(
    `SELECT a.order_id, a.status, a.hold_state, a.locked_at, a.first_sent_at,
            (SELECT COUNT(*) FROM order_approval_events e
              WHERE e.approval_id = a.id AND e.actor = 'CUSTOMER' AND e.id > COALESCE(a.admin_seen_event_id, 0)) AS unseen
       FROM order_approvals a
      WHERE a.order_id IN (:ids)`,
    { replacements: { ids: orderIds }, type: QueryTypes.SELECT },
  );

  return new Map(
    rows.map((row) => [
      Number(row.order_id),
      {
        status: row.status,
        hold_state: row.hold_state,
        locked: Boolean(row.locked_at),
        unseen: Number(row.unseen) || 0,
        sent: Boolean(row.first_sent_at),
      },
    ]),
  );
};

module.exports = {
  TOKEN_KEY_LABEL,
  clip,
  newToken,
  linkOf,
  linkGone,
  findByToken,
  loadOrder,
  linesForOrder,
  orderNeedsProofDecision,
  createLines,
  loadBundle,
  addEvents,
  recompute,
  withApproval,
  withOrderApproval,
  holdForApprovalDecision,
  confirmLabelPurchase,
  approvalSummaries,
};
