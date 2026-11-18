import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { db } from "@/lib/db";
import { publicUserColumns } from "@/lib/db/schema";

// A user row joined into any record travels to a client: API JSON, RSC
// payload, MCP tool result. It carries name and email — never the password
// hash, the site-admin flag or session state.

// Every relation in lib/db/schema that points at users.
const USER_RELATIONS = [
  "acceptedByUser",
  "advisorUser",
  "approvedByUser",
  "assignedUser",
  "author",
  "connectedByUser",
  "createdBy",
  "createdByUser",
  "filedByUser",
  "grantedByUser",
  "invitedBy",
  "lockedByUser",
  "requestedByUser",
  "sentByUser",
  "submittedByUser",
  "uploadedByUser",
  "uploader",
  "user",
];

const SCAN_ROOTS = ["app", "lib", "components"];
const SKIP = ["node_modules", ".next", "drizzle", ".git", ".claude"];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.includes(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

describe("user rows in other records", () => {
  it("selects only id, name and email from users", () => {
    assert.deepEqual(Object.keys(publicUserColumns).sort(), ["email", "id", "name"]);
  });

  it("no query selects a whole user row", () => {
    const pattern = new RegExp(`(?<![\\w.])(${USER_RELATIONS.join("|")})\\s*:\\s*true\\b`);
    const offenders: string[] = [];

    for (const root of SCAN_ROOTS) {
      for (const file of sourceFiles(root)) {
        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((line, i) => {
          if (pattern.test(line)) offenders.push(`${file}:${i + 1} ${line.trim()}`);
        });
      }
    }

    assert.deepEqual(offenders, [], `whole user rows selected:\n${offenders.join("\n")}`);
  });

  it("the SQL carries no password hash", () => {
    const sql = [
      db.query.member.findMany({ with: { user: { columns: publicUserColumns } } }).toSQL().sql,
      db.query.expenseClaim
        .findMany({
          with: {
            submittedByUser: { columns: publicUserColumns },
            approvedByUser: { columns: publicUserColumns },
          },
        })
        .toSQL().sql,
    ];

    for (const statement of sql) {
      assert.equal(statement.includes("from \"users\""), true);
      assert.equal(statement.includes("password_hash"), false);
      assert.equal(statement.includes("is_site_admin"), false);
    }
  });
});
