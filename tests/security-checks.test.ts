import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rateLimit } from "@/lib/api/rate-limit";
import { validateUpload } from "@/lib/s3";
import { encodeStripeState, decodeStripeState } from "@/lib/integrations/stripe/state";

process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-secret-for-ci";

describe("rateLimit", () => {
  it("allows up to the limit then blocks", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 5; i++) assert.equal(rateLimit(key, 5), true);
    assert.equal(rateLimit(key, 5), false);
    assert.equal(rateLimit(`${key}-other`, 5), true);
  });
});

describe("validateUpload", () => {
  it("accepts allowed types within the size cap", () => {
    assert.equal(validateUpload("application/pdf", 1024), null);
    assert.equal(validateUpload("image/png", 1024), null);
  });
  it("rejects active content types and oversized files", () => {
    assert.ok(validateUpload("text/html", 1024));
    assert.ok(validateUpload("image/svg+xml", 1024));
    assert.ok(validateUpload("application/pdf", 51 * 1024 * 1024));
    assert.ok(validateUpload("application/pdf", 0));
  });
});

describe("stripe oauth state", () => {
  const payload = { orgId: "org-1", userId: "user-1", nonce: "abc" };
  it("round-trips a signed state", () => {
    assert.deepEqual(decodeStripeState(encodeStripeState(payload)), payload);
  });
  it("rejects tampered payloads and forged signatures", () => {
    const state = encodeStripeState(payload);
    const [body, sig] = state.split(".");
    const tampered = `${Buffer.from(JSON.stringify({ ...payload, orgId: "victim" })).toString("base64url")}.${sig}`;
    assert.equal(decodeStripeState(tampered), null);
    assert.equal(decodeStripeState(`${body}.badsignature`), null);
    assert.equal(decodeStripeState(Buffer.from(JSON.stringify(payload)).toString("base64url")), null);
  });
});
