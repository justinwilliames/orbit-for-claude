/**
 * SSRF guard — DNS-rebinding is closed by pinning the connection to the IP
 * that was validated.
 *
 * The bug: assertPublicHttpUrl() resolved a hostname, validated the IPs,
 * then discarded them; fetchGuarded() (really the fetch under it) later
 * re-resolved the hostname independently. A low-TTL record that answered
 * public on the first lookup and 169.254.169.254 / an RFC1918 address on
 * the second passed the check and then connected to the internal target.
 *
 * The fix: resolve once, validate, and pin the socket to that exact IP via
 * undici's connector lookup — so there is no second, unvalidated
 * resolution to rebind. The URL hostname still drives the Host header and
 * TLS SNI, so vhost routing and certificate validation are untouched.
 *
 * DNS is injected here (the `lookup` seam) so the resolve → validate → pin
 * path is exercised deterministically without real network or real DNS.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  assertPublicHttpUrl,
  fetchGuarded,
  pinnedLookup,
  blockedIpReason,
} from "../../server/url-guard.js";

/** A dns.lookup(host, { all: true }) stand-in returning a fixed answer set. */
function fakeLookup(...ips) {
  return async () => ips.map((ip) => ({ address: ip, family: ip.includes(":") ? 6 : 4 }));
}

describe("SSRF guard — IP validation", () => {
  test("blockedIpReason flags metadata, RFC1918, loopback, link-local; passes public", () => {
    const cases = [
      ["169.254.169.254", true], // cloud metadata
      ["10.0.0.5", true],
      ["127.0.0.1", true],
      ["172.16.9.9", true],
      ["192.168.1.1", true],
      ["::1", true],
      ["fd00:ec2::254", true],
      ["8.8.8.8", false],
      ["93.184.216.34", false],
    ];
    for (const [ip, blocked] of cases) {
      assert.equal(Boolean(blockedIpReason(ip)), blocked, `${ip} should be blocked=${blocked}`);
    }
  });

  test("a bare private IP literal is refused and never fetched", async () => {
    let reached = false;
    await assert.rejects(
      () =>
        fetchGuarded("http://169.254.169.254/latest/meta-data/", {
          fetchImpl: () => {
            reached = true;
            throw new Error("must not fetch a blocked host");
          },
        }),
      (err) => err.code === "ssrf_blocked",
    );
    assert.equal(reached, false);
  });
});

describe("SSRF guard — DNS rebinding is closed", () => {
  test("fetchGuarded refuses a host whose validated resolution is internal, before any connect", async () => {
    // This is the resolution the guard both checks AND connects to — there
    // is no second, unvalidated lookup for an attacker to rebind. A private
    // answer is rejected up front and no fetch is attempted.
    let reached = false;
    await assert.rejects(
      () =>
        fetchGuarded("https://rebind.evil.example/x", {
          lookup: fakeLookup("169.254.169.254"),
          fetchImpl: () => {
            reached = true;
            throw new Error("must not fetch");
          },
        }),
      (err) => err.code === "ssrf_blocked",
    );
    assert.equal(reached, false, "fetch must not be attempted for a blocked host");
  });

  test("fetchGuarded pins the socket to the validated public IP and keeps redirect manual", async () => {
    let captured = null;
    const res = await fetchGuarded("https://good.example/x", {
      lookup: fakeLookup("93.184.216.34"),
      fetchImpl: (href, init) => {
        captured = { href, init };
        return Promise.resolve({ ok: true, __stub: true });
      },
    });
    assert.equal(res.__stub, true);
    assert.equal(captured.href, "https://good.example/x");
    assert.equal(captured.init.redirect, "manual", "guarded fetch must not auto-follow redirects");
    assert.ok(captured.init.dispatcher, "a pinned dispatcher must be attached for a hostname fetch");
    // The test-only `lookup` seam must never leak into the fetch init.
    assert.equal("lookup" in captured.init, false);
  });

  test("the pinned lookup returns only the pre-validated address, ignoring the hostname asked", () => {
    const lookup = pinnedLookup([{ address: "93.184.216.34", family: 4 }]);

    // autoSelectFamily form (Node 20+ default): callback wants an array.
    let all;
    lookup("attacker-controlled.example", { all: true }, (err, list) => {
      all = { err, list };
    });
    assert.equal(all.err, null);
    assert.deepEqual(all.list, [{ address: "93.184.216.34", family: 4 }]);

    // Single-address form: callback wants (address, family).
    let single;
    lookup("attacker-controlled.example", { family: 4 }, (err, address, family) => {
      single = { err, address, family };
    });
    assert.equal(single.address, "93.184.216.34");
    assert.equal(single.family, 4);
  });

  test("assertPublicHttpUrl still returns the parsed URL for its direct callers", async () => {
    const url = await assertPublicHttpUrl("https://good.example/path?q=1", {
      lookup: fakeLookup("93.184.216.34"),
    });
    assert.equal(url.href, "https://good.example/path?q=1");
    assert.equal(url.hostname, "good.example");
  });
});
