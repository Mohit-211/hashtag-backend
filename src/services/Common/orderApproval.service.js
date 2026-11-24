// The admin panel's Approval page for an order (Orders, Approval): the team starts an approval,
// uploads proofs per line, sends them (order@ emails the customer a link to the approval page),
// and decides about the label hold and the production lock. Each change runs in one transaction
// holding the approval's row lock, appends its events and rewrites the statuses
// (approvalStore.js), then the whole page is sent back (adminView). The customer's side is
// approvalPublic.service.js.

const httpStatus = require("http-status");

const logger = require("../../config/logger");
const settings = require("../../config/settings");
const validateEmail = require("../../helpers/validateEmail");
const { Admin, Order, OrderApproval, OrderApprovalLine, OrderApprovalFile } = require("../../models");
const ApiError = require("../../utils/ApiError");
const { parseJson } = require("../../utils/orderFormat");
const { orderShipTo } = require("../../utils/orderShipTo");
const { EVENT, ACTOR, LINE, HOLD, approvalState, isUndone, eventKind, idOf, wholeOf } = require("../../utils/approvalState");
const store = require("./approvalStore");
const { fileUrl, artworkLinks, saveProof, removeStoredFiles } = require("./approvalFiles");
const { approvalReadOnlyReason } = require("./orderActions");
const { shipPaidOrder } = require("./shipment.service");
const { sendApprovalEmail } = require("./email.service");

const MESSAGE_LIMIT = 1000;
const HELD = [HOLD.PENDING_DECISION, HOLD.HOLD];

// Messages use the panel's words (decided 23 Nov 2026): "artwork preview", never "proof" or
// "draft".
const READ_ONLY = {
  LOCKED: "This order is locked for production. Unlock it first.",
  SHIPPED: "This order has shipped, so its artwork approval can't change any more.",
  CANCELLED: "This order is cancelled, so its artwork approval can't change any more.",
};

// The panel tells a missing order from a server without approvals by this exact message.
const notFound = () => new ApiError(httpStatus.NOT_FOUND, "Order not found");
const notStarted = () => new ApiError(httpStatus.CONFLICT, "Artwork approval hasn't been started for this order yet.");

const orderIdOf = (value) => {
  const id = wholeOf(value);
  if (!(id > 0)) throw notFound();
  return id;
};

const isDraft = (file) => file.kind === "PROOF" && (file.version === null || file.version === undefined) && !file.removed_at;
const onLine = (row, line) => idOf(row.line_id) === idOf(line.id);
const byPosition = (first, second) => first.position - second.position || idOf(first.id) - idOf(second.id);
const nextPosition = (files) => Math.max(0, ...files.map((file) => Number(file.position) || 0)) + 1;

// ---------------------------------------------------------------- the page

const adminNames = async (ids) => {
  const wanted = [...new Set(ids.filter(Boolean).map(Number))];
  if (!wanted.length) return new Map();
  const admins = await Admin.findAll({ attributes: ["id", "name"], where: { id: wanted }, paranoid: false, raw: true });
  return new Map(admins.map((admin) => [Number(admin.id), { id: Number(admin.id), name: admin.name }]));
};

const adminOf = (admins, id) => (id ? admins.get(Number(id)) || { id: Number(id), name: null } : null);

const fileView = (file) => ({
  id: idOf(file.id),
  url: fileUrl(file.stored_name),
  preview_url: fileUrl(file.preview_name),
  name: file.original_name,
  mime: file.mime,
  bytes: Number(file.bytes),
  created_at: file.created_at,
});

// Where Send emails the customer unless the team types an address, and what the panel's Send
// dialog fills in: the account's email. A closed account has none, as with the order emails.
const accountEmail = (order) => (order.user && !order.user.deleted_at ? order.user.email || null : null);

const detailView = (detail) => ({
  color: detail?.color ?? null,
  sizes: detail?.sizes || [],
  sizes_text: detail?.sizes_text || "",
  print_methods: detail?.print_methods || [],
  locations: detail?.locations || [],
  customer_artwork: artworkLinks(detail?.customer_artwork),
});

