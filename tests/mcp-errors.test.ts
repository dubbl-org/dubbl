import { test } from "node:test";
import assert from "node:assert/strict";
import { isUserFacingError, ToolError } from "../lib/mcp/errors";

test("plain validation errors thrown by tools are shown to the client", () => {
  assert.equal(isUserFacingError(new Error("Only draft bills can be edited")), true);
  assert.equal(isUserFacingError(new ToolError("Invoice not found", 404)), true);
});

test("bugs, driver errors and SQL never reach the client", () => {
  assert.equal(isUserFacingError(new TypeError("Cannot read properties of undefined")), false);
  class DatabaseError extends Error {}
  assert.equal(isUserFacingError(new DatabaseError("relation does not exist")), false);
  assert.equal(isUserFacingError(new Error("Failed query: select * from invoice")), false);
  assert.equal(isUserFacingError(new Error('duplicate key value violates unique constraint "x"')), false);
  assert.equal(isUserFacingError(new Error("wrapped", { cause: new Error("db down") })), false);
  assert.equal(isUserFacingError("a string"), false);
});
