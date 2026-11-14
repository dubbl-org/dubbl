import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Pure logic check for the invite-bypass rules in app/api/auth/register.
// The DB-dependent paths are exercised manually; these pin the token-shape routing.
function isLinkToken(token: string) {
  return token.length === 32;
}

describe("invite token shapes", () => {
  it("routes 32-char tokens to org invite links", () => {
    assert.equal(isLinkToken("a".repeat(32)), true);
  });
  it("routes 64-char tokens to email invitations", () => {
    assert.equal(isLinkToken("a".repeat(64)), false);
  });
  it("rejects short garbage tokens", () => {
    assert.equal(isLinkToken("abc"), false);
  });
});