const orderView = (order) => ({
  id: idOf(order.id),
  order_number: order.order_number,
  status: order.status,
  payment_status: order.payment_status,
  shipment_status: order.shipment_status,
  created_at: order.created_at,
  customer_name: order.user?.user_profile?.name || orderShipTo(order)?.name || null,
  customer_email: accountEmail(order),
  has_label: Boolean(order.label_id),
});

// A customer's note: their rejection of a version. removed: taken back with Undo.
const noteView = (event, bundle, state) => {
  const note = state.notes.get(idOf(event.id));
  return {
    event_id: idOf(event.id),
    body: event.body,
    created_at: event.created_at,
    version: event.version,
    removed: note.removed,
    removed_at: note.removed_at,
    pictures: bundle.files
      .filter((file) => file.kind === "PICTURE" && idOf(file.note_event_id) === idOf(event.id))
      .sort(byPosition)
      .map((file) => ({ id: idOf(file.id), url: fileUrl(file.stored_name), name: file.original_name })),
  };
};

const lineView = (line, bundle, state) => {
  const lineState = state.lines.get(idOf(line.id));
  const proofs = bundle.files.filter((file) => file.kind === "PROOF" && onLine(file, line)).sort(byPosition);
  const noteOf = (eventId) => noteView(bundle.events.find((event) => idOf(event.id) === eventId), bundle, state);

  return {
    id: idOf(line.id),
    position: line.position,
    title: line.title,
    product_id: idOf(line.product_id),
    order_item_ids: parseJson(line.order_item_ids) || [],
    detail: detailView(parseJson(line.detail)),
    no_proof: lineState.no_proof,
    status: lineState.status,
    current_version: lineState.current_version,
    approved_version: lineState.approved_version,
    approved_at: lineState.approved_at,
    drafts: proofs.filter(isDraft).map(fileView),
    versions: lineState.versions.map((version) => ({
      version: version.version,
      sent_at: version.sent_at,
      message: version.message,
      files: proofs.filter((file) => Number(file.version) === version.version).map(fileView),
      status: version.status,
      decided_at: version.decided_at,
      went_back_to: version.went_back_to,
      note: version.note_event_id ? noteOf(version.note_event_id) : null,
    })),
    // Every note is a rejection.
    notes: bundle.events
      .filter((event) => event.type === EVENT.NOTE_ADDED && onLine(event, line))
      .map((event) => noteView(event, bundle, state)),
    last_choice: lineState.last_choice,
  };
};

// Before the approval starts: the lines it would have.
const proposedLineView = (line) => ({
  id: null,
  position: line.position,
  title: line.title,
  product_id: line.product_id,
  order_item_ids: line.order_item_ids,
  detail: detailView(line.detail),
  no_proof: false,
  status: LINE.NOT_SENT,
  current_version: 0,
  approved_version: null,
  approved_at: null,
  drafts: [],
  versions: [],
  notes: [],
  last_choice: null,
});

// kind: what the event means (approvalState.js eventKind). newest_version: the line's newest
// version when the customer made the choice. An Undo carries both, and the version, of the choice
// it took back (undos before 24 Nov didn't store the version).
const eventView = (event, state, admins, titles) => {
  const undid = event.type === EVENT.APPROVAL_UNDONE || event.type === EVENT.NOTE_REMOVED;
  const choice = state.choices.get(idOf(undid ? event.target_event_id : event.id));
  return {
    id: idOf(event.id),
    type: event.type,
    kind: eventKind(state, event),
    actor: event.actor,
    admin: adminOf(admins, event.admin_id),
    line_id: idOf(event.line_id),
    line_title: titles.get(idOf(event.line_id)) || null,
    version: undid && choice ? choice.version : event.version,
    newest_version: choice?.newest_version ?? null,
    target_event_id: idOf(event.target_event_id),
    batch_id: event.batch_id,
    body: event.body,
    meta: parseJson(event.meta) || null,
    created_at: event.created_at,
    ip: event.ip,
    user_agent: event.user_agent,
    undone: isUndone(state, event),
  };
};

