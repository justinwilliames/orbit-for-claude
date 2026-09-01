/**
 * The ship-nothing path must FAIL the run.
 *
 * When a push to main carries a version the MCP registry already holds,
 * every publish step in build-mcpb.yml is skipped. Until now the workflow
 * printed a ::warning:: about it and exited 0, so the run was green and
 * the merge reached nobody. That was written on 12 Aug on the theory that
 * a loud annotation would be read; by 31 Aug main stood 37 commits and 11
 * days ahead of the published version, across a wall of green ticks. A
 * warning nobody reads is not a guard.
 *
 * Suite 40 owns the guard step's own verdict — can it PROVE the version is
 * unpublished. This suite owns what the workflow then DOES about it, which
 * is a different question and was the one going unanswered.
 *
 * Assertions are made by executing the steps' `run:` bodies lifted out of
 * the YAML, and by evaluating the gate's real `if:` expression against the
 * four contexts that reach it. Nothing here greps for a string it hopes
 * means something: a step can contain the word "exit 1" and still exit 0.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKFLOW = path.join(ROOT_DIR, ".github", "workflows", "build-mcpb.yml");
const YAML = fs.readFileSync(WORKFLOW, "utf8");

const GUARD_STEP = "Refuse to re-release a published version";
const GATE_STEP = "Fail a merge that shipped nothing";

/**
 * Pull one named step out of the workflow: its `if:` expression and its
 * `run:` body, dedented. Deliberately crude — it must fail loudly if a
 * step is renamed or restructured rather than silently testing nothing,
 * which is the failure mode that lets a release gate rot.
 */
function extractStep(yaml, stepName) {
  const lines = yaml.split("\n");
  const start = lines.findIndex((line) => line.trim() === `- name: ${stepName}`);
  assert.notEqual(start, -1, `step "${stepName}" not found in build-mcpb.yml`);
  const stepIndent = lines[start].search(/\S/);

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === "") continue;
    if (line.search(/\S/) <= stepIndent && line.trim().startsWith("- ")) {
      end = i;
      break;
    }
  }
  const block = lines.slice(start, end);

  const ifLine = block.find((line) => line.trim().startsWith("if:"));
  const ifExpr = ifLine ? ifLine.trim().replace(/^if:\s*/, "") : null;

  const runAt = block.findIndex((line) => line.trim() === "run: |");
  assert.notEqual(runAt, -1, `step "${stepName}" has no run block`);
  const bodyIndent = block[runAt].search(/\S/) + 2;
  const body = [];
  for (let i = runAt + 1; i < block.length; i += 1) {
    const line = block[i];
    if (line.trim() !== "" && line.search(/\S/) < bodyIndent) break;
    body.push(line.slice(bodyIndent));
  }
  assert.ok(body.length > 0, `step "${stepName}" has an empty run body`);
  return { ifExpr, run: body.join("\n") };
}

const guard = extractStep(YAML, GUARD_STEP);
const gate = extractStep(YAML, GATE_STEP);

/**
 * Evaluate a GitHub `if:` expression against a context.
 *
 * Only the operator subset this workflow actually uses is modelled, and
 * anything outside it fails the test rather than being waved through — a
 * gate whose condition the test cannot model is a gate the test is not
 * checking. Context lookups that miss resolve to null, which is what
 * GitHub does for an absent input (a push has no `inputs`) and for an
 * output a skipped step never wrote.
 */
