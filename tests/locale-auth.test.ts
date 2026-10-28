import assert from "node:assert/strict";
import test from "node:test";
import { authConfig } from "../lib/auth.config";

test("signed-out users can update the locale from the sign-in page", async () => {
  const authorized = authConfig.callbacks!.authorized!;
  const result = await authorized({
    auth: null,
    request: { nextUrl: new URL("https://dubbl.dev/api/locale") },
  } as Parameters<typeof authorized>[0]);
  assert.equal(result, true);
});
