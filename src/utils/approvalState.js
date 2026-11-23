// The rules of an order's approval (the proofs a customer approves through an emailed link), as
// pure functions over its append-only history. Nothing here reads the database, so
// scripts/checkApprovalRules.js tests every rule with plain objects. Every write to an approval
// appends events and then rewrites the cached statuses from approvalState() in the same
// transaction (services/Common/approvalStore.js).
//
// For each line, events are read in id order. S is the line's newest VERSION_SENT.
// - A live approval is an APPROVED event after S, of any version sent so far, that no
//   APPROVAL_UNDONE took back. The newest live approval is the line's approval; undoing it brings
//   back the one before it, with its own time.
// - A note added after S that isn't removed (its latest NOTE_REMOVED or NOTE_RESTORED decides)
//   asks for changes.
// - A new version resets the line: earlier approvals and notes stay in the history but no longer
//   count.

const EVENT = Object.freeze(
  Object.fromEntries(
    [
      // The team
      "APPROVAL_STARTED",
      "PROOF_ADDED",
      "PROOF_REMOVED",
      "PROOF_COPIED",
      "NO_PROOF_SET",
      "NO_PROOF_CLEARED",
      "VERSION_SENT",
      "EMAIL_SENT",
      "EMAIL_FAILED",
      "LINK_REPLACED",
      "LINK_DISABLED",
      "LINK_ENABLED",
      "HOLD_SET",
      "LOCKED",
      "UNLOCKED",
      // The payment hold
      "HOLD_PENDING",
      // The customer
      "APPROVED",
      "APPROVAL_UNDONE",
      "NOTE_ADDED",
      "NOTE_REMOVED",
      "NOTE_RESTORED",
    ].map((type) => [type, type]),
  ),
);

const ACTOR = Object.freeze({ ADMIN: "ADMIN", CUSTOMER: "CUSTOMER", SYSTEM: "SYSTEM" });

const LINE = Object.freeze({
  NOT_SENT: "NOT_SENT",
  NO_PROOF_NEEDED: "NO_PROOF_NEEDED",
  WAITING: "WAITING",
  CHANGES_REQUESTED: "CHANGES_REQUESTED",
  APPROVED: "APPROVED",
});

const STATUS = Object.freeze({
  DRAFT: "DRAFT",
  WAITING: "WAITING",
  CHANGES_REQUESTED: "CHANGES_REQUESTED",
  APPROVED: "APPROVED",
});

// Whether a paid order's label waits for the team (approvalStore.js holdForApprovalDecision).
const HOLD = Object.freeze({
  NONE: "NONE",
  PENDING_DECISION: "PENDING_DECISION",
  HOLD: "HOLD",
  RELEASED: "RELEASED",
});

const STALE_MESSAGE = "This was just updated. Please check the latest version.";

// Ids come back from MariaDB as numbers or strings.
const idOf = (value) => (value === null || value === undefined || value === "" ? null : Number(value));

// A whole number from JSON or a form field ("2" and 2), or NaN.
const wholeOf = (value) => {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return NaN;
  const number = Number(value);
  return Number.isInteger(number) ? number : NaN;
};

const isOpen = (status) => status === LINE.WAITING || status === LINE.CHANGES_REQUESTED;

// The whole approval's status from its lines' ({ status, current_version }).
const overallStatus = (lines) => {
  if (!lines.some((line) => line.current_version > 0)) return STATUS.DRAFT;
  const statuses = lines.map((line) => line.status);
  if (
    statuses.includes(LINE.APPROVED) &&
    statuses.every((status) => status === LINE.APPROVED || status === LINE.NO_PROOF_NEEDED)
  ) {
    return STATUS.APPROVED;
  }
  if (statuses.includes(LINE.CHANGES_REQUESTED)) return STATUS.CHANGES_REQUESTED;
  return STATUS.WAITING;
};

/**
 * @param {object} input
 * @param {Array<{id, no_proof}>} input.lines
 * @param {Array<{id, type, actor, line_id, version, target_event_id, batch_id, body, created_at}>} input.events
 * @param {Array<{line_id, kind, version, removed_at}>} [input.files]
 * @returns {{ status, approved_at, last_customer_event_id, lines: Map<number, object>,
 *   undone: Set<number>, notes: Map<number, {removed, removed_at, after_approval, line_id}>,
 *   last_batch: null | { batch_id, undoable } }}
 */