// GET order/admin/:id/approval: the whole Approval page. Before the approval starts, approval is
// null and lines are the ones it would have (no ids, no files).
const adminView = async (orderId) => {
  const approval = await OrderApproval.findOne({ where: { order_id: orderId } });
  const order = await store.loadOrder(orderId, { items: !approval });
  if (!order) throw notFound();

  if (!approval) {
    const lines = await store.linesForOrder(order);
    return { order: orderView(order), approval: null, lines: lines.map(proposedLineView), history: [] };
  }

  const bundle = await store.loadBundle(approval.id);
  const state = approvalState(bundle);
  const admins = await adminNames([approval.locked_by, ...bundle.events.map((event) => event.admin_id)]);
  const titles = new Map(bundle.lines.map((line) => [idOf(line.id), line.title]));
  const seen = idOf(approval.admin_seen_event_id) || 0;

  return {
    order: orderView(order),
    approval: {
      id: idOf(approval.id),
      status: state.status,
      hold_state: approval.hold_state,
      locked_at: approval.locked_at,
      locked_by: adminOf(admins, approval.locked_by),
      link: {
        url: store.linkOf(approval),
        disabled: Boolean(approval.link_disabled_at),
        created_at: approval.link_created_at || null,
      },
      first_sent_at: approval.first_sent_at,
      last_sent_at: approval.last_sent_at,
      approved_at: state.approved_at,
      unseen: bundle.events.filter((event) => event.actor === ACTOR.CUSTOMER && idOf(event.id) > seen).length,
      read_only_reason: approvalReadOnlyReason(order, approval),
    },
    lines: bundle.lines.map((line) => lineView(line, bundle, state)),
    history: [...bundle.events].reverse().map((event) => eventView(event, state, admins, titles)),
  };
};

const getApproval = (orderId) => adminView(orderIdOf(orderId));

// ---------------------------------------------------------------- changes

// One change by the team, in a transaction holding the approval's row lock: run({ order,
// approval, bundle, transaction }) returns the events to append, then the statuses are rewritten
// from the history. Returns { order }.
const change = async (orderId, admin, run) => {
  const order = await Order.findByPk(orderIdOf(orderId));
  if (!order) throw notFound();

  await store.withApproval({ order_id: order.id }, async (approval, transaction) => {
    if (!approval) throw notStarted();
    const bundle = await store.loadBundle(approval.id, transaction);
    const events = (await run({ order, approval, bundle, transaction })) || [];
    await store.addEvents(approval, bundle, events, { transaction, actor: ACTOR.ADMIN, adminId: admin.id });
    await store.recompute(approval, bundle, transaction);
  });
  return { order };
};

const lineOf = (bundle, lineId) => {
  const line = bundle.lines.find((candidate) => idOf(candidate.id) === wholeOf(lineId));
  if (!line) throw new ApiError(httpStatus.NOT_FOUND, "That item isn't part of this order.");
  return line;
};

// Sending, and switching "No preview needed", change what the customer sees.
const refuseWhenReadOnly = (order, approval) => {
  const reason = approvalReadOnlyReason(order, approval);
  if (reason) throw new ApiError(httpStatus.CONFLICT, READ_ONLY[reason]);
};

// Don't hold and Lock for production release a held label: the step a payment runs, which buys it
// only while automatic labels are on (shipment.service.js). Its own failures stay on the order, as
// after a payment.
const runLabelStep = async (order) => {
  try {
    await shipPaidOrder(order.id);
  } catch (error) {
    logger.error(`Label for order ${order.order_number} after its approval hold failed: ${error.message}`);
  }
};

