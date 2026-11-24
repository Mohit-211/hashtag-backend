// Checks the order approval rules (utils/approvalState.js) and how order items become lines
// (utils/approvalLines.js) with plain objects: no database, no .env. Exits 1 when a rule fails.
//
//   node src/scripts/checkApprovalRules.js

const assert = require("assert");

const {
  EVENT,
  ACTOR,
  LINE,
  STATUS,
  approvalState,
  isUndone,
  eventKind,
  planApprove,
  planReject,
  planApproveAll,
  planUndo,
} = require("../utils/approvalState");
const { isCustomizedConfig, groupLines, humanize } = require("../utils/approvalLines");

let passed = 0;
const failed = [];

const check = (name, run) => {
  try {
    run();
    passed++;
  } catch (error) {
    failed.push(name);
    console.error(`FAIL ${name}\n  ${error.message.split("\n").join("\n  ")}`);
  }
};

const CUSTOMER_EVENTS = [
  EVENT.APPROVED,
  EVENT.APPROVAL_UNDONE,
  EVENT.NOTE_ADDED,
  EVENT.NOTE_REMOVED,
  EVENT.NOTE_RESTORED,
];

// An approval's history, one event a minute.
const approval = (lineCount = 1) => {
  const lines = Array.from({ length: lineCount }, (_, index) => ({ id: index + 1, no_proof: 0 }));
  const events = [];
  let clock = Date.UTC(2026, 10, 24, 15, 0, 0);

  const add = (type, fields = {}) => {
    clock += 60 * 1000;
    const event = {
      id: events.length + 1,
      type,
      actor: CUSTOMER_EVENTS.includes(type) ? ACTOR.CUSTOMER : type === EVENT.HOLD_PENDING ? ACTOR.SYSTEM : ACTOR.ADMIN,
      line_id: null,
      version: null,
      target_event_id: null,
      batch_id: null,
      body: null,
      created_at: new Date(clock),
      ...fields,
    };
    events.push(event);
    return event;
  };

  const state = () => approvalState({ lines, events });
  const send = (lineId, version, body = null) => add(EVENT.VERSION_SENT, { line_id: lineId, version, body });
  const approve = (lineId, version, batchId = null) =>
    add(EVENT.APPROVED, { line_id: lineId, version, batch_id: batchId });
  // The customer's NOTE_ADDED: a rejection (a note before 24 Nov).
  const reject = (lineId, version, body = "Make the logo bigger") =>
    add(EVENT.NOTE_ADDED, { line_id: lineId, version, body });
  const undoNote = (noteId) => add(EVENT.NOTE_REMOVED, { line_id: 1, target_event_id: noteId });
  // Writes what a planner decided, as the customer's events.
  const apply = (plan) => {
    assert.ok(!plan.error, `planner refused: ${JSON.stringify(plan.error)}`);
    return plan.events.map((event) => add(event.type, event));
  };

  return { lines, events, add, state, send, approve, reject, undoNote, apply };
};

const lineOf = (state, id = 1) => state.lines.get(id);
// Each sent version as [status, went_back_to, the id of its rejection note].
const statusesOf = (line) => line.versions.map((version) => [version.status, version.went_back_to, version.note_event_id]);
const BATCH_A = "a".repeat(32);
const BATCH_B = "b".repeat(32);
const UNDO_FIRST = { status: 400, message: "Undo your last choice first.", code: null };
const NOT_A_CHOICE = { status: 400, message: "That isn't a choice that can be undone.", code: null };
const NO_SUCH_VERSION = { status: 400, message: "That version of the artwork preview doesn't exist.", code: null };
const NOTHING_TO_DO = { approve: false, reject: false, go_back_to: [], undo: false };
const ONLY_UNDO = { approve: false, reject: false, go_back_to: [], undo: true };

// ---------------------------------------------------------------- rule 1: what counts

check("rule 1: an approval after the newest version counts", () => {
  const a = approval();
  a.send(1, 1);
  const approved = a.approve(1, 1);
  const line = lineOf(a.state());
  assert.strictEqual(line.status, LINE.APPROVED);
  assert.strictEqual(line.approved_version, 1);
  assert.strictEqual(line.approved_event_id, approved.id);
  assert.strictEqual(line.approved_at, approved.created_at);
});

check("rule 1: an approval of an older sent version counts", () => {
  const a = approval();
  a.send(1, 1);
  a.send(1, 2);
  a.approve(1, 1);
  const line = lineOf(a.state());
  assert.strictEqual(line.status, LINE.APPROVED);
  assert.strictEqual(line.approved_version, 1);
  assert.strictEqual(line.current_version, 2);
});

check("rule 1: an approval of a version that wasn't sent doesn't count", () => {
  const a = approval();
  a.send(1, 1);
  a.approve(1, 2);
  assert.strictEqual(lineOf(a.state()).status, LINE.WAITING);
});

check("rule 1: an approval from before the newest version doesn't count", () => {
  const a = approval();
  a.send(1, 1);
  a.approve(1, 1);
  a.send(1, 2);
  const line = lineOf(a.state());
  assert.strictEqual(line.status, LINE.WAITING);
  assert.strictEqual(line.approved_version, null);
});

check("rule 1: an approval undone by its event id doesn't count", () => {
  const a = approval();
  a.send(1, 1);
  const approved = a.approve(1, 1);
  a.add(EVENT.APPROVAL_UNDONE, { line_id: 1, target_event_id: approved.id });
  const state = a.state();
  assert.strictEqual(lineOf(state).status, LINE.WAITING);
  assert.ok(state.undone.has(approved.id));
});

check("rule 1: an approval undone through its batch_id doesn't count", () => {
  const a = approval(2);
  a.send(1, 1);
  a.send(2, 1);
  a.approve(1, 1, BATCH_A);
  a.approve(2, 1, BATCH_A);
  a.add(EVENT.APPROVAL_UNDONE, { batch_id: BATCH_A });
  const state = a.state();
  assert.strictEqual(lineOf(state, 1).status, LINE.WAITING);
  assert.strictEqual(lineOf(state, 2).status, LINE.WAITING);
});

// ---------------------------------------------------------------- rule 2: line status

check("rule 2: no proof needed wins over everything", () => {
  const a = approval();
  a.send(1, 1);
  a.approve(1, 1);
  a.lines[0].no_proof = 1;
  const line = lineOf(a.state());
  assert.strictEqual(line.status, LINE.NO_PROOF_NEEDED);
  assert.strictEqual(line.approved_version, null);
});

check("rule 2: nothing sent is NOT_SENT, even with a note", () => {
  const a = approval();
  a.reject(1, 0);
  assert.strictEqual(lineOf(a.state()).status, LINE.NOT_SENT);
});

check("rule 2: sent and untouched is WAITING", () => {
  const a = approval();
  a.send(1, 1);
  assert.strictEqual(lineOf(a.state()).status, LINE.WAITING);
});

check("rule 2: a rejection is CHANGES_REQUESTED", () => {
  const a = approval();
  a.send(1, 1);
  a.reject(1, 1);
  assert.strictEqual(lineOf(a.state()).status, LINE.CHANGES_REQUESTED);
});

// ---------------------------------------------------------------- rule 3: approving

