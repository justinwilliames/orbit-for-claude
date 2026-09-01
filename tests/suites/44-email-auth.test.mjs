/**
 * The first tests this module has ever had.
 *
 * orbit_check_email_auth is the shortest path a stranger has into
 * Orbit: no credentials, a domain in, a verdict out, inside their first
 * minute. Four hundred lines of DNS logic with zero references in a
 * 774-test suite, and it returned two false facts about a fourteen-
 * character, spec-compliant record —
 *
 *   v=spf1 redirect=_hspf.example.com
 *
 * — the canonical form for a HubSpot-hosted domain and a Microsoft 365
 * tenant. It counted 1 lookup against a real RFC 7208 count of four to
 * six, and it raised 'Record has no explicit "all" qualifier', which
 * RFC 7208 §6.1 says the record must NOT have: redirect= supplies the
 * policy and is ignored outright if an all mechanism is present. Acting
 * on the recommendation kills the redirect and unauthorises every
 * server in the chain.
 *
 * The other half of the suite is the abstention rule. A resolver that
 * says NXDOMAIN is telling you something; a resolver that times out is
 * telling you nothing, and this module used to convert the second into
 * positive findings — "No DKIM selector was found", "p=missing" — over
 * zero observations.
 *
 * DNS is stubbed throughout. A test that depends on someone else's
 * zone file is a test that fails on a plane.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { checkEmailAuth, checkBimi } from "../../server/email-auth.js";

/** Build a stub resolver from a host → TXT-values map. */
function stubResolver(zone, { defaultError = "ENOTFOUND" } = {}) {
  return async (host) => {
    const key = String(host).toLowerCase();
    if (!(key in zone)) return { values: [], error: defaultError };
    const entry = zone[key];
    if (typeof entry === "string") return { values: [], error: entry };
    return { values: entry, error: null };
  };
}

const DEAD = async () => ({ values: [], error: "ETIMEOUT" });

describe("SPF — redirect= is a policy delegation, not a missing qualifier", () => {
  const zone = {
    "example.com": ["v=spf1 redirect=_spf.example.com"],
    "_spf.example.com": ["v=spf1 include:one.example.net include:two.example.net ~all"],
    "one.example.net": ["v=spf1 a mx ~all"],
    "two.example.net": ["v=spf1 include:three.example.org ~all"],
    "three.example.org": ["v=spf1 ip4:192.0.2.0/24 ~all"],
    "_dmarc.example.com": ["v=DMARC1; p=reject; rua=mailto:d@example.com"],
  };

  test("does not tell the owner to add an all qualifier", async () => {
    const r = await checkEmailAuth({ domain: "example.com", resolveTxt: stubResolver(zone) });
    assert.equal(
      r.spf.issues.some((i) => /no explicit "all" qualifier/i.test(i)),
      false,
      "RFC 7208 §6.1: a record using redirect= must NOT carry an all mechanism"
    );
    assert.doesNotMatch(
      r.spf.recommendation,
      /Tighten to "-all"/,
      "the recommendation, followed, would make the redirect inert"
    );
    assert.equal(r.spf.verdict, "pass", "a spec-compliant redirect record is clean");
  });

  test("counts the whole expanded chain, not the one record", async () => {
    const r = await checkEmailAuth({ domain: "example.com", resolveTxt: stubResolver(zone) });
    // redirect(1) + include one(1) + include two(1) + a(1) + mx(1)
    // + include three(1) = 6, against the old answer of 1.
    assert.equal(r.spf.lookup_count_is_complete, true);
    assert.equal(r.spf.lookup_count, 6);
    assert.ok(
      r.spf.lookup_expansion.length >= 4,
      "the expansion path is what makes the count falsifiable by the reader"
    );
  });

  test("flags a record carrying BOTH redirect= and all", async () => {
    const both = { ...zone, "example.com": ["v=spf1 redirect=_spf.example.com -all"] };
    const r = await checkEmailAuth({ domain: "example.com", resolveTxt: stubResolver(both) });
    assert.equal(r.spf.verdict, "fail");
    assert.ok(r.spf.issues.some((i) => /the redirect is ignored entirely/i.test(i)));
  });

  test("a redirect to nowhere is a permerror, and says so", async () => {
    const broken = { "example.com": ["v=spf1 redirect=_spf.example.com"] };
    const r = await checkEmailAuth({ domain: "example.com", resolveTxt: stubResolver(broken) });
    assert.equal(r.spf.verdict, "fail");
    assert.ok(r.spf.issues.some((i) => /does not resolve to a v=spf1 record/i.test(i)));
    // The fix has to be named at the target, never by bolting an all
    // mechanism onto a record that must not have one.
    assert.match(r.spf.recommendation, /Do NOT add an "all" mechanism/);
  });

  test("an include loop terminates without inflating the count", async () => {
    const loop = {
      "example.com": ["v=spf1 include:a.example.com -all"],
      "a.example.com": ["v=spf1 include:b.example.com -all"],
      "b.example.com": ["v=spf1 include:a.example.com -all"],
    };
    const r = await checkEmailAuth({ domain: "example.com", resolveTxt: stubResolver(loop) });
    assert.equal(r.spf.lookup_count, 3);
    assert.equal(r.spf.lookup_count_is_complete, true);
  });

  test("an unreadable nested record withholds the count instead of reporting a partial sum", async () => {
    const partial = {
      "example.com": ["v=spf1 include:up.example.com include:down.example.com -all"],
      "up.example.com": ["v=spf1 a mx -all"],
      "down.example.com": "ETIMEOUT",
    };
    const r = await checkEmailAuth({ domain: "example.com", resolveTxt: stubResolver(partial) });
    assert.equal(r.spf.lookup_count, undefined, "a floor must not be published as the count");
    assert.equal(r.spf.lookup_count_is_complete, false);
    assert.equal(r.spf.lookup_count_at_least, 4);
    assert.match(r.spf.lookup_count_incomplete_reason, /did not resolve/i);
  });

  test("a genuinely over-budget record still fails", async () => {
    const fat = {
      "example.com": ["v=spf1 " + Array.from({ length: 11 }, (_, i) => `include:x${i}.example.net`).join(" ") + " -all"],
    };
    for (let i = 0; i < 11; i += 1) fat[`x${i}.example.net`] = ["v=spf1 -all"];
    const r = await checkEmailAuth({ domain: "example.com", resolveTxt: stubResolver(fat) });
    assert.equal(r.spf.lookup_count, 11);
    assert.equal(r.spf.verdict, "fail");
    assert.ok(r.spf.issues.some((i) => /permerror/.test(i)));
  });
});