// POST order/admin/:id/approval: starts the approval, with its lines. Safe to repeat. Only a paid
// order that isn't cancelled can start one.
const startApproval = async (orderId, admin) => {
  const order = await store.loadOrder(orderIdOf(orderId));
  if (!order) throw notFound();

  // The payment hold or a second click at the same moment waits for this one (withOrderApproval).
  const started = await store.withOrderApproval(order.id, async (found, transaction) => {
    let approval = found;
    if (approval && (await OrderApprovalLine.count({ where: { approval_id: approval.id }, transaction }))) return false;

    if (order.payment_status !== "SUCCESS" || order.status === "CANCELLED") {
      throw new ApiError(httpStatus.CONFLICT, "Only a paid order that isn't cancelled can have artwork approval.");
    }

    if (!approval) approval = await OrderApproval.create({ order_id: order.id, created_by: admin.id }, { transaction });
    await store.createLines(approval, order, transaction);
    const bundle = await store.loadBundle(approval.id, transaction);
    await store.addEvents(approval, bundle, [{ type: EVENT.APPROVAL_STARTED }], {
      transaction,
      actor: ACTOR.ADMIN,
      adminId: admin.id,
    });
    await store.recompute(approval, bundle, transaction);
    return true;
  });

  if (started) logger.info(`Admin ${admin.id} started the approval of order ${order.order_number}`);
  return adminView(order.id);
};

// POST .../lines/:lineId/proofs, multipart approval_proof (one file): a draft proof, sent with
// the next Send. The upload is deleted again when it's refused.
const addProof = async (orderId, lineId, admin, files) => {
  const file = files?.approval_proof?.[0];
  if (!file) throw new ApiError(httpStatus.BAD_REQUEST, "Choose an artwork preview to upload (PNG, JPG or SVG).");

  let saved = null;
  let result;
  try {
    saved = await saveProof(file);
    result = await change(orderId, admin, async ({ approval, bundle, transaction }) => {
      const line = lineOf(bundle, lineId);
      const proof = await OrderApprovalFile.create(
        {
          approval_id: approval.id,
          line_id: line.id,
          kind: "PROOF",
          version: null,
          position: nextPosition(bundle.files.filter((candidate) => isDraft(candidate) && onLine(candidate, line))),
          ...saved,
          admin_id: admin.id,
        },
        { transaction },
      );
      bundle.files.push(proof);
      return [{ type: EVENT.PROOF_ADDED, line_id: line.id, file_id: proof.id, meta: { name: saved.original_name } }];
    });
  } catch (error) {
    removeStoredFiles([file.filename, saved?.preview_name]);
    throw error;
  }
  return adminView(result.order.id);
};

// DELETE .../files/:fileId: removes a draft proof. A sent one stays (send a new version instead).
const removeProof = async (orderId, fileId, admin) => {
  let removed = null;
  const { order } = await change(orderId, admin, async ({ bundle, transaction }) => {
    const file = bundle.files.find((candidate) => idOf(candidate.id) === wholeOf(fileId) && candidate.kind === "PROOF");
    if (!file) throw new ApiError(httpStatus.NOT_FOUND, "That artwork preview isn't part of this order.");
    if (file.version !== null) {
      throw new ApiError(
        httpStatus.CONFLICT,
        "This artwork preview was already sent to the customer, so it stays. Upload a new version instead.",
      );
    }
    if (file.removed_at) return [];

    await file.update({ removed_at: new Date() }, { transaction });
    removed = file;
    return [{ type: EVENT.PROOF_REMOVED, line_id: file.line_id, file_id: file.id, meta: { name: file.original_name } }];
  });

  // A draft never sent has no use, unless it's a copy of a sent proof: that one shares its file.
  if (removed && !removed.copied_from_file_id) removeStoredFiles([removed.stored_name, removed.preview_name]);
  return adminView(order.id);
};