check("rule 3: approving the version that's already approved writes nothing", () => {
  const a = approval();
  a.send(1, 1);
  const approved = a.approve(1, 1);
  const plan = planApprove(a.state(), { lineId: 1, version: 1, latest: 1, lastChoiceId: approved.id });
  assert.deepStrictEqual(plan, { events: [] });
});

check("rule 3: approving on top of an approval is refused; from waiting, an older version is a go back", () => {
  const a = approval();
  a.send(1, 1);
  a.send(1, 2);
  const approved = a.approve(1, 2);
  assert.deepStrictEqual(planApprove(a.state(), { lineId: 1, version: 1, latest: 2, lastChoiceId: approved.id }).error, UNDO_FIRST);
  a.apply(planUndo(a.state(), { eventId: approved.id }));
  const plan = planApprove(a.state(), { lineId: 1, version: 1, latest: 2, lastChoiceId: null });
  assert.deepStrictEqual(plan.events, [{ type: EVENT.APPROVED, line_id: 1, version: 1 }]);
  a.apply(plan);
  assert.strictEqual(lineOf(a.state()).last_choice.kind, "WENT_BACK");
});

check("rule 3: approve answers STALE when the page shows an older version", () => {
  const a = approval();
  a.send(1, 1);
  a.send(1, 2);
  const plan = planApprove(a.state(), { lineId: 1, version: 1, latest: 1, lastChoiceId: null });
  assert.strictEqual(plan.error.status, 409);
  assert.strictEqual(plan.error.code, "STALE");
  assert.strictEqual(plan.error.message, "This was just updated. Please check the latest version.");
});

check("rule 3: approve refuses versions that weren't sent, and lines with nothing to approve", () => {
  const a = approval(3);
  a.send(1, 1);
  a.lines[2].no_proof = 1;
  const state = a.state();
  assert.deepStrictEqual(planApprove(state, { lineId: 1, version: 2, latest: 1 }).error, NO_SUCH_VERSION);
  assert.deepStrictEqual(planApprove(state, { lineId: 1, version: 0, latest: 1 }).error, NO_SUCH_VERSION);
  assert.strictEqual(planApprove(state, { lineId: 2, version: 1, latest: 0 }).error.code, "STALE", "NOT_SENT");
  assert.strictEqual(planApprove(state, { lineId: 3, version: 1, latest: 0 }).error.code, "STALE", "NO_PROOF_NEEDED");
  const malformed = {
    status: 400,
    message: "Send the version to approve, the newest version you saw and your last choice.",
    code: null,
  };
  assert.deepStrictEqual(planApprove(state, { lineId: 1, version: "x", latest: 1 }).error, malformed);
  assert.deepStrictEqual(planApprove(state, { lineId: 1, version: 1 }).error, malformed, "no latest");
  for (const lastChoiceId of ["abc", 1.5, true, { id: 1 }, [3]]) {
    assert.deepStrictEqual(planApprove(state, { lineId: 1, version: 1, latest: 1, lastChoiceId }).error, malformed, String(lastChoiceId));
  }
  assert.deepStrictEqual(planApprove(state, { lineId: 9, version: 1, latest: 1 }).error, {
    status: 404,
    message: "That item isn't part of this order.",
    code: null,
  });
  // No last choice: absent, null, "" and "null" (a form field).
  for (const lastChoiceId of [undefined, null, "", "null"]) {
    assert.deepStrictEqual(planApprove(state, { lineId: 1, version: "1", latest: "1", lastChoiceId }).events, [
      { type: EVENT.APPROVED, line_id: 1, version: 1 },
    ]);
  }
});

// ---------------------------------------------------------------- rule 4: undo

// The two-deep stack: Version 2 rejected, then gone back to Version 1.
const rejectedThenWentBack = () => {
  const a = approval();
  a.send(1, 1);
  a.send(1, 2);
  const [rejection] = a.apply(planReject(a.state(), { lineId: 1, version: 2, lastChoiceId: null, body: "Use red" }));
  const [wentBack] = a.apply(planApprove(a.state(), { lineId: 1, version: 1, latest: 2, lastChoiceId: rejection.id }));
  return { a, rejection, wentBack };
};

check("rule 4: undoing a go back brings back the rejection under it, with its original time", () => {
  const { a, rejection, wentBack } = rejectedThenWentBack();
  a.apply(planUndo(a.state(), { eventId: wentBack.id }));
  const line = lineOf(a.state());
  assert.strictEqual(line.status, LINE.CHANGES_REQUESTED);
  assert.strictEqual(line.approved_version, null);
  assert.deepStrictEqual(line.last_choice, {
    event_id: rejection.id,
    kind: "REJECTED",
    version: 2,
    at: rejection.created_at,
    batch_id: null,
  });
});

check("rule 4: only the last choice can be undone (the rejection under a go back is STALE)", () => {
  const { a, rejection } = rejectedThenWentBack();
  assert.strictEqual(planUndo(a.state(), { eventId: rejection.id }).error.code, "STALE");
});

check("rule 4: undoing the only choice (an approval, or a rejection) goes back to WAITING", () => {
  const a = approval(2);
  a.send(1, 1);
  a.send(2, 1);
  const one = a.approve(1, 1);
  const two = a.reject(2, 1);
  a.apply(planUndo(a.state(), { eventId: one.id }));
  a.apply(planUndo(a.state(), { eventId: two.id }));
  const state = a.state();
  for (const id of [1, 2]) {
    assert.strictEqual(lineOf(state, id).status, LINE.WAITING);
    assert.strictEqual(lineOf(state, id).last_choice, null);
  }
});

check("rule 4: an undo can't be undone, and approving again is the redo", () => {
  const a = approval();
  a.send(1, 1);
  const approved = a.approve(1, 1);
  const [undo] = a.apply(planUndo(a.state(), { eventId: approved.id }));
  assert.deepStrictEqual(planUndo(a.state(), { eventId: undo.id }).error, NOT_A_CHOICE);
  assert.strictEqual(planUndo(a.state(), { eventId: approved.id }).error.code, "STALE");
  const redo = a.apply(planApprove(a.state(), { lineId: 1, version: 1, latest: 1, lastChoiceId: null }));
  assert.strictEqual(redo.length, 1);
  assert.strictEqual(lineOf(a.state()).approved_event_id, redo[0].id);
});

// ---------------------------------------------------------------- rule 5: approve all

check("rule 5: approve all approves each waiting line's newest version as one batch, and leaves a rejected one alone", () => {
  const a = approval(6);
  a.send(1, 1);
  a.send(1, 2); // waiting, v2
  a.send(2, 1);
  a.reject(2, 1); // rejected: left alone
  a.send(3, 1);
  a.approve(3, 1); // approved: skipped
  a.lines[3].no_proof = 1; // no preview needed: skipped
  // line 5: not sent, skipped
  a.send(6, 1); // waiting
  const waiting = [
    { id: 1, latest: 2 },
    { id: 3, latest: 1 },
    { id: 6, latest: 1 },
  ];
  assert.strictEqual(planApproveAll(a.state(), [...waiting, { id: 2, latest: 1 }], BATCH_A).error.code, "STALE", "a rejected line listed");
  const plan = planApproveAll(a.state(), waiting, BATCH_A);
  assert.deepStrictEqual(plan.events, [
    { type: EVENT.APPROVED, line_id: 1, version: 2, batch_id: BATCH_A },
    { type: EVENT.APPROVED, line_id: 6, version: 1, batch_id: BATCH_A },
  ]);
  a.apply(plan);
  const state = a.state();
  assert.strictEqual(lineOf(state, 2).status, LINE.CHANGES_REQUESTED);
  assert.strictEqual(state.status, STATUS.CHANGES_REQUESTED, "line 2 is rejected");
  assert.deepStrictEqual(state.last_batch, { batch_id: BATCH_A, undoable: true, size: 2 });
});