const approvalState = ({ lines = [], events = [], files = [] }) => {
  const sorted = [...events].sort((first, second) => idOf(first.id) - idOf(second.id));

  // Each line's state while the history is read.
  const work = new Map(
    lines.map((line) => [
      idOf(line.id),
      { currentVersion: 0, versions: [], approvals: [], notes: [], noProof: false },
    ]),
  );
  const undone = new Set();
  const notes = new Map();
  let lastCustomerEventId = null;
  let lastBatchId = null;

  const newestLive = (line) => {
    for (let i = line.approvals.length - 1; i >= 0; i--) {
      if (!undone.has(line.approvals[i].id)) return line.approvals[i];
    }
    return null;
  };

  const statusOf = (line, noProof) => {
    if (noProof) return LINE.NO_PROOF_NEEDED;
    if (!line.currentVersion) return LINE.NOT_SENT;
    if (newestLive(line)) return LINE.APPROVED;
    if (line.notes.some((noteId) => !notes.get(noteId).removed)) return LINE.CHANGES_REQUESTED;
    return LINE.WAITING;
  };

  const currentLines = () =>
    [...work.values()].map((line) => ({ status: statusOf(line, line.noProof), current_version: line.currentVersion, line }));

  // When the approval last became APPROVED: the time of the approval that completed it. When
  // something else completed it (the last open line marked "no proof needed"), the newest of the
  // lines' approvals.
  let complete = false;
  let completedAt = null;
  const newestApprovalTime = (states) =>
    states
      .filter((state) => state.status === LINE.APPROVED)
      .map((state) => newestLive(state.line).created_at)
      .reduce((latest, time) => (!latest || new Date(time) > new Date(latest) ? time : latest), null);

  for (const event of sorted) {
    const eventId = idOf(event.id);
    const line = work.get(idOf(event.line_id));
    if (event.actor === ACTOR.CUSTOMER) lastCustomerEventId = eventId;

    switch (event.type) {
      case EVENT.VERSION_SENT: {
        if (!line) break;
        const version = wholeOf(event.version);
        line.currentVersion = Math.max(line.currentVersion, Number.isInteger(version) ? version : 0);
        line.versions.push({ version, event_id: eventId, sent_at: event.created_at, message: event.body || null });
        // Rule 6: a new version resets the line.
        line.approvals = [];
        line.notes = [];
        break;
      }
      case EVENT.APPROVED: {
        const version = wholeOf(event.version);
        if (line && version >= 1 && version <= line.currentVersion) {
          line.approvals.push({ id: eventId, version, batch_id: event.batch_id || null, created_at: event.created_at });
        }
        if (event.batch_id) lastBatchId = event.batch_id;
        break;
      }
      case EVENT.APPROVAL_UNDONE: {
        const target = idOf(event.target_event_id);
        if (target) {
          undone.add(target);
        } else if (event.batch_id) {
          // A batch undo without a target: each line's newest live approval from that batch.
          for (const candidate of line ? [line] : work.values()) {
            const newest = newestLive(candidate);
            if (newest && newest.batch_id === event.batch_id) undone.add(newest.id);
          }
        }
        break;
      }
      case EVENT.NOTE_ADDED:
        notes.set(eventId, {
          removed: false,
          removed_at: null,
          // Written while the line was approved (the customer kept the approval).
          after_approval: Boolean(line && !line.noProof && newestLive(line)),
          line_id: idOf(event.line_id),
        });
        if (line) line.notes.push(eventId);
        break;
      case EVENT.NOTE_REMOVED:
      case EVENT.NOTE_RESTORED: {
        const note = notes.get(idOf(event.target_event_id));
        if (note) {
          note.removed = event.type === EVENT.NOTE_REMOVED;
          note.removed_at = note.removed ? event.created_at : null;
        }
        break;
      }
      case EVENT.NO_PROOF_SET:
      case EVENT.NO_PROOF_CLEARED:
        if (line) line.noProof = event.type === EVENT.NO_PROOF_SET;
        break;
      default:
        break;
    }

    const states = currentLines();
    const nowComplete = overallStatus(states) === STATUS.APPROVED;
    if (nowComplete && !complete) {
      completedAt = event.type === EVENT.APPROVED ? event.created_at : newestApprovalTime(states);
    }
    if (!nowComplete) completedAt = null;
    complete = nowComplete;
  }

  // The lines' cached columns. no_proof is the line's own column, which the team's switch sets
  // together with its event.
  const result = new Map();
  for (const line of lines) {
    const lineId = idOf(line.id);
    const state = work.get(lineId);
    const noProof = Boolean(Number(line.no_proof));
    const status = statusOf(state, noProof);
    const newest = newestLive(state);
    const approved = status === LINE.APPROVED;

    result.set(lineId, {
      id: lineId,
      status,
      no_proof: noProof,
      current_version: state.currentVersion,
      approved_version: approved ? newest.version : null,
      approved_event_id: approved ? newest.id : null,
      approved_at: approved ? newest.created_at : null,
      // The approval Undo takes back, whatever the line's status.
      newest_live: newest,
      live_approvals: state.approvals.filter((approval) => !undone.has(approval.id)),
      versions: state.versions,
      active_note_ids: state.notes.filter((noteId) => !notes.get(noteId).removed),
      draft_count: files.filter(
        (file) =>
          idOf(file.line_id) === lineId &&
          file.kind === "PROOF" &&
          (file.version === null || file.version === undefined) &&
          !file.removed_at,
      ).length,
    });
  }

  const lineStates = [...result.values()];
  const status = overallStatus(lineStates);
  let approvedAt = null;
  if (status === STATUS.APPROVED) {
    // completedAt follows the switches' events; the columns agree with them unless a line was
    // changed without one.
    approvedAt =
      complete && completedAt
        ? completedAt
        : lineStates
            .filter((state) => state.status === LINE.APPROVED)
            .map((state) => state.approved_at)
            .reduce((latest, time) => (!latest || new Date(time) > new Date(latest) ? time : latest), null);
  }

  return {
    status,
    approved_at: approvedAt,
    last_customer_event_id: lastCustomerEventId,
    lines: result,
    undone,
    notes,
    // The newest Approve all, and whether unticking it can still undo something.
    last_batch: lastBatchId
      ? {
          batch_id: lastBatchId,
          undoable: lineStates.some((state) => state.newest_live?.batch_id === lastBatchId),
        }
      : null,
  };
};