describe("DNS abstention — a dead resolver is not evidence", () => {
  test("DKIM does not claim 'not found' over zero observations", async () => {
    const r = await checkEmailAuth({
      domain: "example.com",
      dkimSelectors: ["s20230601"],
      resolveTxt: DEAD,
    });
    assert.equal(r.dkim.verdict, null, "there is no grade to give");
    assert.equal(r.dkim.status, "not_measurable");
    assert.equal(r.dkim.reason, "dns_unreachable");
    assert.equal(r.dkim.selectors_resolved, 0);
    assert.ok(r.dkim.selectors_errored > 0);
    assert.equal(
      r.dkim.issues.some((i) => /No DKIM selector was found/i.test(i)),
      false,
      "28 timeouts are 28 non-observations, not a finding"
    );
  });

  test("'not found' is claimed only over selectors that actually answered", async () => {
    // Every selector answers NXDOMAIN — a real negative — so the
    // absence claim is earned, and the count reports answers rather
    // than attempts.
    const r = await checkEmailAuth({
      domain: "example.com",
      resolveTxt: stubResolver({ "example.com": ["v=spf1 -all"] }),
    });
    assert.equal(r.dkim.verdict, "warn");
    assert.ok(r.dkim.selectors_resolved > 0);
    assert.equal(r.dkim.selectors_checked, r.dkim.selectors_resolved);
  });

  test("an overall verdict is never 'pass' when a lane abstained", async () => {
    const zone = {
      "example.com": ["v=spf1 -all"],
      "_dmarc.example.com": ["v=DMARC1; p=reject; rua=mailto:d@example.com"],
    };
    // Selectors resolve, so DKIM is a real warn; add a lane that is
    // genuinely unreadable and confirm the roll-up notices.
    const withDeadDmarc = async (host) =>
      String(host).startsWith("_dmarc.")
        ? { values: [], error: "SERVFAIL" }
        : stubResolver(zone)(host);
    const r = await checkEmailAuth({ domain: "example.com", resolveTxt: withDeadDmarc });
    assert.equal(r.dmarc.status, "not_measurable");
    assert.notEqual(r.overall, "pass");
    assert.match(r.message, /DMARC: not measured/);
  });

  test("BIMI does not grade a live VMC against a policy it never read", async () => {
    const zone = {
      "default._bimi.example.com": [
        "v=BIMI1; l=https://example.com/logo.svg; a=https://example.com/vmc.pem",
      ],
    };
    const resolver = async (host) =>
      String(host).startsWith("_dmarc.")
        ? { values: [], error: "ETIMEOUT" }
        : stubResolver(zone)(host);
    const r = await checkBimi({ domain: "example.com", resolveTxt: resolver });
    assert.equal(
      r.issues.some((i) => /p=missing/.test(i)),
      false,
      "'p=missing' over an unread DMARC record is a fabricated fact"
    );
    assert.notEqual(r.verdict, "fail");
    assert.ok(r.not_measured.some((n) => n.check === "dmarc_policy"));
  });

  test("BIMI still fails a genuinely weak DMARC policy", async () => {
    const zone = {
      "default._bimi.example.com": [
        "v=BIMI1; l=https://example.com/logo.svg; a=https://example.com/vmc.pem",
      ],
      "_dmarc.example.com": ["v=DMARC1; p=none; rua=mailto:d@example.com"],
    };
    const r = await checkBimi({ domain: "example.com", resolveTxt: stubResolver(zone) });
    assert.equal(r.verdict, "fail");
    assert.ok(r.issues.some((i) => /p=none/.test(i)));
  });
});

