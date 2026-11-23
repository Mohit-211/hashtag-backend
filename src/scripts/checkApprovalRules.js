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
  planApprove,
  planApproveAll,
  planUndo,
  planUndoLine,
  planNoteChange,
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
  let clock = Date.UTC(2026, 10, 23, 15, 0, 0);

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
  const note = (lineId, version, body = "Make the logo bigger") => add(EVENT.NOTE_ADDED, { line_id: lineId, version, body });
  // Writes what a planner decided, as the customer's events.
  const apply = (plan) => {
    assert.ok(!plan.error, `planner refused: ${JSON.stringify(plan.error)}`);
    return plan.events.map((event) => add(event.type, event));
  };

  return { lines, events, add, state, send, approve, note, apply };
};

const lineOf = (state, id = 1) => state.lines.get(id);
const BATCH_A = "a".repeat(32);
const BATCH_B = "b".repeat(32);

// ---------------------------------------------------------------- rule 1: live approvals

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
  a.note(1, 0);
  assert.strictEqual(lineOf(a.state()).status, LINE.NOT_SENT);
});

check("rule 2: sent and untouched is WAITING", () => {
  const a = approval();
  a.send(1, 1);
  assert.strictEqual(lineOf(a.state()).status, LINE.WAITING);
});

check("rule 2: an active note is CHANGES_REQUESTED", () => {
  const a = approval();
  a.send(1, 1);
  a.note(1, 1);
  assert.strictEqual(lineOf(a.state()).status, LINE.CHANGES_REQUESTED);
});

check("rule 2: a removed note no longer asks for changes, a restored one does again", () => {
  const a = approval();
  a.send(1, 1);
  const note = a.note(1, 1);
  a.add(EVENT.NOTE_REMOVED, { line_id: 1, target_event_id: note.id });
  let state = a.state();
  assert.strictEqual(lineOf(state).status, LINE.WAITING);
  assert.strictEqual(state.notes.get(note.id).removed, true);
  a.add(EVENT.NOTE_RESTORED, { line_id: 1, target_event_id: note.id });
  state = a.state();
  assert.strictEqual(lineOf(state).status, LINE.CHANGES_REQUESTED);
  assert.strictEqual(state.notes.get(note.id).removed_at, null);
  a.add(EVENT.NOTE_REMOVED, { line_id: 1, target_event_id: note.id });
  assert.strictEqual(lineOf(a.state()).status, LINE.WAITING, "the latest remove/restore decides");
});

check("rule 2: an approval wins over a note, and the note is flagged as after the approval", () => {
  const a = approval();
  a.send(1, 1);
  a.approve(1, 1);
  const note = a.note(1, 1, "Keep it, but check the spelling");
  const state = a.state();
  assert.strictEqual(lineOf(state).status, LINE.APPROVED);
  assert.strictEqual(state.notes.get(note.id).after_approval, true);
});

check("rule 2: a note before any approval isn't flagged as after the approval", () => {
  const a = approval();
  a.send(1, 1);
  const note = a.note(1, 1);
  a.approve(1, 1);
  assert.strictEqual(a.state().notes.get(note.id).after_approval, false);
});

// ---------------------------------------------------------------- rule 3: approving

check("rule 3: approving the version that's already approved writes nothing", () => {
  const a = approval();
  a.send(1, 1);
  a.approve(1, 1);
  const plan = planApprove(a.state(), { lineId: 1, version: 1, latest: 1 });
  assert.deepStrictEqual(plan, { events: [] });
});

check("rule 3: approving another sent version adds an approval on top", () => {
  const a = approval();
  a.send(1, 1);
  a.send(1, 2);
  a.approve(1, 2);
  const plan = planApprove(a.state(), { lineId: 1, version: 1, latest: 2 });
  assert.deepStrictEqual(plan.events, [{ type: EVENT.APPROVED, line_id: 1, version: 1 }]);
  a.apply(plan);
  assert.strictEqual(lineOf(a.state()).approved_version, 1);
  assert.strictEqual(lineOf(a.state()).live_approvals.length, 2);
});

check("rule 3: approve answers STALE when the page shows an older version", () => {
  const a = approval();
  a.send(1, 1);
  a.send(1, 2);
  const plan = planApprove(a.state(), { lineId: 1, version: 1, latest: 1 });
  assert.strictEqual(plan.error.status, 409);
  assert.strictEqual(plan.error.code, "STALE");
});