// POST .../lines/:lineId/copy { version }: that version's proofs again, as drafts (the same files,
// no new upload), e.g. to send an earlier proof back.
const copyVersion = async (orderId, lineId, admin, body = {}) => {
  const version = wholeOf(body.version);
  const { order } = await change(orderId, admin, async ({ approval, bundle, transaction }) => {
    const line = lineOf(bundle, lineId);
    const sources = bundle.files
      .filter((file) => file.kind === "PROOF" && onLine(file, line) && Number(file.version) === version)
      .sort(byPosition);
    if (!(version >= 1) || !sources.length) {
      throw new ApiError(httpStatus.BAD_REQUEST, "That version of this item has no artwork previews to copy.");
    }

    let position = nextPosition(bundle.files.filter((file) => isDraft(file) && onLine(file, line))) - 1;
    const events = [];
    for (const source of sources) {
      const copy = await OrderApprovalFile.create(
        {
          approval_id: approval.id,
          line_id: line.id,
          kind: "PROOF",
          version: null,
          position: ++position,
          stored_name: source.stored_name,
          preview_name: source.preview_name,
          original_name: source.original_name,
          mime: source.mime,
          bytes: source.bytes,
          sha256: source.sha256,
          admin_id: admin.id,
          copied_from_file_id: source.id,
        },
        { transaction },
      );
      bundle.files.push(copy);
      events.push({ type: EVENT.PROOF_COPIED, line_id: line.id, file_id: copy.id, version, meta: { from_file_id: idOf(source.id) } });
    }
    return events;
  });
  return adminView(order.id);
};

// POST .../lines/:lineId/no-proof { no_proof }: the line needs no proof (it counts as done).
const setNoProof = async (orderId, lineId, admin, body = {}) => {
  if (typeof body.no_proof !== "boolean") throw new ApiError(httpStatus.BAD_REQUEST, "Send no_proof: true or false.");

  const { order } = await change(orderId, admin, async ({ order: current, approval, bundle, transaction }) => {
    refuseWhenReadOnly(current, approval);
    const line = lineOf(bundle, lineId);
    if (Boolean(Number(line.no_proof)) === body.no_proof) return [];

    await line.update({ no_proof: body.no_proof }, { transaction });
    return [{ type: body.no_proof ? EVENT.NO_PROOF_SET : EVENT.NO_PROOF_CLEARED, line_id: line.id }];
  });
  return adminView(order.id);
};

// ---------------------------------------------------------------- sending

// Where a line stands, as the email says it before the line's options, in the customer page's
// words. A line waiting for the customer says nothing, unless this send gave it a new version. An
// approved line names its version when the customer went back to an earlier one.
const emailStatus = (lineState, updated) => {
  switch (lineState.status) {
    case LINE.NO_PROOF_NEEDED:
      return "No preview needed";
    case LINE.NOT_SENT:
      return "Artwork preview coming soon";
    case LINE.APPROVED:
      return lineState.approved_version < lineState.current_version
        ? `Already approved (Version ${lineState.approved_version})`
        : "Already approved";
    case LINE.CHANGES_REQUESTED:
      return "Rejected: we're making a new version";
    default:
      return updated && lineState.current_version > 1 ? `Updated: Version ${lineState.current_version}` : null;
  }
};

// The lines the email lists, each with where it stands and its options (no prices). Every line is
// there, as on the customer's page; the ones waiting for the customer come first, then the rest in
// order (the sort keeps the order within each group).
const waitingFirst = ({ lineState }) => (lineState.status === LINE.WAITING ? 0 : 1);
const emailItems = (bundle, state, updated) =>
  bundle.lines
    .map((line) => ({ line, lineState: state.lines.get(idOf(line.id)) }))
    .sort((first, second) => waitingFirst(first) - waitingFirst(second))
    .map(({ line, lineState }) => {
      const detail = parseJson(line.detail) || {};
      return {
        name: line.title,
        detail: [
          emailStatus(lineState, updated.has(idOf(line.id))),
          detail.color,
          detail.sizes_text,
          ...(detail.print_methods || []),
          ...(detail.locations || []),
        ]
          .filter(Boolean)
          .join(" · "),
      };
    });

