/**
 * Steps 2 and 3 of the flagship path must not report success on nothing.
 *
 * `orbit_learn_email_template` is the tool the server instructions call "This
 * IS their design system". Handed the string "Compile failed: mjml exited 1"
 * it returned status ok with zero modules and all ten brand tokens null, and
 * its message ended by inviting the next call. `orbit_build_email_from_
 * template` then returned ok with a zero-byte html and told the user to paste
 * it into their builder. Four tools, four green verdicts, one empty email —
 * and because every status was in the DELIVERED bucket, telemetry recorded
 * the flagship path completing successfully.
 *
 * The suite twenty lines away could not see this: it asserts the status
 * VOCABULARY is complete, which says nothing about a tool returning the wrong
 * word from it. These are the negative tests neither tool had.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { spawnMcpClient } from "../harness/mcp-client.mjs";
import { makeTempWorkspace } from "../harness/fixtures.mjs";

const MJML_BIN = fileURLToPath(new URL("../../node_modules/.bin/mjml", import.meta.url));

/** Real compiler output — a hand-written fixture is not the population. */
function compiledEmail() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-learn-"));
  const src = path.join(dir, "email.mjml");
  const out = path.join(dir, "email.html");
  fs.writeFileSync(
    src,
    `<mjml><mj-body><mj-section css-class="es-header"><mj-column>
       <mj-text>ACME</mj-text>
     </mj-column></mj-section>
     <mj-section css-class="es-content"><mj-column>
       <mj-text>Your invoice is ready.</mj-text>
       <mj-button href="https://acme.test/pay">Pay now</mj-button>
     </mj-column></mj-section>
     <mj-section css-class="es-footer"><mj-column>
       <mj-text>Unsubscribe</mj-text>
     </mj-column></mj-section></mj-body></mjml>`,
    "utf8"
  );
  execFileSync(MJML_BIN, [src, "-o", out], { stdio: "pipe" });
  return fs.readFileSync(out, "utf8");
}

let client = null;
let html = "";

describe("Learn → build refuses to report success on nothing", () => {
  before(async () => {
    html = compiledEmail();
    client = await spawnMcpClient({ env: { ORBIT_HOME_ROOT: makeTempWorkspace() } });
    await client.callTool("orbit_route_task", { request: "warm up" });
  });

  after(async () => {
    if (client) await client.close();
  });

  test("a compiler error string is not a learned design system", async () => {
    const res = await client.callToolJson("orbit_learn_email_template", {
      html: "Compile failed: mjml exited 1",
      template_name: "broken-stub"
    });
    assert.notEqual(res.parsed?.status, "ok", "zero modules parsed must not be reported as ok");
    assert.equal(res.parsed?.status, "needs_inputs");
    assert.match(
      res.parsed?.message ?? "",
      /no modules/i,
      "the message has to name what it looked for and did not find"
    );
    assert.equal(res.parsed?.template_id, undefined, "nothing may be saved to the library");
  });

  test("a real compiled email still learns cleanly", async () => {
    const res = await client.callToolJson("orbit_learn_email_template", {
      html,
      template_name: "acme-real"
    });
    assert.equal(res.parsed?.status, "ok");
    assert.ok(res.parsed?.modules?.length > 0, "a real email must yield modules");
    assert.match(res.parsed?.template_id ?? "", /^module:acme-real:v1$/);
  });

  test("build from a real template returns bytes, and the ok is earned", async () => {
    const built = await client.callToolJson("orbit_build_email_from_template", {
      template_id: "module:acme-real:v1"
    });
    assert.equal(built.parsed?.status, "ok");
    assert.ok(
      (built.parsed?.html ?? "").length > 0,
      "status ok with a zero-byte html is the failure this test exists for"
    );
  });

  test("a second learn under the same name versions instead of destroying the first", async () => {
    const first = await client.callToolJson("orbit_learn_email_template", { html });
    assert.equal(first.parsed?.template_id, "module:master-template:v1");

    // templateName defaults to "master-template" for every call, so this is
    // the ordinary case, not an edge one.
    const second = await client.callToolJson("orbit_learn_email_template", { html });
    assert.equal(second.parsed?.status, "ok");
    assert.equal(second.parsed?.template_id, "module:master-template:v2");
    assert.equal(second.parsed?.previous_template_id, "module:master-template:v1");

    // v1 is still loadable and still has its modules.
    const stillThere = await client.callToolJson("orbit_build_email_from_template", {
      template_id: "module:master-template:v1"
    });
    assert.equal(stillThere.parsed?.status, "ok");
    assert.ok((stillThere.parsed?.html ?? "").length > 0);
  });
});
