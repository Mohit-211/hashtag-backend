// The rules of an order's artwork approval (the artwork previews a customer approves through an
// emailed link), as pure functions over its append-only history. Nothing here reads the database,
// so scripts/checkApprovalRules.js tests every rule with plain objects. Every write to an approval
// appends events and then rewrites the cached statuses from approvalState() in the same
// transaction (services/Common/approvalStore.js).
//
// For each line, events are read in id order. Each VERSION_SENT starts a round: the time the
// customer decides about that version, the line's newest.
// - A choice is the customer's APPROVED or NOTE_ADDED of a version sent so far, in the round it
//   was made in: Approve (APPROVED of the newest version), Go back (APPROVED of an older version,
//   which also rejects every version after it) or Reject (NOTE_ADDED: their note on the newest).
// - Undo takes a choice back (APPROVAL_UNDONE for an approval, NOTE_REMOVED for a rejection). The
//   round's choices are a stack: the newest one not taken back is the line's last choice, which
//   decides its status and is the only one Undo can take back.
// - A new version starts a new round. The choices before it are final and stay as the versions'
//   statuses (Approved, Rejected, Replaced).

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
      // Restoring a note (23 Nov): no longer written, and ignored.
      "NOTE_RESTORED",
    ].map((type) => [type, type]),
  ),
);

const ACTOR = Object.freeze({ ADMIN: "ADMIN", CUSTOMER: "CUSTOMER", SYSTEM: "SYSTEM" });

