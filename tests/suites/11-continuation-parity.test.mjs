/**
 * Continuation parity suite — locks the contract that resumed tool
 * output is semantically identical to an uninterrupted run.
 *
 * The invariant under test:
 *   1. Every non-time-of-call field in the resumed result deep-equals
 *      the clean run (canvases, summary, warnings, naming_issues, etc.)
 *   2. Time-of-call fields (timestamp, ending_at) are pinned at the
 *      FIRST call's wall-clock time and threaded through resume_state —
 *      so the resumed output carries the original call's timestamp,
 *      not the resume moment's timestamp.
 *
 * Why this matters: if the resume's wall-clock moment leaks into the
 * output, an audit resumed 55 minutes later would carry a timestamp
 * that doesn't match when the user asked. That's cosmetic but it's
 * also a correctness signal — time-sensitive queries (size_trend,
 * ending_at) must not drift across a resume.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { startMockApiServer } from "../harness/mock-api-server.mjs";
import { auditBrazeInstance, auditContentBlocks } from "../../server/braze-read.js";
import { pullBrazePerformance } from "../../server/braze-performance.js";

let mock = null;
let config = null;

/**
 * Deep-clone with a list of ignored dotted paths removed — so we can
 * deep-equal "everything except timestamp" without mutating the source
 * objects.
 */
function stripPaths(obj, paths) {
  const clone = JSON.parse(JSON.stringify(obj));
  for (const p of paths) {
    const segs = p.split(".");
    let cur = clone;
    for (let i = 0; i < segs.length - 1; i += 1) {
      if (cur == null || typeof cur !== "object") return clone;
      cur = cur[segs[i]];
    }
    if (cur && typeof cur === "object") delete cur[segs[segs.length - 1]];
  }
  return clone;
}

describe("Continuation parity — clean vs resumed output", () => {
  before(async () => {
    mock = await startMockApiServer();
    config = {
      brazeApiKey: mock.env.ORBIT_BRAZE_API_KEY,
      brazeRestEndpoint: mock.env.ORBIT_BRAZE_REST_ENDPOINT
    };
  });

  after(async () => {
    if (mock) await mock.close();
  });

  test("auditBrazeInstance: resumed semantically equals clean, timestamp pinned to first-call start", async () => {
    const clean = await auditBrazeInstance({ config });
    assert.equal(clean.status, "ok");

    let stepCount = 0;
    const first = await auditBrazeInstance({
      config,
      shouldYield: () => {
        stepCount += 1;
        return stepCount >= 3;
      }
    });
    assert.equal(first.status, "continuation_required");
    assert.ok(first.resume_state, "First partial must carry resume_state");
    assert.ok(
      first.resume_state.startedAt,
      "resume_state must preserve startedAt — otherwise resumed result gets a fresh timestamp at return time"
    );

    const resumed = await auditBrazeInstance({
      config,
      resumeState: first.resume_state
    });
    assert.equal(resumed.status, "ok");

    // Contract 1: timestamp is pinned to the first call's start.
    assert.equal(
      resumed.audit.timestamp,
      first.resume_state.startedAt,
      "Resumed result must carry the ORIGINAL first-call timestamp, not the resume moment"
    );

    // Contract 2: every other field deep-equals a clean run.
    assert.deepStrictEqual(
      stripPaths(resumed, ["audit.timestamp"]),
      stripPaths(clean, ["audit.timestamp"]),
      "Resumed audit must semantically deep-equal uninterrupted audit (ex-timestamp)"
    );
  });

  test("auditContentBlocks: resumed semantically equals clean", async () => {
    const clean = await auditContentBlocks({ config });
    assert.equal(clean.status, "ok");

    let blocks = 0;
    const first = await auditContentBlocks({
      config,
      shouldYield: () => {
        blocks += 1;
        return blocks >= 1;
      }
    });
    if (first.status === "continuation_required") {
      const resumed = await auditContentBlocks({
        config,
        resumeState: first.resume_state
      });
      assert.equal(resumed.status, "ok");
      assert.deepStrictEqual(resumed, clean, "Resumed content-block audit must deep-equal clean audit");
    } else {
      assert.equal(first.status, "ok");
      assert.deepStrictEqual(first, clean);
    }
  });

  test("pullBrazePerformance: resumed semantically equals clean, ending_at pinned", async () => {
    // Use 7 IDs so we get 2 batches at BATCH_SIZE=5 — the yield check
    // between batches will actually fire. 3 IDs would complete in one
    // batch and short-circuit the yield entirely.
    const canvasIds = [
      "canvas-001", "canvas-002", "canvas-003",
      "canvas-001", "canvas-002", "canvas-003", "canvas-001"
    ];

    const clean = await pullBrazePerformance({
      config,
      canvasIds,
      includeKpis: false,
      days: 7
    });
    assert.equal(clean.status, "ok");

    let batchCount = 0;
    const first = await pullBrazePerformance({
      config,
      canvasIds,
      includeKpis: false,
      days: 7,
      shouldYield: () => {
        batchCount += 1;
        return batchCount >= 1;
      }
    });
    assert.equal(
      first.status,
      "continuation_required",
      "With 7 canvas IDs at BATCH_SIZE=5, yield between batches should fire"
    );
    assert.ok(
      first.resume_state.ending_at,
      "resume_state must preserve ending_at so time-series windows are stable across resumes"
    );

    const resumed = await pullBrazePerformance({
      config,
      canvasIds,
      includeKpis: false,
      days: 7,
      resumeState: first.resume_state
    });
    assert.equal(resumed.status, "ok");
    assert.equal(
      resumed.period.ending_at,
      first.resume_state.ending_at,
      "Resumed pull must carry the original ending_at, not a fresh one"
    );
    assert.deepStrictEqual(
      stripPaths(resumed, ["period.ending_at"]),
      stripPaths(clean, ["period.ending_at"]),
      "Resumed performance pull must deep-equal clean pull (ex-ending_at)"
    );
  });

  test("audit: two different resume points produce identical final output", async () => {
    // Two independent audit calls paused at different steps, resumed,
    // must carry (a) their own startedAt and (b) identical semantic
    // content. We strip the timestamp for the equality check.
    const resumeAtStep = async (n) => {
      let i = 0;
      const first = await auditBrazeInstance({
        config,
        shouldYield: () => (++i >= n)
      });
      if (first.status === "ok") return first;
      const resumed = await auditBrazeInstance({ config, resumeState: first.resume_state });
      // Sanity: pinned to the original start.
      assert.equal(resumed.audit.timestamp, first.resume_state.startedAt);
      return resumed;
    };

    const atStep2 = await resumeAtStep(2);
    const atStep5 = await resumeAtStep(5);

    assert.deepStrictEqual(
      stripPaths(atStep2, ["audit.timestamp"]),
      stripPaths(atStep5, ["audit.timestamp"]),
      "Two resume points must produce identical semantic output"
    );
  });
});
