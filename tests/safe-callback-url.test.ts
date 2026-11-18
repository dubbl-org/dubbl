import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { safeCallbackUrl } from "@/lib/utils";

const FALLBACK = "/dashboard";

describe("safeCallbackUrl", () => {
  it("keeps same-site paths", () => {
    assert.equal(safeCallbackUrl("/invoices?page=2", FALLBACK), "/invoices?page=2");
    assert.equal(safeCallbackUrl("/projects/abc#notes", FALLBACK), "/projects/abc#notes");
  });

  it("falls back when nothing was supplied", () => {
    assert.equal(safeCallbackUrl(null, FALLBACK), FALLBACK);
    assert.equal(safeCallbackUrl("", FALLBACK), FALLBACK);
  });

  it("refuses to leave the site", () => {
    assert.equal(safeCallbackUrl("https://evil.example/steal", FALLBACK), FALLBACK);
    assert.equal(safeCallbackUrl("//evil.example/steal", FALLBACK), FALLBACK);
    assert.equal(safeCallbackUrl("javascript:alert(1)", FALLBACK), FALLBACK);
  });
});
