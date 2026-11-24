// The customer's approval page (no sign-in): the link's key finds the approval (approvalGate),
// and each answer is what the page shows. GETs never write, so an email scanner opening the link
// changes nothing. Each change is one transaction holding the approval's row lock, with the
// visitor's IP and browser on its events. A refusal because the page is out of date (STALE) or
// read-only (READ_ONLY) is a 409 carrying the current view, so the page can refresh without
// asking again. Prices, addresses, emails, IPs and the team's names never appear here. The team's
// side is orderApproval.service.js.

const crypto = require("crypto");
const httpStatus = require("http-status");

const sequelize = require("../../config/central.db");
const { OrderApproval, OrderApprovalFile } = require("../../models");
const ApiError = require("../../utils/ApiError");
const { parseJson } = require("../../utils/orderFormat");
const { orderShipTo } = require("../../utils/orderShipTo");
const {
  EVENT,
  ACTOR,
  LINE,
  approvalState,
  isUndone,
  eventKind,
  idOf,
  planApprove,
  planReject,
  planApproveAll,
  planUndo,
} = require("../../utils/approvalState");
const store = require("./approvalStore");
const { fileUrl, artworkLinks, savePictures, removeStoredFiles } = require("./approvalFiles");
const { approvalReadOnlyReason } = require("./orderActions");
const { senderFor } = require("./email.service");

const NOTE_LIMIT = 2000;
const PICTURES_PER_APPROVAL = 40;

// Messages use the page's words (decided 23 Nov 2026): "artwork", never "proof".
const READ_ONLY = {
  LOCKED: "Your order is in production, so its artwork can't be changed any more.",
  SHIPPED: "Your order has shipped, so its artwork can't be changed any more.",
  CANCELLED: "This order was cancelled, so its artwork can't be changed.",
};

const onLine = (row, line) => idOf(row.line_id) === idOf(line.id);
const byPosition = (first, second) => first.position - second.position || idOf(first.id) - idOf(second.id);

// ---------------------------------------------------------------- the page

const firstNameOf = (order) => {
  const name = order.user?.user_profile?.name || orderShipTo(order)?.name;
  return name ? String(name).trim().split(/\s+/)[0] || null : null;
};

// A customer's note: their rejection of a version. removed: taken back with Undo.
const noteView = (event, bundle, state) => ({
  event_id: idOf(event.id),
  body: event.body,
  created_at: event.created_at,
  version: event.version,
  removed: Boolean(state.notes.get(idOf(event.id))?.removed),
  pictures: bundle.files
    .filter((file) => file.kind === "PICTURE" && idOf(file.note_event_id) === idOf(event.id))
    .sort(byPosition)
    .map((file) => ({ id: idOf(file.id), url: fileUrl(file.stored_name) })),
});

// An Undo names the version of the choice it took back (undos before 24 Nov didn't store it).
const historyVersion = (state, event) =>
  event.type === EVENT.APPROVAL_UNDONE || event.type === EVENT.NOTE_REMOVED
    ? (state.choices.get(idOf(event.target_event_id))?.version ?? event.version)
    : event.version;

// Nothing can be chosen or undone on a read-only page.
const NOTHING_TO_DO = { approve: false, reject: false, go_back_to: [], undo: false };

