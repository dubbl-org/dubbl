import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { db } from "@/lib/db";
import { publicUserColumns } from "@/lib/db/schema";

// The claim's people travel with the claim to the browser (API JSON, RSC
// payload, MCP tool result). They carry name and email — nothing else.
const CLAIM_FILES = [
  "app/api/v1/expenses/route.ts",
  "app/api/v1/expenses/[id]/route.ts",
  "lib/mcp/tools/expenses.ts",
  "lib/server/data/expenses.ts",
  "lib/server/data/expense-detail.ts",
];

describe("expense claim people", () => {
  it("selects only id, name and email from users", () => {
    assert.deepEqual(Object.keys(publicUserColumns).sort(), ["email", "id", "name"]);

    const sql = db.query.expenseClaim
      .findMany({
        with: {
          submittedByUser: { columns: publicUserColumns },
          approvedByUser: { columns: publicUserColumns },
        },
      })
      .toSQL().sql;

    assert.equal(sql.includes("password_hash"), false);
  });

  it("every claim query uses the restricted columns", () => {
    for (const file of CLAIM_FILES) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
      assert.equal(
        /(submittedByUser|approvedByUser):\s*true/.test(source),
        false,
        `${file} still selects the whole user row`
      );
      assert.ok(source.includes("publicUserColumns"), `${file} does not use publicUserColumns`);
    }
  });
});