check("rule 5: approve all is refused as a whole when the page is behind", () => {
  const a = approval(2);
  a.send(1, 1);
  a.send(2, 1);
  a.send(2, 2);
  const state = a.state();
  const behind = planApproveAll(state, [{ id: 1, latest: 1 }, { id: 2, latest: 1 }], BATCH_A);
  assert.strictEqual(behind.error.code, "STALE");
  const missing = planApproveAll(state, [{ id: 1, latest: 1 }], BATCH_A);
  assert.strictEqual(missing.error.code, "STALE", "a waiting line the page doesn't show");
  assert.strictEqual(planApproveAll(state, [{ id: 7, latest: 1 }], BATCH_A).error.status, 400);
  assert.strictEqual(planApproveAll(state, "all", BATCH_A).error.status, 400);
});

check("rule 5: undoing a batch undoes only its approvals that are still the last choice", () => {
  const a = approval(2);
  a.send(1, 1);
  a.send(1, 2);
  a.send(2, 1);
  const [one, two] = a.apply(planApproveAll(a.state(), [{ id: 1, latest: 2 }, { id: 2, latest: 1 }], BATCH_A));
  // Line 1: Undo, then Go back to v1.
  a.apply(planUndo(a.state(), { eventId: one.id }));
  const [back] = a.apply(planApprove(a.state(), { lineId: 1, version: 1, latest: 2, lastChoiceId: null }));
  const plan = planUndo(a.state(), { batchId: BATCH_A });
  assert.deepStrictEqual(plan.events, [
    { type: EVENT.APPROVAL_UNDONE, line_id: 2, target_event_id: two.id, version: 1, batch_id: BATCH_A },
  ]);
  a.apply(plan);
  const state = a.state();
  assert.strictEqual(lineOf(state, 1).approved_event_id, back.id);
  assert.strictEqual(lineOf(state, 2).status, LINE.WAITING);
  assert.deepStrictEqual(state.last_batch, { batch_id: BATCH_A, undoable: false, size: 2 });
  assert.strictEqual(planUndo(state, { batchId: BATCH_A }).error.code, "STALE");
  // Undoing the go back leaves line 1 waiting: its batch approval stays undone.
  a.apply(planUndo(a.state(), { eventId: back.id }));
  assert.strictEqual(lineOf(a.state(), 1).status, LINE.WAITING);
});

check("rule 5: an unknown batch is refused", () => {
  const a = approval();
  a.send(1, 1);
  assert.deepStrictEqual(planUndo(a.state(), { batchId: BATCH_B }).error, NOT_A_CHOICE);
  assert.deepStrictEqual(planUndo(a.state(), { batchId: "not-a-batch" }).error, NOT_A_CHOICE);
  assert.deepStrictEqual(planUndo(a.state(), {}).error, {
    status: 400,
    message: "Send the choice to undo as event_id, or an Approve all as batch_id.",
    code: null,
  });
});

// ---------------------------------------------------------------- rule 7: approval status

check("rule 7: DRAFT until something is sent", () => {
  const a = approval(2);
  a.add(EVENT.APPROVAL_STARTED);
  a.add(EVENT.PROOF_ADDED, { line_id: 1 });
  assert.strictEqual(a.state().status, STATUS.DRAFT);
});

check("rule 7: APPROVED when every line is approved or needs no proof, at the time of the last approval", () => {
  const a = approval(3);
  a.send(1, 1);
  a.send(2, 1);
  a.lines[2].no_proof = 1;
  a.add(EVENT.NO_PROOF_SET, { line_id: 3 });
  a.approve(1, 1);
  assert.strictEqual(a.state().status, STATUS.WAITING);
  const completing = a.approve(2, 1);
  const state = a.state();
  assert.strictEqual(state.status, STATUS.APPROVED);
  assert.strictEqual(state.approved_at, completing.created_at);
});

check("rule 7: approved_at is cleared when the approval stops being complete, and set again", () => {
  const a = approval();
  a.send(1, 1);
  const approved = a.approve(1, 1);
  a.apply(planUndo(a.state(), { eventId: approved.id }));
  let state = a.state();
  assert.strictEqual(state.status, STATUS.WAITING);
  assert.strictEqual(state.approved_at, null);
  const again = a.apply(planApprove(state, { lineId: 1, version: 1, latest: 1, lastChoiceId: null }))[0];
  state = a.state();
  assert.strictEqual(state.status, STATUS.APPROVED);
  assert.strictEqual(state.approved_at, again.created_at);
});

check("rule 7: completed by marking the last line 'no proof needed': the newest approval's time", () => {
  const a = approval(2);
  a.send(1, 1);
  a.send(2, 1);
  const approved = a.approve(1, 1);
  a.lines[1].no_proof = 1;
  a.add(EVENT.NO_PROOF_SET, { line_id: 2 });
  const state = a.state();
  assert.strictEqual(state.status, STATUS.APPROVED);
  assert.strictEqual(state.approved_at, approved.created_at);
});

check("rule 7: any rejected line makes CHANGES_REQUESTED", () => {
  const a = approval(2);
  a.send(1, 1);
  a.send(2, 1);
  a.approve(1, 1);
  a.reject(2, 1);
  assert.strictEqual(a.state().status, STATUS.CHANGES_REQUESTED);
});

check("rule 7: a line not sent yet keeps the approval from being APPROVED", () => {
  const a = approval(2);
  a.send(1, 1);
  a.approve(1, 1);
  const state = a.state();
  assert.strictEqual(state.status, STATUS.WAITING);
  assert.strictEqual(state.approved_at, null);
});

check("rule 7: no proof needed everywhere and nothing approved isn't APPROVED", () => {
  const a = approval(1);
  a.send(1, 1);
  a.lines[0].no_proof = 1;
  assert.notStrictEqual(a.state().status, STATUS.APPROVED);
});

// ---------------------------------------------------------------- rule 8: whose events

check("rule 8: a customer can't undo the team's events", () => {
  const a = approval();
  const sent = a.send(1, 1);
  const teamApproval = a.add(EVENT.APPROVED, { line_id: 1, version: 1, actor: ACTOR.ADMIN });
  const teamNote = a.add(EVENT.NOTE_ADDED, { line_id: 1, version: 1, actor: ACTOR.ADMIN });
  const state = a.state();
  for (const event of [teamApproval, teamNote, sent]) {
    assert.deepStrictEqual(planUndo(state, { eventId: event.id }).error, NOT_A_CHOICE, event.type);
  }
});