/**
 * A zone that does not exist answers NXDOMAIN to every name under it,
 * for free and forever. The DKIM lane counted each of those as a
 * selector that "answered", so a domain nobody has ever registered came
 * back graded `warn` on the strength of "27 common default(s) that
 * answered" — 27 replays of one fact about a zone that isn't there,
 * dressed as 27 observations. Confirmed against live DNS on
 * 2026-09-01 for orbit-does-not-exist-8f3a2b1c9d.example.invalid:
 * selectors_resolved: 27, selectors_errored: 0, verdict "warn".
 *
 * ENOTFOUND at the apex is the resolver saying there is no such zone.
 * ENODATA is a different sentence — the zone is there and holds no TXT —
 * and still earns every verdict below.
 */
describe("A domain that does not exist is not a domain with bad auth", () => {
  // Nothing in the zone, and every lookup NXDOMAINs — a name that was
  // never registered.
  const NXDOMAIN_EVERYWHERE = stubResolver({}, { defaultError: "ENOTFOUND" });

  test("checkEmailAuth abstains instead of grading a zone that isn't there", async () => {
    const r = await checkEmailAuth({
      domain: "orbit-does-not-exist-8f3a2b1c9d.example.invalid",
      resolveTxt: NXDOMAIN_EVERYWHERE,
    });
    assert.equal(r.status, "not_measurable", "there is no zone to grade");
    assert.equal(r.not_measured, true);
    assert.equal(r.reason, "domain_not_found");
    assert.equal(r.overall, undefined, "an abstention has no overall grade");
    assert.equal(r.verdict, null);
    assert.match(r.message, /does not exist|not registered|no such/i, "the reason has to be readable");
  });

  test("no measurement is manufactured from the NXDOMAIN replay", async () => {
    const r = await checkEmailAuth({
      domain: "orbit-does-not-exist-8f3a2b1c9d.example.invalid",
      resolveTxt: NXDOMAIN_EVERYWHERE,
    });
    const blob = JSON.stringify(r);
    assert.equal(
      /common default\(s\) that answered/.test(blob),
      false,
      "27 NXDOMAINs on a dead zone are one fact, not 27 answers"
    );
    assert.equal(r.dkim, undefined, "no lane runs against a zone that does not exist");
    assert.equal(
      /"selectors_resolved":\s*[1-9]/.test(blob),
      false,
      "selectors_resolved was the receipt this defect was signed off on"
    );
  });

  test("checkBimi abstains on the same zone", async () => {
    const r = await checkBimi({
      domain: "orbit-does-not-exist-8f3a2b1c9d.example.invalid",
      resolveTxt: NXDOMAIN_EVERYWHERE,
    });
    assert.equal(r.status, "not_measurable");
    assert.equal(r.reason, "domain_not_found");
    assert.equal(r.verdict, null, "'No BIMI record at <host>' is a claim about a zone that isn't there");
  });

  // The other half of the guard: the fix must not be "always abstain".
  test("a real domain with no DKIM keys still earns its real verdict", async () => {
    // Apex answers (the zone exists); every selector NXDOMAINs, which is
    // genuine evidence of absence.
    const r = await checkEmailAuth({
      domain: "example.com",
      resolveTxt: stubResolver({ "example.com": ["v=spf1 -all"] }),
    });
    assert.equal(r.status, "ok");
    assert.equal(r.dkim.verdict, "warn");
    assert.ok(r.dkim.selectors_resolved > 0, "these NXDOMAINs are real observations");
    assert.equal(r.spf.verdict, "pass");
    assert.equal(r.dmarc.verdict, "fail", "a live zone with no DMARC record is a real fail");
  });

  test("a live zone with no TXT at all (ENODATA) is still graded", async () => {
    // ENODATA is the resolver saying the name exists and holds no TXT.
    // That is an answer, and 'no SPF record' is the right verdict.
    const r = await checkEmailAuth({
      domain: "example.com",
      resolveTxt: stubResolver({}, { defaultError: "ENODATA" }),
    });
    assert.equal(r.status, "ok");
    assert.equal(r.spf.verdict, "fail");
    assert.equal(r.dmarc.verdict, "fail");
  });

  test("a full BIMI record on a live zone is still graded", async () => {
    const zone = {
      "example.com": ["v=spf1 -all"],
      "default._bimi.example.com": [
        "v=BIMI1; l=https://example.com/logo.svg; a=https://example.com/vmc.pem",
      ],
      "_dmarc.example.com": ["v=DMARC1; p=reject; rua=mailto:d@example.com"],
    };
    const r = await checkBimi({ domain: "example.com", resolveTxt: stubResolver(zone) });
    assert.equal(r.status, "ok");
    assert.equal(r.verdict, "pass");
  });
});
