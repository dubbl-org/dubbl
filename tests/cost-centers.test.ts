import { test } from "node:test";
import assert from "node:assert/strict";
import { newCostCenterIds } from "../lib/api/cost-centers";

test("cost centers: distinct ids being set, skipping empty lines", () => {
  assert.deepEqual(newCostCenterIds(["a", null, "", undefined, "a", "b"]), ["a", "b"]);
  assert.deepEqual(newCostCenterIds([]), []);
});

test("cost centers: ids already saved on the record are not re-checked", () => {
  assert.deepEqual(newCostCenterIds(["a", "b", "c"], ["a", null, "c"]), ["b"]);
  assert.deepEqual(newCostCenterIds(["a"], ["a"]), []);
  assert.deepEqual(newCostCenterIds([null], ["a"]), []);
});