check("rule 3: approve refuses versions that weren't sent, and lines with nothing to approve", () => {
  const a = approval(3);
  a.send(1, 1);
  a.lines[2].no_proof = 1;
  const state = a.state();
  assert.strictEqual(planApprove(state, { lineId: 1, version: 2, latest: 1 }).error.status, 400);
  assert.strictEqual(planApprove(state, { lineId: 1, version: 0, latest: 1 }).error.status, 400);
  assert.strictEqual(planApprove(state, { lineId: 2, version: 1, latest: 0 }).error.status, 400, "NOT_SENT");
  assert.strictEqual(planApprove(state, { lineId: 3, version: 1, latest: 0 }).error.status, 400, "NO_PROOF_NEEDED");
  assert.strictEqual(planApprove(state, { lineId: 1, version: "x", latest: 1 }).error.status, 400);
  assert.strictEqual(planApprove(state, { lineId: 9, version: 1, latest: 1 }).error.status, 404);
  assert.deepStrictEqual(planApprove(state, { lineId: 1, version: "1", latest: "1" }).events, [
    { type: EVENT.APPROVED, line_id: 1, version: 1 },
  ]);
});

// ---------------------------------------------------------------- rule 4: undo

check("rule 4: undo brings back the previous approval with its original time", () => {
  const a = approval();
  a.send(1, 1);
  a.send(1, 2);
  const first = a.approve(1, 2);
  const second = a.approve(1, 1);
  a.apply(planUndo(a.state(), a.events, { eventId: second.id }));
  const line = lineOf(a.state());
  assert.strictEqual(line.status, LINE.APPROVED);
  assert.strictEqual(line.approved_version, 2);
  assert.strictEqual(line.approved_at, first.created_at);
  assert.strictEqual(line.approved_event_id, first.id);
});

check("rule 4: undoing the only approval goes back to WAITING, or CHANGES_REQUESTED with a note", () => {
  const a = approval(2);
  a.send(1, 1);
  a.send(2, 1);
  const one = a.approve(1, 1);
  a.note(2, 1);
  const two = a.approve(2, 1);
  a.apply(planUndo(a.state(), a.events, { eventId: one.id }));
  a.apply(planUndo(a.state(), a.events, { eventId: two.id }));
  const state = a.state();
  assert.strictEqual(lineOf(state, 1).status, LINE.WAITING);
  assert.strictEqual(lineOf(state, 2).status, LINE.CHANGES_REQUESTED);
});

check("rule 4: only the newest live approval can be undone", () => {
  const a = approval();
  a.send(1, 1);
  a.send(1, 2);
  const older = a.approve(1, 2);
  a.approve(1, 1);
  const plan = planUndo(a.state(), a.events, { eventId: older.id });
  assert.strictEqual(plan.error.code, "STALE");
});

check("rule 4: an undo can't be undone, and approving again is the redo", () => {
  const a = approval();
  a.send(1, 1);
  const approved = a.approve(1, 1);
  const [undo] = a.apply(planUndo(a.state(), a.events, { eventId: approved.id }));
  assert.strictEqual(planUndo(a.state(), a.events, { eventId: undo.id }).error.status, 400);
  assert.strictEqual(planUndo(a.state(), a.events, { eventId: approved.id }).error.code, "STALE");
  const redo = a.apply(planApprove(a.state(), { lineId: 1, version: 1, latest: 1 }));
  assert.strictEqual(redo.length, 1);
  assert.strictEqual(lineOf(a.state()).approved_event_id, redo[0].id);
});

check("rule 4: 'undo approval and ask for changes' takes back every live approval on the line", () => {
  const a = approval();
  a.send(1, 1);
  a.send(1, 2);
  a.approve(1, 2);
  a.approve(1, 1);
  const plan = planUndoLine(a.state(), 1);
  assert.strictEqual(plan.events.length, 2);
  assert.ok(plan.events[0].target_event_id > plan.events[1].target_event_id, "newest first");
  a.apply(plan);
  a.note(1, 2);
  assert.strictEqual(lineOf(a.state()).status, LINE.CHANGES_REQUESTED);
});

// ---------------------------------------------------------------- rule 5: approve all