const lineView = (line, bundle, state, readOnly) => {
  const lineState = state.lines.get(idOf(line.id));
  const detail = parseJson(line.detail) || {};
  const proofs = bundle.files
    .filter((file) => file.kind === "PROOF" && onLine(file, line) && file.version !== null && !file.removed_at)
    .sort(byPosition);
  const events = bundle.events.filter((event) => onLine(event, line));
  const noteOf = (eventId) => noteView(events.find((event) => idOf(event.id) === eventId), bundle, state);

  return {
    id: idOf(line.id),
    title: line.title,
    detail: {
      color: detail.color ?? null,
      sizes_text: detail.sizes_text || "",
      print_methods: detail.print_methods || [],
      locations: detail.locations || [],
    },
    customer_artwork: artworkLinks(detail.customer_artwork).map(({ url }) => ({ url })),
    no_proof: lineState.no_proof,
    status: lineState.status,
    current_version: lineState.current_version,
    approved_version: lineState.approved_version,
    approved_at: lineState.approved_at,
    versions: lineState.versions.map((version) => ({
      version: version.version,
      sent_at: version.sent_at,
      message: version.message,
      files: proofs
        .filter((file) => Number(file.version) === version.version)
        .map((file) => ({
          id: idOf(file.id),
          url: fileUrl(file.stored_name),
          preview_url: fileUrl(file.preview_name),
          name: file.original_name,
          mime: file.mime,
        })),
      status: version.status,
      decided_at: version.decided_at,
      went_back_to: version.went_back_to,
      note: version.note_event_id ? noteOf(version.note_event_id) : null,
    })),
    // Every note is a rejection.
    notes: events
      .filter((event) => event.type === EVENT.NOTE_ADDED && event.actor === ACTOR.CUSTOMER)
      .map((event) => noteView(event, bundle, state)),
    // The versions sent, the customer's choices and their Undos.
    history: events
      .map((event) => ({ event, kind: eventKind(state, event) }))
      .filter(({ kind }) => kind)
      .map(({ event, kind }) => ({
        event_id: idOf(event.id),
        type: event.type,
        kind,
        version: historyVersion(state, event),
        created_at: event.created_at,
        batch_id: event.batch_id,
        undone: isUndone(state, event),
      })),
    last_choice: lineState.last_choice,
    actions: readOnly ? NOTHING_TO_DO : lineState.actions,
    undo_event_id: lineState.last_choice?.event_id ?? null,
  };
};

const publicView = (order, approval, bundle, state) => {
  const reason = approvalReadOnlyReason(order, approval);
  const lines = bundle.lines.map((line) => lineView(line, bundle, state, Boolean(reason)));

  return {
    order: { number: order.order_number, placed_at: order.created_at, first_name: firstNameOf(order) },
    state: {
      status: state.status,
      read_only: Boolean(reason),
      reason,
      approved_count: lines.filter((line) => line.status === LINE.APPROVED).length,
      total_count: lines.filter((line) => line.status !== LINE.NO_PROOF_NEEDED).length,
    },
    support_email: senderFor("order").contact || null,
    lines,
    last_batch: state.last_batch,
  };
};

// The approval behind a link, checked again: the link may have been replaced or switched off, or
// the order deleted, since the gate looked. In a transaction the approval's row is locked.
const current = async (ref, transaction) => {
  const approval = await OrderApproval.findByPk(ref.id, {
    transaction,
    ...(transaction && { lock: transaction.LOCK.UPDATE }),
  });
  if (!approval || approval.token_hash !== ref.token_hash || approval.link_disabled_at) throw store.linkGone();

  const order = await store.loadOrder(approval.order_id, { items: false, transaction });
  if (!order) throw store.linkGone();
  return { approval, order };
};

// GET approval
const getView = async (ref) => {
  const { approval, order } = await current(ref);
  const bundle = await store.loadBundle(approval.id);
  return publicView(order, approval, bundle, approvalState(bundle));
};

// ---------------------------------------------------------------- the customer's changes

const conflict = (code, message, view) => {
  const error = new ApiError(httpStatus.CONFLICT, message);
  error.details = { code, view };
  return error;
};