// Whether the history shows an event struck through: an approval that was undone, or a note that
// is removed now.
const isUndone = (state, event) =>
  (event.type === EVENT.APPROVED && state.undone.has(idOf(event.id))) ||
  (event.type === EVENT.NOTE_ADDED && Boolean(state.notes.get(idOf(event.id))?.removed));

// ---------------------------------------------------------------- what a customer's click writes
// Each returns { events: [...] } (empty: nothing to write) or { error: { status, message, code } }.
// code STALE: the page is out of date, so the customer gets the current view.

const fail = (status, message, code = null) => ({ error: { status, message, code } });
const stale = () => fail(409, STALE_MESSAGE, "STALE");

// Approve one version of a line. latest: the newest version the customer's page showed.
const planApprove = (state, { lineId, version, latest }) => {
  const line = state.lines.get(idOf(lineId));
  if (!line) return fail(404, "That item isn't part of this order.");

  const wanted = wholeOf(version);
  const seen = wholeOf(latest);
  if (Number.isNaN(wanted) || Number.isNaN(seen)) {
    return fail(400, "Send the version to approve and the latest version you saw.");
  }
  if (seen < line.current_version) return stale();
  if (line.status === LINE.NO_PROOF_NEEDED || line.status === LINE.NOT_SENT) {
    return fail(400, "This item has no artwork preview to approve.");
  }
  if (wanted < 1 || wanted > line.current_version) return fail(400, "That version of the artwork preview doesn't exist.");

  // Rule 3: approving the version that's already approved writes nothing.
  if (line.newest_live && line.newest_live.version === wanted) return { events: [] };
  return { events: [{ type: EVENT.APPROVED, line_id: line.id, version: wanted }] };
};

