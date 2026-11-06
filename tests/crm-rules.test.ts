import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LOST_STAGE,
  NO_LOST_REASON,
  WON_STAGE,
  dealStageChange,
  lostReasonBreakdown,
  normalizePipelineStages,
  remapStage,
  stageDisplayName,
} from "../lib/crm/rules";

const now = new Date("2026-10-14T10:00:00Z");
const open = { stageId: "proposal", wonAt: null, lostAt: null, probability: 60 };

test("moving to Won closes the deal as won", () => {
  assert.deepEqual(dealStageChange(open, WON_STAGE, { now }), {
    stageId: WON_STAGE, wonAt: now, lostAt: null, lostReason: null, probability: 100,
  });
});

test("moving to Lost closes the deal as lost with a trimmed reason", () => {
  assert.deepEqual(dealStageChange(open, LOST_STAGE, { now, reason: "  Too expensive " }), {
    stageId: LOST_STAGE, wonAt: null, lostAt: now, lostReason: "Too expensive", probability: 0,
  });
  assert.equal(dealStageChange(open, LOST_STAGE, { now, reason: "   " }).lostReason, null);
});

test("a lost deal moved to Won is won, not both", () => {
  const lost = { stageId: LOST_STAGE, wonAt: null, lostAt: new Date("2026-09-01"), probability: 0 };
  const patch = dealStageChange(lost, WON_STAGE, { now });
  assert.equal(patch.lostAt, null);
  assert.equal(patch.wonAt, now);
});

test("re-marking a won deal keeps the original won date", () => {
  const wonAt = new Date("2026-09-01");
  assert.equal(dealStageChange({ stageId: WON_STAGE, wonAt, lostAt: null, probability: 100 }, WON_STAGE, { now }).wonAt, wonAt);
});

test("moving a closed deal to an open stage reopens it", () => {
  const won = { stageId: WON_STAGE, wonAt: new Date("2026-09-01"), lostAt: null, probability: 100 };
  assert.deepEqual(dealStageChange(won, "lead", { now }), {
    stageId: "lead", wonAt: null, lostAt: null, lostReason: null, probability: null,
  });
});

test("moving between open stages only changes the stage", () => {
  assert.deepEqual(dealStageChange(open, "negotiation", { now }), { stageId: "negotiation", wonAt: null, lostAt: null });
});

test("normalizePipelineStages keeps Won and Lost at the end, adding them if missing", () => {
  const stages = normalizePipelineStages([
    { id: WON_STAGE, name: "Signed", color: "#000" },
    { id: "a", name: "A", color: "#111" },
    { id: "b", name: "B", color: "#222" },
  ]);
  assert.deepEqual(stages.map((s) => s.id), ["a", "b", WON_STAGE, LOST_STAGE]);
  assert.equal(stages[2].name, "Signed");
  assert.equal(stages[3].name, "Lost");
});

test("remapStage keeps known and closed stages, else uses the first open stage", () => {
  const stages = normalizePipelineStages([{ id: "a", name: "A", color: "" }, { id: "b", name: "B", color: "" }]);
  assert.equal(remapStage("b", stages), "b");
  assert.equal(remapStage("gone", stages), "a");
  assert.equal(remapStage(WON_STAGE, stages), WON_STAGE);
  assert.equal(remapStage(LOST_STAGE, stages), LOST_STAGE);
});

test("stageDisplayName prefers the deal's own pipeline and falls back sensibly", () => {
  const pipelines = [
    { id: "p1", stages: [{ id: "lead", name: "Lead", color: "" }] },
    { id: "p2", stages: [{ id: "lead", name: "New enquiry", color: "" }, { id: "stage_17", name: "Demo booked", color: "" }] },
  ];
  assert.equal(stageDisplayName(pipelines, "p2", "lead"), "New enquiry");
  assert.equal(stageDisplayName(pipelines, "p1", "stage_17"), "Demo booked");
  assert.equal(stageDisplayName(pipelines, "p1", WON_STAGE), "Won");
  assert.equal(stageDisplayName(pipelines, "p1", "some_old_stage"), "some old stage");
});

test("lostReasonBreakdown groups reasons case-insensitively, most common first", () => {
  const lostAt = new Date();
  const rows = lostReasonBreakdown([
    { lostAt, lostReason: "Price", valueCents: 1000 },
    { lostAt, lostReason: " price ", valueCents: 2000 },
    { lostAt, lostReason: null, valueCents: 500 },
    { lostAt, lostReason: "Timing", valueCents: 9000 },
    { lostAt: null, lostReason: "Price", valueCents: 99999 },
  ]);
  assert.deepEqual(rows, [
    { reason: "Price", count: 2, value: 3000 },
    { reason: "Timing", count: 1, value: 9000 },
    { reason: NO_LOST_REASON, count: 1, value: 500 },
  ]);
});