// One customer action. decide({ approval, bundle, state, transaction }) answers like the planners
// in approvalState.js: { events } to append, or { error }. Returns the page after the change.
const act = (ref, who, decide) =>
  sequelize.transaction(async (transaction) => {
    const { approval, order } = await current(ref, transaction);
    const bundle = await store.loadBundle(approval.id, transaction);
    const state = approvalState(bundle);

    const reason = approvalReadOnlyReason(order, approval);
    if (reason) throw conflict("READ_ONLY", READ_ONLY[reason], publicView(order, approval, bundle, state));

    const decision = await decide({ approval, bundle, state, transaction });
    if (decision.error) {
      const { status, message, code } = decision.error;
      throw code ? conflict(code, message, publicView(order, approval, bundle, state)) : new ApiError(status, message);
    }

    await store.addEvents(approval, bundle, decision.events, {
      transaction,
      actor: ACTOR.CUSTOMER,
      ip: who.ip,
      userAgent: who.userAgent,
    });
    return publicView(order, approval, bundle, await store.recompute(approval, bundle, transaction));
  });

// POST approval/lines/:lineId/approve { version, latest, last_choice_id }: Approve (the newest
// version) or Go back (an older one).
const approveLine = (ref, who, lineId, body = {}) =>
  act(ref, who, ({ state }) =>
    planApprove(state, { lineId, version: body.version, latest: body.latest, lastChoiceId: body.last_choice_id }),
  );

// POST approval/approve-all { lines: [{ id, latest }] }
const approveAll = (ref, who, body = {}) =>
  act(ref, who, ({ state }) => planApproveAll(state, body.lines, crypto.randomBytes(16).toString("hex")));

// POST approval/undo { event_id } or { batch_id }
const undo = (ref, who, body = {}) =>
  act(ref, who, ({ state }) => planUndo(state, { eventId: body.event_id, batchId: body.batch_id }));

// POST approval/lines/:lineId/reject, multipart: body (the note, up to 2,000 characters), version
// and last_choice_id (what the page showed when its Reject box opened) and up to 5 pictures in
// approval_picture. A note or a picture is needed. Pictures count toward the order's 40 even after
// their rejection is undone: files are never deleted.
const reject = async (ref, who, lineId, body = {}, files = {}) => {
  const text = typeof body.body === "string" ? body.body.replace(/\r\n?/g, "\n").trim() : "";
  if ([...text].length > NOTE_LIMIT) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Your note can be at most ${NOTE_LIMIT} characters.`);
  }
  const uploads = files.approval_picture || [];
  if (!text && !uploads.length) throw new ApiError(httpStatus.BAD_REQUEST, "Tell us what to change, or add a picture.");

  let pictures = [];
  try {
    pictures = await savePictures(uploads);

    return await act(ref, who, async ({ approval, bundle, state, transaction }) => {
      const plan = planReject(state, {
        lineId,
        version: body.version,
        lastChoiceId: body.last_choice_id,
        body: store.clip(text, NOTE_LIMIT) || null,
      });
      if (plan.error) return plan;

      const stored = bundle.files.filter((file) => file.kind === "PICTURE").length;
      if (stored + pictures.length > PICTURES_PER_APPROVAL) {
        return {
          error: {
            status: httpStatus.BAD_REQUEST,
            message: `This order can take ${PICTURES_PER_APPROVAL} pictures in all, and has ${stored}. Tell us in words instead, or email us the pictures.`,
          },
        };
      }

      const [note] = await store.addEvents(approval, bundle, plan.events, {
        transaction,
        actor: ACTOR.CUSTOMER,
        ip: who.ip,
        userAgent: who.userAgent,
      });
      for (const [index, picture] of pictures.entries()) {
        const file = await OrderApprovalFile.create(
          {
            approval_id: approval.id,
            line_id: note.line_id,
            kind: "PICTURE",
            note_event_id: note.id,
            position: index + 1,
            ...picture,
          },
          { transaction },
        );
        bundle.files.push(file);
      }
      return { events: [] };
    });
  } catch (error) {
    removeStoredFiles(pictures.map((picture) => picture.stored_name));
    throw error;
  }
};

module.exports = {
  getView,
  approveLine,
  approveAll,
  undo,
  reject,
};