// Approve all: the latest version of every line still waiting or with changes asked for, as one
// batch. requested: [{ id, latest }] for the lines the page shows. All or nothing.
const planApproveAll = (state, requested, batchId) => {
  if (!Array.isArray(requested)) return fail(400, "Send the items as lines: [{ id, latest }].");

  const latestById = new Map();
  for (const entry of requested) {
    const lineId = wholeOf(entry?.id);
    const latest = wholeOf(entry?.latest);
    if (Number.isNaN(lineId) || Number.isNaN(latest)) return fail(400, "Each line needs its id and latest version.");
    if (!state.lines.has(lineId)) return fail(400, "That item isn't part of this order.");
    latestById.set(lineId, latest);
  }

  const lines = [...state.lines.values()];
  // A line the page shows an older version of, or doesn't show at all, hasn't been seen.
  const unseen = lines.some((line) => {
    const latest = latestById.get(line.id);
    if (latest === undefined) return isOpen(line.status);
    return latest < line.current_version;
  });
  if (unseen) return stale();

  return {
    events: lines
      .filter((line) => isOpen(line.status))
      .map((line) => ({ type: EVENT.APPROVED, line_id: line.id, version: line.current_version, batch_id: batchId })),
  };
};

// Undo: one approval (eventId), or what's left of an Approve all (batchId). Only a line's newest
// live approval can be undone (rule 4); an undo can't itself be undone.
const planUndo = (state, events, { eventId, batchId }) => {
  const newestOn = (event) => state.lines.get(idOf(event.line_id))?.newest_live?.id === idOf(event.id);
  const isCustomerApproval = (event) => event?.type === EVENT.APPROVED && event.actor === ACTOR.CUSTOMER;

  if (eventId !== undefined && eventId !== null && eventId !== "") {
    const wanted = wholeOf(eventId);
    const target = events.find((event) => idOf(event.id) === wanted);
    if (!isCustomerApproval(target)) return fail(400, "That isn't an approval that can be undone.");
    if (!newestOn(target)) return stale();
    return {
      events: [{ type: EVENT.APPROVAL_UNDONE, line_id: idOf(target.line_id), target_event_id: idOf(target.id) }],
    };
  }

  if (batchId !== undefined && batchId !== null && batchId !== "") {
    if (typeof batchId !== "string" || !/^[a-f0-9]{32}$/.test(batchId)) {
      return fail(400, "That isn't an approval that can be undone.");
    }
    const batch = events.filter((event) => isCustomerApproval(event) && event.batch_id === batchId);
    if (!batch.length) return fail(400, "That isn't an approval that can be undone.");
    const undo = batch.filter(newestOn);
    if (!undo.length) return stale();
    return {
      events: undo.map((event) => ({
        type: EVENT.APPROVAL_UNDONE,
        line_id: idOf(event.line_id),
        target_event_id: idOf(event.id),
        batch_id: batchId,
      })),
    };
  }

  return fail(400, "Send the approval to undo as event_id, or an Approve all as batch_id.");
};

// "Undo approval and ask for changes" with a note: every live approval on the line, newest first,
// so the line doesn't fall back to an older approval.
const planUndoLine = (state, lineId) => {
  const line = state.lines.get(idOf(lineId));
  return {
    events: [...(line?.live_approvals || [])]
      .reverse()
      .map((approval) => ({ type: EVENT.APPROVAL_UNDONE, line_id: line.id, target_event_id: approval.id })),
  };
};

// Remove or restore one of the customer's notes. action: "remove" | "restore".
const planNoteChange = (state, events, noteId, action) => {
  const wanted = wholeOf(noteId);
  const note = events.find((event) => idOf(event.id) === wanted);
  if (!note || note.type !== EVENT.NOTE_ADDED || note.actor !== ACTOR.CUSTOMER) {
    return fail(404, "That note doesn't exist.");
  }
  const removed = Boolean(state.notes.get(idOf(note.id))?.removed);
  if (action === "remove" ? removed : !removed) return stale();
  return {
    events: [
      {
        type: action === "remove" ? EVENT.NOTE_REMOVED : EVENT.NOTE_RESTORED,
        line_id: idOf(note.line_id),
        target_event_id: idOf(note.id),
      },
    ],
  };
};

module.exports = {
  EVENT,
  ACTOR,
  LINE,
  STATUS,
  HOLD,
  idOf,
  wholeOf,
  approvalState,
  isUndone,
  planApprove,
  planApproveAll,
  planUndo,
  planUndoLine,
  planNoteChange,
};