check("rule 8: undoing a rejection twice is STALE", () => {
  const a = approval();
  a.send(1, 1);
  const rejection = a.reject(1, 1);
  a.apply(planUndo(a.state(), { eventId: rejection.id }));
  assert.strictEqual(planUndo(a.state(), { eventId: rejection.id }).error.code, "STALE");
});

// ---------------------------------------------------------------- cached columns

check("cached columns: last customer event, drafts, and ids given as strings", () => {
  const lines = [{ id: "1", no_proof: "0" }];
  const events = [
    { id: "1", type: EVENT.VERSION_SENT, actor: ACTOR.ADMIN, line_id: "1", version: "1", created_at: new Date() },
    { id: "2", type: EVENT.APPROVED, actor: ACTOR.CUSTOMER, line_id: "1", version: "1", created_at: new Date() },
    { id: "3", type: EVENT.EMAIL_SENT, actor: ACTOR.ADMIN, line_id: null, created_at: new Date() },
  ];
  const files = [
    { line_id: "1", kind: "PROOF", version: null, removed_at: null },
    { line_id: "1", kind: "PROOF", version: null, removed_at: new Date() },
    { line_id: "1", kind: "PROOF", version: 1, removed_at: null },
    { line_id: "1", kind: "PICTURE", version: null, removed_at: null },
  ];
  const state = approvalState({ lines, events, files });
  assert.strictEqual(state.last_customer_event_id, 2);
  assert.strictEqual(state.lines.get(1).status, LINE.APPROVED);
  assert.strictEqual(state.lines.get(1).draft_count, 1);
});

check("cached columns: events out of id order are read in id order", () => {
  const a = approval();
  a.send(1, 1);
  const approved = a.approve(1, 1);
  a.add(EVENT.APPROVAL_UNDONE, { line_id: 1, target_event_id: approved.id });
  const shuffled = [...a.events].reverse();
  assert.strictEqual(approvalState({ lines: a.lines, events: shuffled }).lines.get(1).status, LINE.WAITING);
});

// ---------------------------------------------------------------- 24 Nov: Reject, Go back, Undo

check("new 1: Reject from waiting: CHANGES_REQUESTED, the version Rejected with its note; Go back offered with an older version", () => {
  for (const sent of [1, 2]) {
    const a = approval();
    for (let version = 1; version <= sent; version++) a.send(1, version);
    const [rejection] = a.apply(planReject(a.state(), { lineId: 1, version: sent, lastChoiceId: null, body: "Use red" }));
    assert.strictEqual(rejection.body, "Use red");
    const line = lineOf(a.state());
    assert.strictEqual(line.status, LINE.CHANGES_REQUESTED);
    const newest = line.versions[sent - 1];
    assert.deepStrictEqual(
      [newest.status, newest.note_event_id, newest.decided_at, newest.went_back_to],
      ["REJECTED", rejection.id, rejection.created_at, null],
    );
    assert.deepStrictEqual(line.last_choice, {
      event_id: rejection.id,
      kind: "REJECTED",
      version: sent,
      at: rejection.created_at,
      batch_id: null,
    });
    assert.deepStrictEqual(line.actions, { ...ONLY_UNDO, go_back_to: sent === 2 ? [1] : [] });
  }
});

check("new 2: Reject is refused after a choice, with nothing to decide, for versions not sent, and when the page is behind", () => {
  const a = approval(3);
  a.send(1, 1);
  a.send(1, 2);
  a.lines[2].no_proof = 1; // line 3: no preview needed (line 2: not sent)
  const [approved] = a.apply(planApprove(a.state(), { lineId: 1, version: 2, latest: 2, lastChoiceId: null }));
  assert.deepStrictEqual(planReject(a.state(), { lineId: 1, version: 2, lastChoiceId: approved.id }).error, UNDO_FIRST, "after Approve");
  a.apply(planUndo(a.state(), { eventId: approved.id }));
  const [wentBack] = a.apply(planApprove(a.state(), { lineId: 1, version: 1, latest: 2, lastChoiceId: null }));
  assert.deepStrictEqual(planReject(a.state(), { lineId: 1, version: 2, lastChoiceId: wentBack.id }).error, UNDO_FIRST, "after Go back");
  a.apply(planUndo(a.state(), { eventId: wentBack.id }));

  const state = a.state();
  const refusal = (fields) => planReject(state, { lineId: 1, version: 2, lastChoiceId: null, ...fields }).error;
  assert.strictEqual(refusal({ lineId: 2, version: 1 }).code, "STALE", "NOT_SENT");
  assert.strictEqual(refusal({ lineId: 3, version: 1 }).code, "STALE", "NO_PROOF_NEEDED");
  for (const version of [0, 3]) assert.deepStrictEqual(refusal({ version }), NO_SUCH_VERSION);
  assert.strictEqual(refusal({ version: 1 }).code, "STALE", "an older version");
  assert.strictEqual(refusal({ lastChoiceId: wentBack.id }).code, "STALE", "a last choice that was taken back");
  const malformed = { status: 400, message: "Send the version you're rejecting and your last choice.", code: null };
  assert.deepStrictEqual(refusal({ version: "two" }), malformed);
  assert.deepStrictEqual(refusal({ lastChoiceId: "first" }), malformed);
  assert.strictEqual(refusal({ lineId: 9 }).status, 404);
  assert.deepStrictEqual(planReject(state, { lineId: 1, version: "2", lastChoiceId: "null" }).events, [
    { type: EVENT.NOTE_ADDED, line_id: 1, version: 2, body: null },
  ]);
});

check("new 3: undoing a rejection writes NOTE_REMOVED with its version, and the line waits again", () => {
  const a = approval();
  a.send(1, 1);
  const rejection = a.reject(1, 1);
  const plan = planUndo(a.state(), { eventId: rejection.id });
  assert.deepStrictEqual(plan.events, [{ type: EVENT.NOTE_REMOVED, line_id: 1, target_event_id: rejection.id, version: 1 }]);
  const [undo] = a.apply(plan);
  const state = a.state();
  const line = lineOf(state);
  assert.strictEqual(line.status, LINE.WAITING);
  assert.strictEqual(line.versions[0].status, "WAITING");
  assert.deepStrictEqual(state.notes.get(rejection.id), { removed: true, removed_at: undo.created_at, line_id: 1 });
  assert.ok(isUndone(state, rejection));
  assert.strictEqual(eventKind(state, undo), "UNDID_REJECTION");
  assert.strictEqual(planUndo(state, { eventId: rejection.id }).error.code, "STALE");
});

check("new 4: going back from waiting approves the older version and rejects the newer", () => {
  const a = approval();
  a.send(1, 1);
  a.send(1, 2);
  const plan = planApprove(a.state(), { lineId: 1, version: 1, latest: 2, lastChoiceId: null });
  assert.deepStrictEqual(plan.events, [{ type: EVENT.APPROVED, line_id: 1, version: 1 }]);
  const [wentBack] = a.apply(plan);
  const state = a.state();
  const line = lineOf(state);
  assert.deepStrictEqual([line.status, line.approved_version, line.approved_event_id], [LINE.APPROVED, 1, wentBack.id]);
  assert.deepStrictEqual(statusesOf(line), [
    ["APPROVED", null, null],
    ["REJECTED", 1, null],
  ]);
  assert.strictEqual(line.last_choice.kind, "WENT_BACK");
  assert.strictEqual(eventKind(state, wentBack), "WENT_BACK");
  assert.deepStrictEqual(line.actions, ONLY_UNDO);
});