// POST .../send { to?, message? }: every line with drafts gets its next version, the link is made
// on the first send, and after the commit order@ emails the customer: "first" (no email yet),
// "updated" (new versions) or "reminder". The email's outcome is in the history and in `email`.
const sendApproval = async (orderId, admin, body = {}) => {
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if ([...message].length > MESSAGE_LIMIT) {
    throw new ApiError(httpStatus.BAD_REQUEST, `The message can be at most ${MESSAGE_LIMIT} characters.`);
  }
  const typed = typeof body.to === "string" ? body.to.trim() : "";
  if (typed && !validateEmail(typed)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Enter a valid email address to send it to.");
  }

  // A 503 that says where to set it, before anything changes.
  settings.getRequired("APPROVAL_SITE_URL");

  const order = await store.loadOrder(orderIdOf(orderId), { items: false });
  if (!order) throw notFound();
  const to = typed || accountEmail(order);
  if (!to) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "This customer has no email address on their account. Type the address to send it to, or use Copy link and send the link yourself.",
    );
  }

  const text = store.clip(message, MESSAGE_LIMIT) || null;
  let email;
  await store.withApproval({ order_id: order.id }, async (approval, transaction) => {
    if (!approval) throw notStarted();
    refuseWhenReadOnly(order, approval);
    if (approval.link_disabled_at) {
      throw new ApiError(httpStatus.CONFLICT, "The customer's link is switched off. Switch it on, or replace it, before sending.");
    }

    const bundle = await store.loadBundle(approval.id, transaction);
    const before = approvalState(bundle);
    const drafts = bundle.files.filter(isDraft);
    const updated = bundle.lines.filter((line) => drafts.some((file) => onLine(file, line)));
    if (!updated.length && ![...before.lines.values()].some((line) => line.current_version > 0)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Add an artwork preview to at least one item before sending.");
    }

    const events = [];
    for (const line of updated) {
      const version = before.lines.get(idOf(line.id)).current_version + 1;
      for (const file of drafts.filter((draft) => onLine(draft, line))) {
        await file.update({ version }, { transaction });
      }
      events.push({ type: EVENT.VERSION_SENT, line_id: line.id, version, body: text });
    }

    const now = new Date();
    await approval.update(
      {
        last_sent_at: now,
        ...(!approval.first_sent_at && { first_sent_at: now }),
        ...(!approval.token_hash && { ...store.newToken(), link_created_at: now }),
      },
      { transaction },
    );

    const link = store.linkOf(approval);
    if (!link) {
      throw new ApiError(
        httpStatus.CONFLICT,
        "The customer's link can't be read (the settings key changed). Use Replace link, then send again.",
      );
    }

    await store.addEvents(approval, bundle, events, { transaction, actor: ACTOR.ADMIN, adminId: admin.id });
    const after = await store.recompute(approval, bundle, transaction);
    email = {
      kind: !bundle.events.some((event) => event.type === EVENT.EMAIL_SENT)
        ? "first"
        : updated.length
          ? "updated"
          : "reminder",
      link,
      items: emailItems(bundle, after, new Set(updated.map((line) => idOf(line.id)))),
    };
  });

  let error = null;
  try {
    await sendApprovalEmail(to, {
      kind: email.kind,
      name: order.user?.user_profile?.name || orderShipTo(order)?.name || null,
      orderNumber: order.order_number,
      items: email.items,
      message: text,
      link: email.link,
    });
    logger.info(`Order ${order.order_number}: "${email.kind}" proof email sent to ${to} by admin ${admin.id}.`);
  } catch (failure) {
    error = store.clip(failure.message, 500) || "The mail server didn't send it.";
    logger.error(`Order ${order.order_number}: the "${email.kind}" proof email to ${to} failed: ${failure.message}`);
  }

  // The email has gone (or not) whatever happens here, so the page still says which.
  try {
    await change(order.id, admin, async () => [
      error
        ? { type: EVENT.EMAIL_FAILED, body: text, meta: { to, kind: email.kind, error } }
        : { type: EVENT.EMAIL_SENT, body: text, meta: { to, kind: email.kind } },
    ]);
  } catch (failure) {
    logger.error(`Order ${order.order_number}: the proof email's history entry wasn't saved: ${failure.message}`);
  }

  return {
    ...(await adminView(order.id)),
    email: { sent: !error, to, kind: email.kind, ...(error && { error }) },
  };
};

// ---------------------------------------------------------------- hold, lock and the link