check("rule 5: approve all approves each waiting line's latest version as one batch", () => {
  const a = approval(5);
  a.send(1, 1);
  a.send(1, 2); // waiting, v2
  a.send(2, 1);
  a.note(2, 1); // changes requested
  a.send(3, 1);
  a.approve(3, 1); // approved: skipped
  a.lines[3].no_proof = 1; // no proof needed: skipped
  // line 5: not sent, skipped
  const plan = planApproveAll(
    a.state(),
    [
      { id: 1, latest: 2 },
      { id: 2, latest: 1 },
      { id: 3, latest: 1 },
    ],
    BATCH_A,
  );
  assert.deepStrictEqual(plan.events, [
    { type: EVENT.APPROVED, line_id: 1, version: 2, batch_id: BATCH_A },
    { type: EVENT.APPROVED, line_id: 2, version: 1, batch_id: BATCH_A },
  ]);
  a.apply(plan);
  const state = a.state();
  assert.strictEqual(state.status, STATUS.WAITING, "line 5 isn't sent yet");
  assert.deepStrictEqual(state.last_batch, { batch_id: BATCH_A, undoable: true });
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

check("rule 5: undoing a batch undoes only its approvals that are still the newest", () => {
  const a = approval(2);
  a.send(1, 1);
  a.send(1, 2);
  a.send(2, 1);
  a.apply(planApproveAll(a.state(), [{ id: 1, latest: 2 }, { id: 2, latest: 1 }], BATCH_A));
  const swap = a.approve(1, 1); // line 1: v1 instead, on top of the batch
  const plan = planUndo(a.state(), a.events, { batchId: BATCH_A });
  assert.strictEqual(plan.events.length, 1);
  assert.strictEqual(plan.events[0].line_id, 2);
  a.apply(plan);
  const state = a.state();
  assert.strictEqual(lineOf(state, 1).approved_event_id, swap.id);
  assert.strictEqual(lineOf(state, 2).status, LINE.WAITING);
  assert.deepStrictEqual(state.last_batch, { batch_id: BATCH_A, undoable: false });
  assert.strictEqual(planUndo(state, a.events, { batchId: BATCH_A }).error.code, "STALE");
  // Undoing the swap brings line 1's batch approval back.
  a.apply(planUndo(a.state(), a.events, { eventId: swap.id }));
  assert.strictEqual(lineOf(a.state(), 1).approved_version, 2);
  assert.deepStrictEqual(a.state().last_batch, { batch_id: BATCH_A, undoable: true });
});

check("rule 5: an unknown batch is refused", () => {
  const a = approval();
  a.send(1, 1);
  assert.strictEqual(planUndo(a.state(), a.events, { batchId: BATCH_B }).error.status, 400);
  assert.strictEqual(planUndo(a.state(), a.events, { batchId: "not-a-batch" }).error.status, 400);
  assert.strictEqual(planUndo(a.state(), a.events, {}).error.status, 400);
});

// ---------------------------------------------------------------- rule 6: new versions

check("rule 6: a new version resets the line; old approvals and notes stay in history", () => {
  const a = approval();
  a.send(1, 1);
  const note = a.note(1, 1);
  const approved = a.approve(1, 1);
  a.send(1, 2);
  const state = a.state();
  const line = lineOf(state);
  assert.strictEqual(line.status, LINE.WAITING);
  assert.deepStrictEqual(line.active_note_ids, []);
  assert.ok(state.notes.has(note.id), "the note is still in history");
  assert.ok(!state.undone.has(approved.id), "the old approval isn't undone, it just no longer counts");
  assert.deepStrictEqual(
    line.versions.map((version) => version.version),
    [1, 2],
  );
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

check("rule 7: swapping an approved version keeps the time the approval was completed", () => {
  const a = approval();
  a.send(1, 1);
  a.send(1, 2);
  const completing = a.approve(1, 2);
  a.approve(1, 1);
  assert.strictEqual(a.state().approved_at, completing.created_at);
});

check("rule 7: approved_at is cleared when the approval stops being complete, and set again", () => {
  const a = approval();
  a.send(1, 1);
  const approved = a.approve(1, 1);
  a.apply(planUndo(a.state(), a.events, { eventId: approved.id }));
  let state = a.state();
  assert.strictEqual(state.status, STATUS.WAITING);
  assert.strictEqual(state.approved_at, null);
  const again = a.apply(planApprove(state, { lineId: 1, version: 1, latest: 1 }))[0];
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

check("rule 7: any line with changes asked for makes CHANGES_REQUESTED", () => {
  const a = approval(2);
  a.send(1, 1);
  a.send(2, 1);
  a.approve(1, 1);
  a.note(2, 1);
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

check("rule 8: a customer can't undo, remove or restore the team's events", () => {
  const a = approval();
  const sent = a.send(1, 1);
  const teamApproval = a.add(EVENT.APPROVED, { line_id: 1, version: 1, actor: ACTOR.ADMIN });
  const teamNote = a.add(EVENT.NOTE_ADDED, { line_id: 1, version: 1, actor: ACTOR.ADMIN });
  const state = a.state();
  assert.strictEqual(planUndo(state, a.events, { eventId: teamApproval.id }).error.status, 400);
  assert.strictEqual(planUndo(state, a.events, { eventId: sent.id }).error.status, 400);
  assert.strictEqual(planNoteChange(state, a.events, teamNote.id, "remove").error.status, 404);
  assert.strictEqual(planNoteChange(state, a.events, sent.id, "remove").error.status, 404);
});

check("rule 8: removing a removed note, or restoring an active one, is STALE", () => {
  const a = approval();
  a.send(1, 1);
  const note = a.note(1, 1);
  assert.strictEqual(planNoteChange(a.state(), a.events, note.id, "restore").error.code, "STALE");
  a.apply(planNoteChange(a.state(), a.events, note.id, "remove"));
  assert.strictEqual(planNoteChange(a.state(), a.events, note.id, "remove").error.code, "STALE");
  a.apply(planNoteChange(a.state(), a.events, note.id, "restore"));
  assert.strictEqual(lineOf(a.state()).status, LINE.CHANGES_REQUESTED);
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