check("new 5: the user's example: reject Version 2, go back to Version 1, then undo twice", () => {
  const a = approval();
  a.send(1, 1);
  const first = a.reject(1, 1, "Make the logo bigger");
  a.send(1, 2);
  let line = lineOf(a.state());
  assert.deepStrictEqual(line.actions, { approve: true, reject: true, go_back_to: [1], undo: false });
  assert.deepStrictEqual(statusesOf(line), [
    ["REJECTED", null, first.id],
    ["WAITING", null, null],
  ]);

  const [useRed] = a.apply(planReject(a.state(), { lineId: 1, version: 2, lastChoiceId: null, body: "Use red" }));
  const [wentBack] = a.apply(planApprove(a.state(), { lineId: 1, version: 1, latest: 2, lastChoiceId: useRed.id }));
  line = lineOf(a.state());
  assert.deepStrictEqual([line.status, line.approved_version], [LINE.APPROVED, 1]);
  assert.deepStrictEqual(statusesOf(line), [
    ["APPROVED", null, null],
    ["REJECTED", 1, useRed.id],
  ]);

  a.apply(planUndo(a.state(), { eventId: wentBack.id }));
  line = lineOf(a.state());
  assert.strictEqual(line.status, LINE.CHANGES_REQUESTED);
  assert.deepStrictEqual(line.last_choice, { event_id: useRed.id, kind: "REJECTED", version: 2, at: useRed.created_at, batch_id: null });
  assert.deepStrictEqual(statusesOf(line), [
    ["REJECTED", null, first.id],
    ["REJECTED", null, useRed.id],
  ]);
  assert.deepStrictEqual(line.actions, { ...ONLY_UNDO, go_back_to: [1] });

  a.apply(planUndo(a.state(), { eventId: useRed.id }));
  line = lineOf(a.state());
  assert.strictEqual(line.status, LINE.WAITING);
  assert.deepStrictEqual(statusesOf(line), [
    ["REJECTED", null, first.id],
    ["WAITING", null, null],
  ]);
  assert.deepStrictEqual(line.actions, { approve: true, reject: true, go_back_to: [1], undo: false });
});

check("new 6: going back after a rejection keeps the rejected version's note", () => {
  const a = approval();
  a.send(1, 1);
  a.send(1, 2);
  const [useRed] = a.apply(planReject(a.state(), { lineId: 1, version: 2, lastChoiceId: null, body: "Use red" }));
  const [wentBack] = a.apply(planApprove(a.state(), { lineId: 1, version: 1, latest: 2, lastChoiceId: useRed.id }));
  const v2 = lineOf(a.state()).versions[1];
  assert.deepStrictEqual(
    [v2.status, v2.note_event_id, v2.went_back_to, v2.decided_at],
    ["REJECTED", useRed.id, 1, wentBack.created_at],
  );
});

check("new 7: three versions: going back to 1 rejects 2 and 3; going back to 2 rejects only 3", () => {
  const a = approval(2);
  a.send(1, 1);
  a.send(2, 1);
  const first = a.reject(1, 1); // line 2's Version 1 is never decided
  for (const version of [2, 3]) {
    a.send(1, version);
    a.send(2, version);
  }
  let line = lineOf(a.state());
  assert.deepStrictEqual(line.actions.go_back_to, [2, 1]);
  assert.deepStrictEqual(statusesOf(line), [
    ["REJECTED", null, first.id],
    ["REPLACED", null, null],
    ["WAITING", null, null],
  ]);

  const [toOne] = a.apply(planApprove(a.state(), { lineId: 1, version: 1, latest: 3, lastChoiceId: null }));
  assert.deepStrictEqual(statusesOf(lineOf(a.state())), [
    ["APPROVED", null, null],
    ["REJECTED", 1, null],
    ["REJECTED", 1, null],
  ]);
  a.apply(planUndo(a.state(), { eventId: toOne.id }));
  a.apply(planApprove(a.state(), { lineId: 1, version: 2, latest: 3, lastChoiceId: null }));
  a.apply(planApprove(a.state(), { lineId: 2, version: 2, latest: 3, lastChoiceId: null }));
  const state = a.state();
  line = lineOf(state);
  assert.deepStrictEqual([line.status, line.approved_version], [LINE.APPROVED, 2]);
  assert.deepStrictEqual(statusesOf(line), [
    ["REJECTED", null, first.id],
    ["APPROVED", null, null],
    ["REJECTED", 2, null],
  ]);
  assert.deepStrictEqual(statusesOf(lineOf(state, 2)), [
    ["REPLACED", null, null],
    ["APPROVED", null, null],
    ["REJECTED", 2, null],
  ]);
});

check("new 8: only Version 1: Approve and Reject, nothing to go back to", () => {
  const a = approval();
  a.send(1, 1);
  const state = a.state();
  assert.deepStrictEqual(lineOf(state).actions, { approve: true, reject: true, go_back_to: [], undo: false });
  assert.deepStrictEqual(planApprove(state, { lineId: 1, version: 0, latest: 1, lastChoiceId: null }).error, NO_SUCH_VERSION);
  assert.strictEqual(planApprove(state, { lineId: 1, version: 1, latest: 1, lastChoiceId: null }).events.length, 1);
  assert.strictEqual(planReject(state, { lineId: 1, version: 1, lastChoiceId: null }).events.length, 1);
});

check("new 9: Approve only from waiting; Go back only from waiting or a rejection", () => {
  const a = approval();
  for (const version of [1, 2, 3]) a.send(1, version);
  const plan = (version, lastChoiceId) => planApprove(a.state(), { lineId: 1, version, latest: 3, lastChoiceId });

  const [approved] = a.apply(plan(3, null));
  assert.deepStrictEqual(plan(1, approved.id).error, UNDO_FIRST, "go back on top of an approval");
  a.apply(planUndo(a.state(), { eventId: approved.id }));

  const [rejection] = a.apply(planReject(a.state(), { lineId: 1, version: 3, lastChoiceId: null }));
  assert.deepStrictEqual(plan(3, rejection.id).error, UNDO_FIRST, "approve on top of a rejection");
  const [wentBack] = a.apply(plan(1, rejection.id));
  assert.deepStrictEqual(plan(3, wentBack.id).error, UNDO_FIRST, "approve on top of a go back");
  assert.deepStrictEqual(plan(2, wentBack.id).error, UNDO_FIRST, "go back on top of a go back");
});

check("new 10: asking for exactly what's already chosen writes nothing, even with a stale last choice", () => {
  const a = approval();
  a.send(1, 1);
  a.send(1, 2);
  const [approved] = a.apply(planApprove(a.state(), { lineId: 1, version: 2, latest: 2, lastChoiceId: null }));
  for (const lastChoiceId of [approved.id, null, 999]) {
    assert.deepStrictEqual(planApprove(a.state(), { lineId: 1, version: 2, latest: 2, lastChoiceId }), { events: [] });
  }
  a.apply(planUndo(a.state(), { eventId: approved.id }));
  const [wentBack] = a.apply(planApprove(a.state(), { lineId: 1, version: 1, latest: 2, lastChoiceId: null }));
  for (const lastChoiceId of [wentBack.id, null, approved.id]) {
    assert.deepStrictEqual(planApprove(a.state(), { lineId: 1, version: 1, latest: 2, lastChoiceId }), { events: [] });
  }
});