function evalIf(expr, ctx) {
  const inner = expr.trim().replace(/^\$\{\{/, "").replace(/\}\}$/, "").trim();
  // `,` and the `contains` call were added 01 Sep 2026 alongside the
  // [no-release] opt-out. The evaluator deliberately refuses syntax it cannot
  // model rather than guessing at it — extending it is the correct response to
  // that refusal, and silently widening the regex without implementing the
  // function below would be the wrong one.
  const allowed = /^(?:[\s(),!]|&&|\|\||==|!=|'[^']*'|[A-Za-z_][A-Za-z0-9_.]*)+$/;
  assert.match(
    inner,
    allowed,
    `the gate's condition uses syntax this evaluator cannot model — extend it rather than trusting it: ${inner}`
  );

  // Match quoted literals FIRST and hand them back untouched. Without that
  // alternation the identifier pattern reaches inside a string and rewrites
  // its contents as context lookups — '[no-release]' became '[null-null]',
  // which made the opt-out silently never match. Single quotes are valid JS
  // string syntax, so a literal passes straight through to the evaluator.
  const js = inner.replace(/'[^']*'|[A-Za-z_][A-Za-z0-9_.]*/g, (token) => {
    if (token.startsWith("'")) return token;
    if (token === "true" || token === "false" || token === "null") return token;
    // Not a context path — a GitHub expression function, supplied below.
    if (token === "contains") return "contains";
    let cursor = ctx;
    for (const key of token.split(".")) {
      if (cursor === null || cursor === undefined || typeof cursor !== "object") {
        cursor = null;
        break;
      }
      cursor = key in cursor ? cursor[key] : null;
    }
    return JSON.stringify(cursor ?? null);
  });

  // GitHub's contains() is case-insensitive for strings, and returns false
  // for a null haystack — which is the workflow_dispatch case, where there is
  // no head_commit at all.
  const contains = (haystack, needle) =>
    typeof haystack === "string" &&
    typeof needle === "string" &&
    haystack.toLowerCase().includes(needle.toLowerCase());

  // eslint-disable-next-line no-new-func
  return Boolean(new Function("contains", `"use strict"; return (${js});`)(contains));
}

function context({ inputs = null, publish = null, commitMessage = "a normal merge" } = {}) {
  return {
    inputs,
    steps: { republish_guard: { outputs: { publish } } },
    // workflow_dispatch has no head_commit. Passing null models that, and the
    // gate must still fire there — a manual run at a published version is
    // exactly the case the opt-out must NOT silently cover.
    github: { event: commitMessage === null ? {} : { head_commit: { message: commitMessage } } }
  };
}

// ---------------------------------------------------------------------------
// A registry that holds the version, so the guard's verdict is observed
// rather than assumed. The gate's whole premise is that the guard emits
// publish=false on this path; asserting the gate without that link would
// test a step that may never fire.
// ---------------------------------------------------------------------------
const PUBLISHED_VERSION = "9.9.9";
const SERVER_NAME = "io.github.example/orbit-ship-nothing-fixture";

let registry;
let registryUrl;
let workDir;

before(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-ship-nothing-"));
  fs.writeFileSync(
    path.join(workDir, "server.json"),
    JSON.stringify({ name: SERVER_NAME }, null, 2)
  );
  registry = createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        servers: [{ server: { name: SERVER_NAME, version: PUBLISHED_VERSION, status: "active" } }]
      })
    );
  });
  await new Promise((resolve) => registry.listen(0, "127.0.0.1", resolve));
  registryUrl = `http://127.0.0.1:${registry.address().port}`;
});

after(async () => {
  await new Promise((resolve) => registry.close(resolve));
  fs.rmSync(workDir, { recursive: true, force: true });
});