// POST .../hold { hold }: true keeps the label until Lock for production; false (Don't hold)
// releases it, and a label held until now goes the way it would have after the payment.
const setHold = async (orderId, admin, body = {}) => {
  if (typeof body.hold !== "boolean") throw new ApiError(httpStatus.BAD_REQUEST, "Send hold: true or false.");

  let release = false;
  const { order } = await change(orderId, admin, async ({ order: current, approval, transaction }) => {
    if (body.hold) {
      refuseWhenReadOnly(current, approval);
      if (current.label_id) {
        throw new ApiError(httpStatus.CONFLICT, "This order already has a label, so there's nothing to hold.");
      }
      if (approval.hold_state === HOLD.HOLD) return [];
      await approval.update({ hold_state: HOLD.HOLD }, { transaction });
      return [{ type: EVENT.HOLD_SET, meta: { hold_state: HOLD.HOLD } }];
    }

    if (approval.hold_state === HOLD.RELEASED) return [];
    release = HELD.includes(approval.hold_state) && !current.label_id;
    await approval.update({ hold_state: HOLD.RELEASED }, { transaction });
    return [{ type: EVENT.HOLD_SET, meta: { hold_state: HOLD.RELEASED } }];
  });

  if (release) await runLabelStep(order);
  return adminView(order.id);
};

// POST .../lock: Lock for production. The customer's page turns read-only, and a held label is
// released (as Don't hold).
const lockApproval = async (orderId, admin) => {
  let release = false;
  const { order } = await change(orderId, admin, async ({ order: current, approval, transaction }) => {
    if (approval.locked_at) return [];

    const values = { locked_at: new Date(), locked_by: admin.id };
    const events = [{ type: EVENT.LOCKED }];
    if (HELD.includes(approval.hold_state)) {
      values.hold_state = HOLD.RELEASED;
      events.push({ type: EVENT.HOLD_SET, meta: { hold_state: HOLD.RELEASED, reason: "lock" } });
      release = !current.label_id;
    }
    await approval.update(values, { transaction });
    return events;
  });

  if (release) await runLabelStep(order);
  return adminView(order.id);
};

// POST .../unlock: the customer can act again. A label that was bought stays.
const unlockApproval = async (orderId, admin) => {
  const { order } = await change(orderId, admin, async ({ approval, transaction }) => {
    if (!approval.locked_at) return [];
    await approval.update({ locked_at: null, locked_by: null }, { transaction });
    return [{ type: EVENT.UNLOCKED }];
  });
  return adminView(order.id);
};

const LINK_ACTIONS = ["replace", "disable", "enable"];

// POST .../link { action }: replace (a new key: the old link stops working), disable or enable.
const changeLink = async (orderId, admin, body = {}) => {
  if (!LINK_ACTIONS.includes(body.action)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Send action: replace, disable or enable.");
  }

  const { order } = await change(orderId, admin, async ({ approval, transaction }) => {
    if (body.action === "replace") {
      const first = !approval.token_hash;
      await approval.update({ ...store.newToken(), link_created_at: new Date() }, { transaction });
      return [{ type: EVENT.LINK_REPLACED, ...(first && { meta: { first: true } }) }];
    }

    const disable = body.action === "disable";
    if (Boolean(approval.link_disabled_at) === disable) return [];
    await approval.update({ link_disabled_at: disable ? new Date() : null }, { transaction });
    return [{ type: disable ? EVENT.LINK_DISABLED : EVENT.LINK_ENABLED }];
  });
  return adminView(order.id);
};

// POST .../seen: the customer's actions so far have been seen (the Orders list's dot goes).
const markSeen = async (orderId, admin) => {
  const { order } = await change(orderId, admin, async ({ approval, bundle, transaction }) => {
    const newest = Math.max(
      0,
      ...bundle.events.filter((event) => event.actor === ACTOR.CUSTOMER).map((event) => idOf(event.id)),
    );
    if (newest > (idOf(approval.admin_seen_event_id) || 0)) {
      await approval.update({ admin_seen_event_id: newest }, { transaction });
    }
    return [];
  });
  return adminView(order.id);
};

module.exports = {
  getApproval,
  startApproval,
  addProof,
  removeProof,
  copyVersion,
  setNoProof,
  sendApproval,
  setHold,
  lockApproval,
  unlockApproval,
  changeLink,
  markSeen,
};