check("new 11: approve is STALE when the page is behind or showed another last choice", () => {
  const a = approval();
  a.send(1, 1);
  a.send(1, 2);
  const isStale = (fields) =>
    planApprove(a.state(), { lineId: 1, version: 1, latest: 2, lastChoiceId: null, ...fields }).error?.code === "STALE";
  assert.ok(isStale({ latest: 1 }), "latest behind");
  const [rejection] = a.apply(planReject(a.state(), { lineId: 1, version: 2, lastChoiceId: null }));
  assert.ok(isStale({ lastChoiceId: null }), "the page showed no choice, but there is one");
  a.apply(planUndo(a.state(), { eventId: rejection.id }));
  assert.ok(isStale({ lastChoiceId: rejection.id }), "the page showed a choice that was taken back");
  assert.ok(!isStale({}), "with what the page should show, it goes through");
});

check("new 12: a new version after a rejection: Version 1 stays Rejected with its note, and the rejection is final", () => {
  const a = approval();
  a.send(1, 1);
  const rejection = a.reject(1, 1, "Make the logo bigger");
  a.send(1, 2);
  const state = a.state();
  const line = lineOf(state);
  assert.deepStrictEqual([line.status, line.last_choice], [LINE.WAITING, null]);
  assert.deepStrictEqual(statusesOf(line), [
    ["REJECTED", null, rejection.id],
    ["WAITING", null, null],
  ]);
  assert.deepStrictEqual(state.notes.get(rejection.id), { removed: false, removed_at: null, line_id: 1 });
  assert.strictEqual(planUndo(state, { eventId: rejection.id }).error.code, "STALE");
});

check("new 13: a new version after an approval: Version 1 Replaced, the line waits", () => {
  const a = approval();
  a.send(1, 1);
  const approved = a.approve(1, 1);
  a.send(1, 2);
  const state = a.state();
  const line = lineOf(state);
  assert.deepStrictEqual([line.status, line.last_choice, line.approved_version], [LINE.WAITING, null, null]);
  assert.deepStrictEqual(statusesOf(line), [
    ["REPLACED", null, null],
    ["WAITING", null, null],
  ]);
  assert.ok(!isUndone(state, approved), "final, not undone");
});

check("new 14: a new version after a go back: the approved version Replaced, the ones it rejected stay Rejected", () => {
  const a = approval();
  a.send(1, 1);
  a.send(1, 2);
  a.apply(planApprove(a.state(), { lineId: 1, version: 1, latest: 2, lastChoiceId: null }));
  a.send(1, 3);
  const line = lineOf(a.state());
  assert.strictEqual(line.status, LINE.WAITING);
  assert.deepStrictEqual(statusesOf(line), [
    ["REPLACED", null, null],
    ["REJECTED", 1, null],
    ["WAITING", null, null],
  ]);
});

check("new 15: a version nobody decided before a newer one came is Replaced", () => {
  const a = approval();
  a.send(1, 1);
  a.send(1, 2);
  const line = lineOf(a.state());
  assert.deepStrictEqual(statusesOf(line), [
    ["REPLACED", null, null],
    ["WAITING", null, null],
  ]);
  assert.deepStrictEqual(line.versions.map((version) => version.decided_at), [null, null]);
});

check("new 16: Approve all approves only the waiting lines, as one batch; its size and Undo", () => {
  const a = approval(5);
  a.send(1, 1); // waiting
  a.send(2, 1); // waiting
  a.send(3, 1);
  a.reject(3, 1); // rejected: left alone
  a.send(4, 1);
  a.approve(4, 1); // approved: listed, skipped
  a.send(5, 1); // waiting
  let state = a.state();
  const listed = [
    { id: 1, latest: 1 },
    { id: 2, latest: 1 },
    { id: 4, latest: 1 },
  ];
  assert.strictEqual(planApproveAll(state, listed, BATCH_A).error.code, "STALE", "a waiting line not listed");
  const all = [...listed, { id: 5, latest: 1 }];
  assert.strictEqual(planApproveAll(state, [...all, { id: 3, latest: 1 }], BATCH_A).error.code, "STALE", "a rejected line listed");
  const plan = planApproveAll(state, all, BATCH_A);
  assert.deepStrictEqual(
    plan.events.map((event) => [event.line_id, event.version, event.batch_id]),
    [
      [1, 1, BATCH_A],
      [2, 1, BATCH_A],
      [5, 1, BATCH_A],
    ],
  );
  const [one] = a.apply(plan);
  state = a.state();
  assert.deepStrictEqual(state.last_batch, { batch_id: BATCH_A, undoable: true, size: 3 });
  assert.deepStrictEqual(planApproveAll(state, all, BATCH_B), { events: [] }, "the same Approve all again writes nothing");
  a.apply(planUndo(state, { eventId: one.id }));
  assert.deepStrictEqual(a.state().last_batch, { batch_id: BATCH_A, undoable: true, size: 3 }, "the size stays after one item's Undo");
  a.apply(planUndo(a.state(), { batchId: BATCH_A }));
  assert.deepStrictEqual(a.state().last_batch, { batch_id: BATCH_A, undoable: false, size: 3 });
});

check("new 17: the team's APPROVED and NOTE_ADDED are never choices", () => {
  const a = approval();
  a.send(1, 1);
  const teamApproval = a.add(EVENT.APPROVED, { line_id: 1, version: 1, actor: ACTOR.ADMIN });
  const teamNote = a.add(EVENT.NOTE_ADDED, { line_id: 1, version: 1, actor: ACTOR.ADMIN, body: "x" });
  const state = a.state();
  const line = lineOf(state);
  assert.deepStrictEqual([line.status, line.last_choice, line.versions[0].status], [LINE.WAITING, null, "WAITING"]);
  for (const event of [teamApproval, teamNote]) {
    assert.strictEqual(eventKind(state, event), null);
    assert.deepStrictEqual(planUndo(state, { eventId: event.id }).error, NOT_A_CHOICE);
  }
});

check("new 18: a NOTE_RESTORED from 23 Nov changes nothing: the note stays taken back", () => {
  const a = approval();
  a.send(1, 1);
  const rejection = a.reject(1, 1);
  const removed = a.undoNote(rejection.id);
  const restored = a.add(EVENT.NOTE_RESTORED, { line_id: 1, target_event_id: rejection.id });
  const state = a.state();
  assert.strictEqual(lineOf(state).status, LINE.WAITING);
  assert.deepStrictEqual(state.notes.get(rejection.id), { removed: true, removed_at: removed.created_at, line_id: 1 });
  assert.strictEqual(eventKind(state, restored), null);
});

