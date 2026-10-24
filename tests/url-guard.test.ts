import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isBlockedAddress, assertPublicHttpsUrl, UnsafeUrlError } from "@/lib/api/url-guard";

describe("isBlockedAddress", () => {
  it("blocks loopback, private, link-local, CGNAT and multicast", () => {
    const blocked = [
      "127.0.0.1",
      "127.1.2.3",
      "10.0.0.5",
      "172.16.4.1",
      "172.31.255.255",
      "192.168.1.10",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "255.255.255.255",
      "::1",
      "::",
      "fe80::1",
      "fd00::1",
      "::ffff:169.254.169.254",
    ];
    for (const address of blocked) {
      assert.equal(isBlockedAddress(address), true, address);
    }
  });

  it("allows public addresses", () => {
    const allowed = ["1.1.1.1", "93.184.216.34", "172.32.0.1", "8.8.8.8", "2606:4700::1111"];
    for (const address of allowed) {
      assert.equal(isBlockedAddress(address), false, address);
    }
  });
});

describe("assertPublicHttpsUrl", () => {
  it("rejects non-https schemes and credentials", async () => {
    await assert.rejects(() => assertPublicHttpsUrl("http://example.com/hook"), UnsafeUrlError);
    await assert.rejects(() => assertPublicHttpsUrl("ftp://example.com/hook"), UnsafeUrlError);
    await assert.rejects(() => assertPublicHttpsUrl("https://user:pass@example.com/hook"), UnsafeUrlError);
    await assert.rejects(() => assertPublicHttpsUrl("not a url"), UnsafeUrlError);
  });

  it("rejects literal metadata and loopback addresses", async () => {
    await assert.rejects(
      () => assertPublicHttpsUrl("https://169.254.169.254/latest/meta-data/"),
      UnsafeUrlError
    );
    await assert.rejects(() => assertPublicHttpsUrl("https://127.0.0.1:3100/api/v1/"), UnsafeUrlError);
    await assert.rejects(() => assertPublicHttpsUrl("https://[::1]/hook"), UnsafeUrlError);
    await assert.rejects(() => assertPublicHttpsUrl("https://10.1.2.3/hook"), UnsafeUrlError);
  });
});