async function runStep(script, env = {}) {
  const outputFile = path.join(workDir, "github_output.txt");
  fs.rmSync(outputFile, { force: true });
  let code = 0;
  let out = "";
  try {
    const { stdout, stderr } = await execFileAsync("bash", ["-c", script], {
      cwd: workDir,
      env: { ...process.env, GITHUB_OUTPUT: outputFile, ...env }
    });
    out = `${stdout}${stderr}`;
  } catch (error) {
    code = error.code ?? 1;
    out = `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
  const text = fs.existsSync(outputFile) ? fs.readFileSync(outputFile, "utf8") : "";
  const outputs = Object.fromEntries(
    text
      .split("\n")
      .filter(Boolean)
      .map((line) => line.split("="))
  );
  return { code, out, outputs };
}

describe("Release gate — a merge that ships nothing fails the run", () => {
  test("a push at a published version leaves the guard saying publish=false", async () => {
    const result = await runStep(guard.run, {
      VERSION: PUBLISHED_VERSION,
      EVENT: "push",
      REGISTRY_BASE: registryUrl
    });
    assert.equal(result.outputs.publish, "false", result.out);
    assert.match(result.out, /SHIPPED NOTHING/);
  });

  test("that verdict FIRES the gate — it is not merely annotated", () => {
    assert.ok(gate.ifExpr, `step "${GATE_STEP}" has no if: condition, so it runs on every release`);
    assert.equal(
      evalIf(gate.ifExpr, context({ publish: "false" })),
      true,
      "a push at an already-published version does not reach the gate"
    );
  });

  test("the gate exits NON-ZERO, and says why at ::error:: level", async () => {
    const result = await runStep(gate.run, { VERSION: PUBLISHED_VERSION });
    assert.notEqual(
      result.code,
      0,
      `the ship-nothing path exited 0 — this is the defect, not the fix:\n${result.out}`
    );
    // A ::warning:: is what this path already had for 19 days while main
    // drifted 37 commits ahead of the release. Only an ::error:: shows up
    // on the run summary as a failure.
    assert.match(result.out, /^::error::/m, "a run that shipped nothing must annotate as an error");
    assert.match(result.out, /already on the MCP registry/i);
    assert.match(result.out, /allow_republish/, "the error must name the way out");
  });
});

describe("Release gate — the deliberate escape hatches still work", () => {
  test("a manual re-run with allow_republish is not failed by the gate", () => {
    // allow_republish skips the guard entirely, so `publish` is never
    // written — and an unwritten output must not read as 'false'.
    assert.equal(
      evalIf(gate.ifExpr, context({ inputs: { dry_run: false, allow_republish: true } })),
      false,
      "allow_republish can no longer republish — the escape hatch is broken"
    );
  });

  test("a dry run is not failed by the gate", () => {
    assert.equal(
      evalIf(gate.ifExpr, context({ inputs: { dry_run: true, allow_republish: false } })),
      false,
      "a dry run reds main, which makes the debug path unusable"
    );
  });

  test("a dry run stays green even if the guard somehow reported false", () => {
    // Belt-and-braces on the ordering: nothing left the runner on a dry
    // run, so there is no release to have missed.
    assert.equal(
      evalIf(gate.ifExpr, context({ inputs: { dry_run: true, allow_republish: false }, publish: "false" })),
      false,
      "the gate is not gated on dry_run"
    );
  });

  test("a normal release — a push at a fresh version — does not touch the gate", () => {
    assert.equal(evalIf(gate.ifExpr, context({ publish: "true" })), false);
  });

  // -------------------------------------------------------------------------
  // The [no-release] opt-out.
  //
  // 34 of the 40 qualifying commits before this gate existed did not bump the
  // version. A gate that reds five merges in six is a gate someone deletes,
  // which is precisely how its predecessor decayed into a warning nobody read.
  // The opt-out is what lets the default stay loud. It has to be TYPED, so the
  // quiet path is always a deliberate act and never the default.
  // -------------------------------------------------------------------------

  test("a typed [no-release] stands the gate down", () => {
    assert.equal(
      evalIf(gate.ifExpr, context({ publish: "false", commitMessage: "docs: fix a typo [no-release]" })),
      false,
      "the opt-out does not work, so every non-release merge reds main and the gate gets deleted"
    );
  });

  test("an ordinary merge at a published version still fails — silence is never the default", () => {
    assert.equal(
      evalIf(gate.ifExpr, context({ publish: "false", commitMessage: "server: tidy the router" })),
      true,
      "the gate stopped firing on a plain no-bump merge, which is the whole defect"
    );
  });

  test("the opt-out must be typed, not implied by a near-miss", () => {
    for (const message of [
      "chore: no release needed here",
      "fix: norelease",
      "feat: this is not a release",
      "refactor: [norelease]"
    ]) {
      assert.equal(
        evalIf(gate.ifExpr, context({ publish: "false", commitMessage: message })),
        true,
        `"${message}" stood the gate down without the literal token — the opt-out is too easy to trip by accident`
      );
    }
  });

  test("a manual dispatch has no head_commit, and the gate still fires", () => {
    // workflow_dispatch carries no commit message, so contains() sees null.
    // A human re-running the workflow at a published version without
    // allow_republish must still be told, not quietly excused by an opt-out
    // they never typed.
    assert.equal(
      evalIf(
        gate.ifExpr,
        context({ inputs: { dry_run: false, allow_republish: false }, publish: "false", commitMessage: null })
      ),
      true,
      "an absent commit message reads as an opt-out — the escape hatch fires itself"
    );
  });

  test("the error message tells you the opt-out exists", () => {
    assert.match(
      gate.run,
      /\[no-release\]/,
      "the gate fails without naming its own escape hatch, so the next person deletes the gate instead of using it"
    );
  });
});