check("new 19: a go back that approves the last open line completes the approval at its time; undoing it clears approved_at", () => {
  const a = approval(2);
  a.send(1, 1);
  a.approve(1, 1);
  a.send(2, 1);
  a.send(2, 2);
  const [wentBack] = a.apply(planApprove(a.state(), { lineId: 2, version: 1, latest: 2, lastChoiceId: null }));
  let state = a.state();
  assert.deepStrictEqual([state.status, state.approved_at], [STATUS.APPROVED, wentBack.created_at]);
  a.apply(planUndo(state, { eventId: wentBack.id }));
  state = a.state();
  assert.deepStrictEqual([state.status, state.approved_at], [STATUS.WAITING, null]);
});

check("new 20: history kinds, each with its version, and the newest version when a choice was made", () => {
  const a = approval(2);
  a.add(EVENT.EMAIL_SENT);
  a.send(1, 1);
  a.send(2, 1);
  a.send(1, 2);
  const lines = [
    { id: 1, latest: 2 },
    { id: 2, latest: 1 },
  ];
  a.apply(planApproveAll(a.state(), lines, BATCH_A));
  a.apply(planUndo(a.state(), { batchId: BATCH_A }));
  const [single] = a.apply(planApprove(a.state(), { lineId: 1, version: 2, latest: 2, lastChoiceId: null }));
  a.apply(planUndo(a.state(), { eventId: single.id }));
  const [rejection] = a.apply(planReject(a.state(), { lineId: 1, version: 2, lastChoiceId: null }));
  const [wentBack] = a.apply(planApprove(a.state(), { lineId: 1, version: 1, latest: 2, lastChoiceId: rejection.id }));
  a.apply(planUndo(a.state(), { eventId: wentBack.id }));
  a.apply(planUndo(a.state(), { eventId: rejection.id }));

  const state = a.state();
  assert.deepStrictEqual(
    a.events.map((event) => [eventKind(state, event), event.version]),
    [
      [null, null],
      ["SENT", 1],
      ["SENT", 1],
      ["SENT", 2],
      ["APPROVED", 2],
      ["APPROVED", 1],
      ["UNDID_APPROVAL", 2],
      ["UNDID_APPROVAL", 1],
      ["APPROVED", 2],
      ["UNDID_APPROVAL", 2],
      ["REJECTED", 2],
      ["WENT_BACK", 1],
      ["UNDID_GO_BACK", 1],
      ["UNDID_REJECTION", 2],
    ],
  );
  // newest_version: the line's newest version when each choice was made.
  assert.deepStrictEqual(
    [...state.choices.values()].map((choice) => [choice.id, choice.kind, choice.newest_version, choice.batch_id]),
    [
      [5, "APPROVED", 2, BATCH_A],
      [6, "APPROVED", 1, BATCH_A],
      [9, "APPROVED", 2, null],
      [11, "REJECTED", 2, null],
      [12, "WENT_BACK", 2, null],
    ],
  );
  assert.ok([5, 6, 9, 11, 12].every((id) => isUndone(state, a.events[id - 1])), "every choice was undone");
});

check("new 21: 'No preview needed' after a choice: nothing to undo; the choice comes back when it's switched off", () => {
  const a = approval();
  a.send(1, 1);
  const approved = a.approve(1, 1);
  a.lines[0].no_proof = 1;
  a.add(EVENT.NO_PROOF_SET, { line_id: 1 });
  let state = a.state();
  let line = lineOf(state);
  assert.deepStrictEqual([line.status, line.last_choice, line.actions], [LINE.NO_PROOF_NEEDED, null, NOTHING_TO_DO]);
  assert.strictEqual(planUndo(state, { eventId: approved.id }).error.code, "STALE");
  assert.strictEqual(planApprove(state, { lineId: 1, version: 1, latest: 1, lastChoiceId: approved.id }).error.code, "STALE");
  assert.strictEqual(planReject(state, { lineId: 1, version: 1, lastChoiceId: null }).error.code, "STALE");

  // Approve all on two lines, then line 2 marked "No preview needed".
  const b = approval(2);
  b.send(1, 1);
  b.send(2, 1);
  const [, two] = b.apply(planApproveAll(b.state(), [{ id: 1, latest: 1 }, { id: 2, latest: 1 }], BATCH_B));
  b.lines[1].no_proof = 1;
  b.add(EVENT.NO_PROOF_SET, { line_id: 2 });
  state = b.state();
  assert.deepStrictEqual(state.last_batch, { batch_id: BATCH_B, undoable: true, size: 2 });
  const plan = planUndo(state, { batchId: BATCH_B });
  assert.deepStrictEqual(plan.events.map((event) => event.line_id), [1], "only line 1's approval is undone");
  b.apply(plan);
  state = b.state();
  assert.deepStrictEqual(state.last_batch, { batch_id: BATCH_B, undoable: false, size: 2 });
  assert.strictEqual(planUndo(state, { batchId: BATCH_B }).error.code, "STALE");

  // Switched off again: line 2's batch approval is its last choice again, with its Undo.
  b.lines[1].no_proof = 0;
  b.add(EVENT.NO_PROOF_CLEARED, { line_id: 2 });
  state = b.state();
  line = lineOf(state, 2);
  assert.strictEqual(line.status, LINE.APPROVED);
  assert.deepStrictEqual(line.last_choice, { event_id: two.id, kind: "APPROVED", version: 1, at: two.created_at, batch_id: BATCH_B });
  assert.strictEqual(state.last_batch.undoable, true);
  b.apply(planUndo(state, { eventId: two.id }));
  assert.strictEqual(lineOf(b.state(), 2).status, LINE.WAITING);
});

check("new 22: histories from 23 Nov never throw, and never show two Approved versions", () => {
  const oneApproved = (line) => {
    const approved = line.versions.filter((version) => version.status === "APPROVED").map((version) => version.version);
    assert.ok(approved.length <= 1, `Approved versions: ${approved}`);
    if (approved.length) assert.strictEqual(approved[0], line.approved_version);
  };

  // (a) an approval of v1, then of v2, in one round (v2 the newest)
  let a = approval();
  a.send(1, 1);
  a.send(1, 2);
  a.approve(1, 1);
  a.approve(1, 2);
  let line = lineOf(a.state());
  assert.deepStrictEqual(line.versions.map((version) => version.status), ["REPLACED", "APPROVED"]);
  assert.deepStrictEqual([line.status, line.approved_version], [LINE.APPROVED, 2]);
  oneApproved(line);

  // (b) an approval, then a note on the same version ("Keep my approval")
  a = approval();
  a.send(1, 1);
  a.approve(1, 1);
  a.reject(1, 1, "Keep it, but check the spelling");
  line = lineOf(a.state());
  assert.deepStrictEqual([line.status, line.versions[0].status], [LINE.CHANGES_REQUESTED, "REJECTED"]);
  oneApproved(line);

  // (c) a note removed, then restored
  a = approval();
  a.send(1, 1);
  const note = a.reject(1, 1);
  a.undoNote(note.id);
  a.add(EVENT.NOTE_RESTORED, { line_id: 1, target_event_id: note.id });
  let state = a.state();
  assert.deepStrictEqual([lineOf(state).status, state.notes.get(note.id).removed], [LINE.WAITING, true]);

  // (d) a note on v1 written while v2 was the newest
  a = approval();
  a.send(1, 1);
  a.send(1, 2);
  a.reject(1, 1);
  line = lineOf(a.state());
  assert.deepStrictEqual([line.status, line.last_choice.version, line.versions[1].status], [LINE.CHANGES_REQUESTED, 1, "WAITING"]);
  oneApproved(line);

  // (e) an approval of v1 while v2 was the newest, then a note on v2
  a = approval();
  a.send(1, 1);
  a.send(1, 2);
  a.approve(1, 1);
  a.reject(1, 2);
  line = lineOf(a.state());
  assert.strictEqual(line.status, LINE.CHANGES_REQUESTED);
  assert.ok(!line.versions.some((version) => version.status === "APPROVED"), "no Approved version");

  // (f) swapping an approved version keeps the time the approval was completed
  a = approval();
  a.send(1, 1);
  a.send(1, 2);
  const completing = a.approve(1, 2);
  a.approve(1, 1);
  state = a.state();
  assert.strictEqual(state.approved_at, completing.created_at);
  oneApproved(lineOf(state));
});