const LINE = Object.freeze({
  NOT_SENT: "NOT_SENT",
  NO_PROOF_NEEDED: "NO_PROOF_NEEDED",
  WAITING: "WAITING",
  // The customer rejected the newest version.
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

// A choice's kind (last_choice.kind, and the history's).
const CHOICE = Object.freeze({ APPROVED: "APPROVED", WENT_BACK: "WENT_BACK", REJECTED: "REJECTED" });

// A sent version's status.
const VERSION = Object.freeze({ WAITING: "WAITING", APPROVED: "APPROVED", REJECTED: "REJECTED", REPLACED: "REPLACED" });

const STALE_MESSAGE = "This was just updated. Please check the latest version.";

// Ids come back from MariaDB as numbers or strings.
const idOf = (value) => (value === null || value === undefined || value === "" ? null : Number(value));

// A whole number from JSON or a form field ("2" and 2), or NaN.
const wholeOf = (value) => {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return NaN;
  const number = Number(value);
  return Number.isInteger(number) ? number : NaN;
};

const latestOf = (latest, time) => (!latest || new Date(time) > new Date(latest) ? time : latest);

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

// What the customer's page may offer on a line. The public view turns it all off when the page
// is read-only.
const actionsOf = (status, last, currentVersion) => {
  if (status === LINE.NOT_SENT || status === LINE.NO_PROOF_NEEDED) {
    return { approve: false, reject: false, go_back_to: [], undo: false };
  }
  const older = Array.from({ length: currentVersion - 1 }, (_, index) => currentVersion - 1 - index);
  return {
    approve: !last,
    reject: !last,
    // Going back replaces a rejection, never an approval.
    go_back_to: !last || last.kind === CHOICE.REJECTED ? older : [],
    undo: Boolean(last),
  };
};

// Each sent version's status, from every round's choices that weren't taken back: Approved (this
// round, by Approve or Go back), Rejected (the customer's note, or gone back past it: this stays
// after newer versions), Replaced (a newer version came before the customer chose it, or after
// they approved it), or Waiting (the newest, nothing chosen yet). A choice first clears the
// approvals made earlier in its round, so a line has at most one Approved version, and it is the
// line's approved_version, also for histories written before 24 Nov (several approvals in a round).
const versionStatuses = (line, undone) => {
  const marks = new Map();
  line.rounds.forEach((round, index) => {
    for (const choice of round.choices.filter((candidate) => !undone.has(candidate.id))) {
      for (const [version, mark] of marks) {
        if (mark.status === VERSION.APPROVED && mark.round === index) marks.delete(version);
      }
      const mark = { decided_at: choice.created_at, went_back_to: null, note_event_id: null, round: index };
      if (choice.kind === CHOICE.REJECTED) {
        marks.set(choice.version, { ...mark, status: VERSION.REJECTED, note_event_id: choice.id });
        continue;
      }
      marks.set(choice.version, { ...mark, status: VERSION.APPROVED });
      for (let version = choice.version + 1; version <= round.version; version++) {
        const earlier = marks.get(version);
        marks.set(version, {
          ...mark,
          status: VERSION.REJECTED,
          went_back_to: choice.version,
          // The customer's own rejection of it, if they wrote one.
          note_event_id: earlier?.status === VERSION.REJECTED ? earlier.note_event_id : null,
        });
      }
    }
  });

  return line.versions.map((sent) => {
    const mark = marks.get(sent.version);
    let status;
    if (!mark) status = sent.version === line.currentVersion ? VERSION.WAITING : VERSION.REPLACED;
    else if (mark.status === VERSION.APPROVED && mark.round !== line.rounds.length - 1) status = VERSION.REPLACED;
    else status = mark.status;
    const rejected = status === VERSION.REJECTED;
    return {
      ...sent,
      status,
      decided_at: rejected || status === VERSION.APPROVED ? mark.decided_at : null,
      went_back_to: rejected ? mark.went_back_to : null,
      note_event_id: rejected ? mark.note_event_id : null,
    };
  });
};

/**
 * @param {object} input
 * @param {Array<{id, no_proof}>} input.lines
 * @param {Array<{id, type, actor, line_id, version, target_event_id, batch_id, body, created_at}>} input.events
 * @param {Array<{line_id, kind, version, removed_at}>} [input.files]
 * @returns {{ status, approved_at, last_customer_event_id, lines: Map<number, object>,
 *   undone: Set<number>, notes: Map<number, {removed, removed_at, line_id}>,
 *   choices: Map<number, {id, line_id, kind, version, newest_version, batch_id, created_at}>,
 *   last_batch: null | { batch_id, undoable, size } }}
 */
const approvalState = ({ lines = [], events = [], files = [] }) => {
  const sorted = [...events].sort((first, second) => idOf(first.id) - idOf(second.id));

  // Each line while the history is read: its sent versions, and its rounds with their choices.
  const work = new Map(
    lines.map((line) => [idOf(line.id), { currentVersion: 0, versions: [], rounds: [], noProof: false }]),
  );
  const choices = new Map();
  // The choices taken back with Undo.
  const undone = new Set();
  const notes = new Map();
  let lastCustomerEventId = null;
  let lastBatchId = null;

  // The line's last choice. None while it needs no preview: the round's choices stay, so the last
  // one (and its Undo) comes back when the team switches that off again.
  const lastChoiceOf = (line, noProof) => {
    if (noProof) return null;
    const round = line.rounds[line.rounds.length - 1];
    for (let i = (round?.choices.length || 0) - 1; i >= 0; i--) {
      if (!undone.has(round.choices[i].id)) return round.choices[i];
    }
    return null;
  };

  const statusOf = (line, noProof) => {
    if (noProof) return LINE.NO_PROOF_NEEDED;
    if (!line.currentVersion) return LINE.NOT_SENT;
    const last = lastChoiceOf(line, false);
    if (!last) return LINE.WAITING;
    return last.kind === CHOICE.REJECTED ? LINE.CHANGES_REQUESTED : LINE.APPROVED;
  };

  const currentLines = () =>
    [...work.values()].map((line) => ({ status: statusOf(line, line.noProof), current_version: line.currentVersion, line }));

  // When the approval last became APPROVED: the time of the approval that completed it (Approve,
  // Go back or Approve all). When something else completed it (the last open line marked "no
  // preview needed"), the newest of the lines' approvals.
  let complete = false;
  let completedAt = null;
  const newestApprovalTime = (states) =>
    states
      .filter((state) => state.status === LINE.APPROVED)
      .map((state) => lastChoiceOf(state.line, false).created_at)
      .reduce(latestOf, null);

  for (const event of sorted) {
    const eventId = idOf(event.id);
    const line = work.get(idOf(event.line_id));
    const byCustomer = event.actor === ACTOR.CUSTOMER;
    if (byCustomer) lastCustomerEventId = eventId;

    switch (event.type) {
      case EVENT.VERSION_SENT: {
        if (!line) break;
        const version = wholeOf(event.version);
        line.currentVersion = Math.max(line.currentVersion, Number.isInteger(version) ? version : 0);
        line.versions.push({ version, event_id: eventId, sent_at: event.created_at, message: event.body || null });
        line.rounds.push({ version: line.currentVersion, choices: [] });
        break;
      }
      case EVENT.APPROVED:
      case EVENT.NOTE_ADDED: {
        if (event.type === EVENT.NOTE_ADDED) {
          notes.set(eventId, { removed: false, removed_at: null, line_id: idOf(event.line_id) });
        }
        const version = wholeOf(event.version);
        if (!byCustomer || !line || !(version >= 1 && version <= line.currentVersion)) break;

        const round = line.rounds[line.rounds.length - 1];
        const approval = event.type === EVENT.APPROVED;
        const choice = {
          id: eventId,
          line_id: idOf(event.line_id),
          kind: !approval ? CHOICE.REJECTED : version === round.version ? CHOICE.APPROVED : CHOICE.WENT_BACK,
          version,
          newest_version: round.version,
          batch_id: (approval && event.batch_id) || null,
          created_at: event.created_at,
        };
        choices.set(eventId, choice);
        round.choices.push(choice);
        if (choice.batch_id) lastBatchId = choice.batch_id;
        break;
      }
      case EVENT.APPROVAL_UNDONE: {
        if (!byCustomer) break;
        if (idOf(event.target_event_id)) {
          const target = choices.get(idOf(event.target_event_id));
          if (target && target.kind !== CHOICE.REJECTED) undone.add(target.id);
        } else if (event.batch_id) {
          // An undo of an Approve all without a target: each line's last choice from that batch.
          for (const candidate of line ? [line] : work.values()) {
            const last = lastChoiceOf(candidate, candidate.noProof);
            if (last && last.batch_id === event.batch_id) undone.add(last.id);
          }
        }
        break;
      }
      case EVENT.NOTE_REMOVED: {
        if (!byCustomer) break;
        const target = idOf(event.target_event_id);
        const note = notes.get(target);
        if (note && !note.removed) Object.assign(note, { removed: true, removed_at: event.created_at });
        if (choices.get(target)?.kind === CHOICE.REJECTED) undone.add(target);
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

  // The lines' cached columns and what the pages show. no_proof is the line's own column, which the
  // team's switch sets together with its event.
  const result = new Map();
  for (const line of lines) {
    const lineId = idOf(line.id);
    const state = work.get(lineId);
    const noProof = Boolean(Number(line.no_proof));
    const status = statusOf(state, noProof);
    const last = lastChoiceOf(state, noProof);
    const approved = status === LINE.APPROVED;

    result.set(lineId, {
      id: lineId,
      status,
      no_proof: noProof,
      current_version: state.currentVersion,
      approved_version: approved ? last.version : null,
      approved_event_id: approved ? last.id : null,
      approved_at: approved ? last.created_at : null,
      // What Undo takes back.
      last_choice: last && {
        event_id: last.id,
        kind: last.kind,
        version: last.version,
        at: last.created_at,
        batch_id: last.batch_id,
      },
      actions: actionsOf(status, last, state.currentVersion),
      versions: versionStatuses(state, undone),
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
            .reduce(latestOf, null);
  }

  // The newest Approve all: how many items it approved, and whether its Undo still has something
  // to take back (one of them is still its line's last choice).
  const batch = lastBatchId ? [...choices.values()].filter((choice) => choice.batch_id === lastBatchId) : [];

  return {
    status,
    approved_at: approvedAt,
    last_customer_event_id: lastCustomerEventId,
    lines: result,
    undone,
    notes,
    choices,
    last_batch: lastBatchId
      ? {
          batch_id: lastBatchId,
          undoable: batch.some((choice) => result.get(choice.line_id)?.last_choice?.event_id === choice.id),
          size: batch.length,
        }
      : null,
  };
};

// Whether the history shows an event struck through: a choice taken back with Undo, or a note
// removed before 24 Nov that wasn't a choice.
const isUndone = (state, event) =>
  state.undone.has(idOf(event.id)) ||
  (event.type === EVENT.NOTE_ADDED && Boolean(state.notes.get(idOf(event.id))?.removed));

// What an event means in a history (both pages word it): SENT, a choice (APPROVED, WENT_BACK,
// REJECTED), or the Undo of one (UNDID_APPROVAL, UNDID_GO_BACK, UNDID_REJECTION). null for the
// rest, which the customer's page leaves out.
const eventKind = (state, event) => {
  if (event.type === EVENT.VERSION_SENT) return "SENT";
  const choice = state.choices.get(idOf(event.id));
  if (choice) return choice.kind;
  if (event.actor !== ACTOR.CUSTOMER) return null;

  const target = state.choices.get(idOf(event.target_event_id));
  if (event.type === EVENT.APPROVAL_UNDONE) return target?.kind === CHOICE.WENT_BACK ? "UNDID_GO_BACK" : "UNDID_APPROVAL";
  if (event.type === EVENT.NOTE_REMOVED && target?.kind === CHOICE.REJECTED) return "UNDID_REJECTION";
  return null;
};

// ---------------------------------------------------------------- what a customer's click writes
// Each returns { events: [...] } (empty: nothing to write) or { error: { status, message, code } }.
// code STALE: the page is out of date, so the customer gets the current view.

const fail = (status, message, code = null) => ({ error: { status, message, code } });
const stale = () => fail(409, STALE_MESSAGE, "STALE");

const NOT_IN_ORDER = "That item isn't part of this order.";
const NO_SUCH_VERSION = "That version of the artwork preview doesn't exist.";
const UNDO_FIRST = "Undo your last choice first.";
const NOT_A_CHOICE = "That isn't a choice that can be undone.";

// The line's last choice as the customer's page showed it (last_choice_id): null for none (absent,
// null, or "" and "null" from a form), an event id, or NaN when it's something else.
const shownChoiceOf = (value) => {
  if (value === undefined || value === null || value === "" || value === "null") return null;
  return typeof value === "number" || typeof value === "string" ? wholeOf(value) : NaN;
};

// The team switched "No preview needed" on (or never sent one) since the page offered the button.
const nothingToDecide = (line) => line.status === LINE.NOT_SENT || line.status === LINE.NO_PROOF_NEEDED;

// Approve (version: the newest) or Go back (an older version) on one line. latest: the newest
// version the customer's page showed; lastChoiceId: the line's last choice it showed.
const planApprove = (state, { lineId, version, latest, lastChoiceId }) => {
  const line = state.lines.get(idOf(lineId));
  if (!line) return fail(404, NOT_IN_ORDER);

  const wanted = wholeOf(version);
  const seen = wholeOf(latest);
  const shown = shownChoiceOf(lastChoiceId);
  if (Number.isNaN(wanted) || Number.isNaN(seen) || Number.isNaN(shown)) {
    return fail(400, "Send the version to approve, the newest version you saw and your last choice.");
  }
  if (nothingToDecide(line)) return stale();
  if (wanted < 1 || wanted > line.current_version) return fail(400, NO_SUCH_VERSION);

  const last = line.last_choice;
  // Asking for exactly what's already chosen writes nothing (a second tab, a double click).
  if (last && last.kind !== CHOICE.REJECTED && last.version === wanted && seen === line.current_version) {
    return { events: [] };
  }
  if (seen < line.current_version || shown !== (last?.event_id ?? null)) return stale();
  // Approve needs nothing chosen; Go back can also replace a rejection.
  if (last && (wanted === line.current_version || last.kind !== CHOICE.REJECTED)) return fail(400, UNDO_FIRST);
  return { events: [{ type: EVENT.APPROVED, line_id: line.id, version: wanted }] };
};

// Reject the newest version, with the customer's note (body, or null when they only sent
// pictures, which the service saves). version and lastChoiceId: what the page showed when its
// Reject box opened.
const planReject = (state, { lineId, version, lastChoiceId, body = null }) => {
  const line = state.lines.get(idOf(lineId));
  if (!line) return fail(404, NOT_IN_ORDER);

  const wanted = wholeOf(version);
  const shown = shownChoiceOf(lastChoiceId);
  if (Number.isNaN(wanted) || Number.isNaN(shown)) return fail(400, "Send the version you're rejecting and your last choice.");
  if (nothingToDecide(line)) return stale();
  if (wanted < 1 || wanted > line.current_version) return fail(400, NO_SUCH_VERSION);

  const last = line.last_choice;
  if (wanted < line.current_version || shown !== (last?.event_id ?? null)) return stale();
  if (last) return fail(400, UNDO_FIRST);
  return { events: [{ type: EVENT.NOTE_ADDED, line_id: line.id, version: wanted, body }] };
};

// Approve all: the newest version of every line waiting for the customer, as one batch.
// requested: [{ id, latest }], the lines the page showed as waiting. All or nothing: refused as
// STALE when the lines waiting now, or their versions, aren't the ones the page showed. Lines
// already approved, not sent or needing no preview are skipped.
const planApproveAll = (state, requested, batchId) => {
  if (!Array.isArray(requested)) return fail(400, "Send the items as lines: [{ id, latest }].");

  const latestById = new Map();
  for (const entry of requested) {
    const lineId = wholeOf(entry?.id);
    const latest = wholeOf(entry?.latest);
    if (Number.isNaN(lineId) || Number.isNaN(latest)) return fail(400, "Each line needs its id and latest version.");
    if (!state.lines.has(lineId)) return fail(400, NOT_IN_ORDER);
    latestById.set(lineId, latest);
  }

  const lines = [...state.lines.values()];
  const waiting = lines.filter((line) => line.status === LINE.WAITING);
  const changed =
    waiting.some((line) => latestById.get(line.id) !== line.current_version) ||
    lines.some((line) => {
      const latest = latestById.get(line.id);
      if (latest === undefined) return false;
      // Rejected or gone back since the page showed it waiting, or a newer version came.
      const decided = line.status === LINE.CHANGES_REQUESTED || line.last_choice?.kind === CHOICE.WENT_BACK;
      return decided || latest < line.current_version;
    });
  if (changed) return stale();

  return {
    events: waiting.map((line) => ({
      type: EVENT.APPROVED,
      line_id: line.id,
      version: line.current_version,
      batch_id: batchId,
    })),
  };
};

// Undo: a line's last choice (eventId), or what's left of an Approve all (batchId). An undo can't
// itself be undone. Each undo event names the version of the choice it takes back.
const planUndo = (state, { eventId, batchId }) => {
  const isLast = (choice) => state.lines.get(choice.line_id)?.last_choice?.event_id === choice.id;
  const undoOf = (choice) => ({
    type: choice.kind === CHOICE.REJECTED ? EVENT.NOTE_REMOVED : EVENT.APPROVAL_UNDONE,
    line_id: choice.line_id,
    target_event_id: choice.id,
    version: choice.version,
  });

  if (eventId !== undefined && eventId !== null && eventId !== "") {
    const choice = state.choices.get(wholeOf(eventId));
    if (!choice) return fail(400, NOT_A_CHOICE);
    if (!isLast(choice)) return stale();
    return { events: [undoOf(choice)] };
  }

  if (batchId !== undefined && batchId !== null && batchId !== "") {
    if (typeof batchId !== "string" || !/^[a-f0-9]{32}$/.test(batchId)) return fail(400, NOT_A_CHOICE);
    const batch = [...state.choices.values()].filter((choice) => choice.batch_id === batchId);
    if (!batch.length) return fail(400, NOT_A_CHOICE);
    const undo = batch.filter(isLast);
    if (!undo.length) return stale();
    return { events: undo.map((choice) => ({ ...undoOf(choice), batch_id: batchId })) };
  }

  return fail(400, "Send the choice to undo as event_id, or an Approve all as batch_id.");
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
  eventKind,
  planApprove,
  planReject,
  planApproveAll,
  planUndo,
};
