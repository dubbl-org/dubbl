import { test } from "node:test";
import assert from "node:assert/strict";
import { distinctLineIds, missingIds } from "../lib/api/line-stock-refs";

test("stock refs: distinct item ids, skipping empty lines", () => {
  const lines = [
    { inventoryItemId: "a", warehouseId: "w1" },
    { inventoryItemId: null },
    { inventoryItemId: "" },
    { inventoryItemId: "a", warehouseId: "w2" },
    { inventoryItemId: "b" },
    {},
  ];
  assert.deepEqual(distinctLineIds(lines, "inventoryItemId"), ["a", "b"]);
  assert.deepEqual(distinctLineIds(lines, "warehouseId"), ["w1", "w2"]);
});

test("stock refs: ids from another organization come back as missing", () => {
  assert.deepEqual(missingIds(["a", "b", "c"], ["a", "c"]), ["b"]);
  assert.deepEqual(missingIds(["a"], ["a"]), []);
  assert.deepEqual(missingIds([], []), []);
});