// ---------------------------------------------------------------- lines from order items

const tee = (id, size, quantity, overrides = {}) => ({
  id,
  product_id: 104512,
  title: "Heavy Cotton Tee",
  color: "Black",
  size,
  options: null,
  quantity,
  manual: false,
  config: {
    product_id: 104512,
    graphic_id: 88,
    print_method: "DTF",
    locations: [{ location: "LEFT_CHEST" }, { location: "FULL_BACK_STANDARD" }],
    customizations: [{ variant_id: 551, color: "Black", size: "M", quantity: 6, total_price: 99 }],
    size: { variant_id: 500 + id, size_id: id, quantity },
    graphics: [{ id: 88, file_path: "/graphics/graphic-1-a.png", original_name: "logo.png" }],
  },
  snapshot: null,
  design_preview: "/images/images-1-customization.png",
  ...overrides,
});

check("lines: the sizes of one design in one colour are one line", () => {
  const lines = groupLines([tee(3, "L", 1), tee(1, "S", 2), tee(2, "M", 3)]);
  assert.strictEqual(lines.length, 1);
  assert.deepStrictEqual(lines[0].order_item_ids, [1, 2, 3]);
  assert.strictEqual(lines[0].position, 1);
  assert.strictEqual(lines[0].detail.sizes_text, "S × 2, M × 3, L × 1");
  assert.deepStrictEqual(lines[0].detail.print_methods, ["DTF"]);
  assert.deepStrictEqual(lines[0].detail.locations, ["Left chest", "Full back standard"]);
  assert.deepStrictEqual(lines[0].detail.customer_artwork, [
    { path: "/graphics/graphic-1-a.png", name: "logo.png" },
    { path: "/images/images-1-customization.png", name: "Design preview" },
  ]);
});

check("lines: another colour, another design or another product is another line", () => {
  const otherDesign = tee(4, "M", 1);
  otherDesign.config = { ...otherDesign.config, locations: [{ location: "LEFT_CHEST" }] };
  const lines = groupLines([
    tee(1, "S", 2),
    tee(2, "S", 2, { color: "White" }),
    otherDesign,
    tee(5, "S", 2, { product_id: 999 }),
  ]);
  assert.strictEqual(lines.length, 4);
  assert.deepStrictEqual(
    lines.map((line) => line.order_item_ids),
    [[1], [2], [4], [5]],
  );
});

check("lines: the same design added twice is one line, whatever order its keys are in", () => {
  const again = tee(2, "S", 4);
  again.config = Object.fromEntries(Object.entries(again.config).reverse());
  again.config.customizations = [{ variant_id: 552, color: "Black", size: "S", quantity: 4, total_price: 60 }];
  const lines = groupLines([tee(1, "S", 2), again]);
  assert.strictEqual(lines.length, 1);
  assert.strictEqual(lines[0].detail.sizes_text, "S × 6");
});

check("lines: MANUAL items are never grouped, and show their options", () => {
  const card = (id) => ({
    id,
    product_id: 7,
    title: "Business cards",
    color: null,
    size: null,
    options: "Paper: Matte",
    quantity: 500,
    manual: true,
    config: {
      type: "MANUAL",
      quantity: 500,
      customization: [
        { customization_option_id: 1, customization_option_value_id: 6, graphic_id: 88, logo_image: "/graphics/c-1.png" },
        { customization_option_id: 2, customization_option_value_id: 9, text: "ACME Inc." },
      ],
    },
    snapshot: {
      customization: {
        items: [
          { customization_option_id: 1, option_name: "Logo", customization_option_value_id: 6, value_name: "Front" },
          { customization_option_id: 2, option_name: "Name", customization_option_value_id: 9, value_name: "One line" },
        ],
      },
    },
    design_preview: null,
    artwork_names: new Map([[88, "acme.svg"]]),
  });
  const lines = groupLines([card(1), card(2)]);
  assert.strictEqual(lines.length, 2);
  assert.strictEqual(lines[0].detail.sizes_text, "Paper: Matte × 500");
  assert.deepStrictEqual(lines[0].detail.print_methods, ["Logo: Front", 'Name: One line "ACME Inc."']);
  assert.deepStrictEqual(lines[0].detail.customer_artwork, [{ path: "/graphics/c-1.png", name: "acme.svg" }]);
});

check("lines: screen print colours and DTG style are part of the print method", () => {
  const screen = tee(1, "S", 12);
  screen.config = { ...screen.config, print_method: "SCREEN_PRINT", colors: 2 };
  const dtg = tee(2, "S", 1, { color: "White" });
  dtg.config = { ...dtg.config, print_method: "DTG", dtg_style: "FRONT_REGULAR" };
  const [first, second] = groupLines([screen, dtg]);
  assert.deepStrictEqual(first.detail.print_methods, ["Screen print (2 colors)"]);
  assert.deepStrictEqual(second.detail.print_methods, ["DTG (Front regular)"]);
  assert.strictEqual(humanize("EMBROIDERY"), "Embroidery");
});

check("customized: decorations count, blanks don't", () => {
  assert.strictEqual(isCustomizedConfig(tee(1, "S", 1).config), true);
  assert.strictEqual(isCustomizedConfig({ print_method: "DTF" }), true);
  assert.strictEqual(isCustomizedConfig({ locations: [{ location: "LEFT_CHEST" }] }), true);
  assert.strictEqual(isCustomizedConfig({ graphics: [{ id: 1 }] }), true);
  assert.strictEqual(isCustomizedConfig({ graphic_id: 5 }), true);
  assert.strictEqual(isCustomizedConfig({ type: "MANUAL", customization: [{ text: "Hi" }] }), true);
  assert.strictEqual(isCustomizedConfig({ custom_text: "Team 2026" }), true);
  assert.strictEqual(
    isCustomizedConfig({ product_id: 1, customizations: [{ variant_id: 1 }], size: { variant_id: 1 }, graphics: [] }),
    false,
  );
  assert.strictEqual(isCustomizedConfig({ type: "MANUAL", quantity: 50, customization: [], addons: [] }), false);
  assert.strictEqual(isCustomizedConfig(null), false);
  assert.strictEqual(isCustomizedConfig("text"), false);
});

console.log(`${passed} approval rule checks passed, ${failed.length} failed.`);
if (failed.length) process.exit(1);
