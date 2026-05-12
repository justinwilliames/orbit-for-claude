/**
 * Stripo Smart Element probe — empirical confirmation that pushing
 * `values` via the canonical-JSON API substitutes correctly into
 * a module that has `esd-dynamic-block` smart-element bindings.
 *
 * Third spike in the series. The values probe (0.18.14) and inline-
 * html probe (0.18.15/16) eliminated the wrong paths. This one tests
 * the actually-documented Stripo path: modules marked up with
 * `esd-dynamic-block` config + `esd-gen-<name>` classes.
 *
 * Baseline arm:
 *   1. Auto-pick the first synced module whose HTML contains an
 *      `esd-dynamic-block` attribute (or accept a stripo_id override).
 *   2. Parse the JSON config out of the attribute to discover the
 *      registered variable names.
 *   3. Build a sentinel value for each variable and push via
 *      `dataSources[].value: [{ id: <uid>, values: { <var>: <sentinel> } }]`.
 *   4. Fetch the rendered email back via GET /emails/<id> and assert
 *      every sentinel appears in the rendered HTML.
 *
 * Additional arms (added to answer three open questions):
 *
 *   q.1 — Top-level `link` binding.
 *       The wizard registers a `link` field at the TOP level of the
 *       esd-dynamic-block JSON (sibling of `variables`), with
 *       `blockMapping: [{ selector: "a", attribute: "href" }]`.
 *       Three payload shapes are tested with distinct sentinels:
 *         (a) link inside values:           values.link = sentinel_a
 *         (b) link as sibling of values:    { id, values, link }     (sentinel_b)
 *         (c) link as values.href:          values.href = sentinel_c
 *       Skipped if the module has no top-level `link` field.
 *
 *   q.2 — Custom variable name (NOT in the module's variables array).
 *       /modules is read-only — we cannot PUT modified module HTML
 *       back to Stripo. So this arm answers a *different* question:
 *       "does Stripo reject unknown variable names, or silently
 *       drop them?" Sends `__orbit_unknown_var` in `values` alongside
 *       the registered ones; expects the email to still compose and
 *       the sentinel to NOT appear in rendered output. The genuine
 *       question — "if I manually JSON-edit a module via Stripo's
 *       editor to add a custom variable binding, will the API honour
 *       it?" — requires the user to first set up such a module in
 *       Stripo's editor UI. Pass `custom_module_stripo_id` +
 *       `custom_variable_name` to fire that probe arm; otherwise it
 *       reports as "needs_setup" with manual-setup instructions.
 *
 *   q.3 — CTA text binding ("Do the thing").
 *       Wizard didn't auto-pick the button text. q.3 has no
 *       independent probe arm — its resolution is implied by q.1
 *       and q.2 outcomes:
 *         - If q.1.a/b/c works for `link`: a top-level `cta_text`
 *           binding manually JSON-edited into the module would
 *           work via that same shape.
 *         - If q.2 manual-setup arm works: the user can add
 *           `cta_text` to the variables array via Stripo's editor
 *           and bind it to the button's inner span/anchor text.
 *       The final report's q.3 section names whichever arm resolves it.
 *
 *   bonus — only-unknown-vars payload behaviour.
 *       Cheap to add: confirms whether Stripo returns an error for
 *       a request containing only unknown variable names (no valid
 *       ones). Useful for compose-time input validation downstream.
 *
 * Per-user discipline: nothing hardcodes Stripo IDs. Module is
 * auto-picked from the user's synced library; variable names come
 * from the live module's saved HTML.
 */

import fs from "node:fs";
import path from "node:path";
import {
  validateStripoRestSetup,
  stripoRestGet,
  stripoRestPost,
} from "./stripo-api.js";
import { listLibraryItems } from "./template-library.js";
import { ensureDir } from "./config.js";

const TAG_SYNCED = "stripo_synced";
const TAG_ARCHIVED = "stripo_archived";
const REPORT_DIR = "stripo-smart-element-probe";

export async function probeStripoSmartElement({ config, options = {} }) {
  const setupError = validateStripoRestSetup(config);
  if (setupError) return setupError;

  if (!config.stripoMasterTemplateId) {
    return {
      status: "needs_setup",
      missing: ["stripo_master_template_id"],
      message:
        "Probe requires a master template ID configured in Orbit's extension settings. Run orbit_setup_stripo for instructions.",
    };
  }
  const templateId = Number(config.stripoMasterTemplateId);
  if (!Number.isInteger(templateId) || templateId <= 0) {
    return {
      status: "invalid_master_template_id",
      message: `Configured Stripo Master Template ID "${config.stripoMasterTemplateId}" is not a valid integer.`,
    };
  }

  const findings = [];
  const emailIds = [];
  const record = (name, status, details, extra = {}) => {
    findings.push({ name, status, details, ...extra });
  };

  // ─── Pick the test module ─────────────────────────────────────
  const result = listLibraryItems({ config, itemType: "module", tags: [TAG_SYNCED] });
  const liveModules = (result.items ?? []).filter(
    (item) => !(item.tags ?? []).includes(TAG_ARCHIVED),
  );

  let testModule = null;
  if (options.stripo_id) {
    testModule = liveModules.find(
      (m) => String(m.metadata?.stripo_id) === String(options.stripo_id),
    );
    if (!testModule) {
      record(
        "Pick test module (override)",
        "fail",
        `stripo_id override "${options.stripo_id}" not found in synced library.`,
      );
      return finalResult({ findings, config });
    }
  } else {
    for (const m of liveModules) {
      const htmlPath = m.files?.["module.html"];
      if (!htmlPath || !fs.existsSync(htmlPath)) continue;
      const html = fs.readFileSync(htmlPath, "utf8");
      if (html.includes("esd-dynamic-block")) {
        testModule = m;
        break;
      }
    }
    if (!testModule) {
      record(
        "Auto-pick smart-element module",
        "fail",
        "No synced module contains `esd-dynamic-block` markup. Either no module has been Smart-Element-bound yet, or sync hasn't pulled the latest. Mark up a module via Stripo's Data tab → Connect Website Page, save, re-sync.",
      );
      return finalResult({ findings, config });
    }
  }

  record(
    "Test module",
    "pass",
    `id=${testModule.metadata?.stripo_id} uid=${testModule.metadata?.stripo_uid} name="${testModule.title}"`,
  );

  // ─── Parse esd-dynamic-block config ───────────────────────────
  const html = fs.readFileSync(testModule.files["module.html"], "utf8");
  const dynamicBlockMatch = html.match(/esd-dynamic-block=["']([^"']+)["']/);
  if (!dynamicBlockMatch) {
    record(
      "Parse smart-element config",
      "fail",
      "Module HTML didn't contain esd-dynamic-block attribute on re-read. Sync may have produced inconsistent output.",
    );
    return finalResult({ findings, config });
  }

  let dynamicConfig;
  try {
    const decoded = dynamicBlockMatch[1]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'");
    dynamicConfig = JSON.parse(decoded);
  } catch (err) {
    record(
      "Parse smart-element config",
      "fail",
      `Could not parse esd-dynamic-block JSON: ${err.message}\nRaw attribute value (first 500 chars):\n${dynamicBlockMatch[1].slice(0, 500)}`,
    );
    return finalResult({ findings, config });
  }

  const variables = Array.isArray(dynamicConfig?.variables) ? dynamicConfig.variables : [];
  if (variables.length === 0) {
    record(
      "Parse smart-element config",
      "fail",
      `Config parsed but contains no variables array.\nFull config:\n${JSON.stringify(dynamicConfig, null, 2).slice(0, 1500)}`,
    );
    return finalResult({ findings, config });
  }

  const variableNames = variables.map((v) => v?.variable).filter(Boolean);

  // Detect top-level fields beyond `variables` — `link` is the known
  // wizard output. Future Stripo versions could add others (image, etc.)
  // so we report any non-variables siblings for visibility.
  const topLevelKeys = Object.keys(dynamicConfig).filter((k) => k !== "variables");
  const hasTopLevelLink = topLevelKeys.includes("link");
  const topLevelLinkConfig = hasTopLevelLink ? dynamicConfig.link : null;

  record(
    "Parse smart-element config",
    "pass",
    [
      `Discovered ${variableNames.length} variable(s): ${variableNames.join(", ")}`,
      `Selectors: ${variables.map((v) => v?.blockMapping?.[0]?.selector ?? "?").join(", ")}`,
      `Top-level keys (excluding variables): ${topLevelKeys.length ? topLevelKeys.join(", ") : "(none)"}`,
      hasTopLevelLink
        ? `Top-level link config:\n${JSON.stringify(topLevelLinkConfig, null, 2).slice(0, 600)}`
        : "(no top-level link field — q.1 arm will skip)",
    ].join("\n"),
  );

  const moduleUid = String(testModule.metadata?.stripo_uid);
  const ts = Date.now();

  // ═══ Baseline arm — variables in `values` (already confirmed PASS) ═══
  const sentinels = {};
  for (const name of variableNames) {
    sentinels[name] = `ORBIT_SMART_PROBE_${name.toUpperCase()}_${ts}`;
  }

  const baselinePayload = {
    templateId,
    emailName: `Orbit · smart-probe · baseline · ${ts}`,
    dataSources: [
      {
        name: "orbit_smart_probe_baseline",
        type: "RAW",
        value: [
          {
            id: moduleUid,
            values: sentinels,
          },
        ],
      },
    ],
    transformers: [],
    composers: [],
  };

  const baseline = await pushAndVerify({
    config,
    label: "baseline · variables in values",
    payload: baselinePayload,
    expectSentinels: Object.values(sentinels),
  });
  emailIds.push(...baseline.emailIds);
  record(
    "BASELINE — POST /email with variables in values",
    baseline.allFound ? "pass" : "fail",
    baseline.detail,
  );

  // ═══ q.1 — Top-level `link` binding ════════════════════════════════
  let q1aResult = null;
  let q1bResult = null;
  let q1cResult = null;

  if (!hasTopLevelLink) {
    record(
      "q.1 — Top-level link binding",
      "skip",
      "Module has no top-level `link` field in its esd-dynamic-block config. Wizard only emits a top-level `link` when the picked URL contains an anchor target. To exercise this arm, run Stripo's wizard against a page where it auto-detects a CTA link, save the module, re-sync.",
    );
  } else {
    // q.1.a — link inside values
    const sentA = `ORBIT_PROBE_LINK_A_${ts}`;
    const payloadA = {
      templateId,
      emailName: `Orbit · smart-probe · q1a-link-in-values · ${ts}`,
      dataSources: [
        {
          name: "orbit_smart_probe_q1a",
          type: "RAW",
          value: [
            {
              id: moduleUid,
              values: { ...sentinels, link: sentA },
            },
          ],
        },
      ],
      transformers: [],
      composers: [],
    };
    q1aResult = await pushAndVerify({
      config,
      label: "q.1.a · link inside values",
      payload: payloadA,
      expectSentinels: [sentA],
    });
    emailIds.push(...q1aResult.emailIds);
    record(
      "q.1.a — link inside values { link: <url> }",
      q1aResult.allFound ? "pass" : "fail",
      q1aResult.detail,
    );

    // q.1.b — link as sibling of values
    const sentB = `https://orbit-probe.invalid/q1b/${ts}`;
    const payloadB = {
      templateId,
      emailName: `Orbit · smart-probe · q1b-link-sibling · ${ts}`,
      dataSources: [
        {
          name: "orbit_smart_probe_q1b",
          type: "RAW",
          value: [
            {
              id: moduleUid,
              values: { ...sentinels },
              link: sentB,
            },
          ],
        },
      ],
      transformers: [],
      composers: [],
    };
    q1bResult = await pushAndVerify({
      config,
      label: "q.1.b · link as sibling of values",
      payload: payloadB,
      expectSentinels: [sentB],
    });
    emailIds.push(...q1bResult.emailIds);
    record(
      "q.1.b — link as sibling of values { id, values, link: <url> }",
      q1bResult.allFound ? "pass" : "fail",
      q1bResult.detail,
    );

    // q.1.c — link via values.href (long-shot fallback)
    const sentC = `https://orbit-probe.invalid/q1c/${ts}`;
    const payloadC = {
      templateId,
      emailName: `Orbit · smart-probe · q1c-href-in-values · ${ts}`,
      dataSources: [
        {
          name: "orbit_smart_probe_q1c",
          type: "RAW",
          value: [
            {
              id: moduleUid,
              values: { ...sentinels, href: sentC },
            },
          ],
        },
      ],
      transformers: [],
      composers: [],
    };
    q1cResult = await pushAndVerify({
      config,
      label: "q.1.c · href inside values",
      payload: payloadC,
      expectSentinels: [sentC],
    });
    emailIds.push(...q1cResult.emailIds);
    record(
      "q.1.c — href inside values { href: <url> } (long-shot)",
      q1cResult.allFound ? "pass" : "fail",
      q1cResult.detail,
    );
  }

  // ═══ q.2 — Custom variable name behaviour ══════════════════════════
  const unknownSentinel = `ORBIT_PROBE_UNKNOWN_VAR_${ts}`;
  const unknownPayload = {
    templateId,
    emailName: `Orbit · smart-probe · q2-unknown-var · ${ts}`,
    dataSources: [
      {
        name: "orbit_smart_probe_q2_unknown",
        type: "RAW",
        value: [
          {
            id: moduleUid,
            values: {
              ...sentinels,
              __orbit_unknown_var: unknownSentinel,
            },
          },
        ],
      },
    ],
    transformers: [],
    composers: [],
  };

  const unknownArm = await pushAndVerify({
    config,
    label: "q.2.unknown · unregistered variable name",
    payload: unknownPayload,
    expectSentinels: [unknownSentinel],
  });
  emailIds.push(...unknownArm.emailIds);

  let unknownArmDetail;
  if (unknownArm.pushFailed) {
    unknownArmDetail = `Stripo REJECTED the request containing an unknown variable name. This means compose-time validation can rely on Stripo to catch typos.\n\n${unknownArm.detail}`;
  } else if (unknownArm.allFound) {
    unknownArmDetail = `SURPRISING: Stripo accepted the unknown variable AND it appeared in the rendered HTML. Worth investigating where it landed (loose interpolation? template variable system?).\n\n${unknownArm.detail}`;
  } else {
    unknownArmDetail = `Stripo silently DROPPED the unknown variable (composed cleanly, sentinel absent from rendered output). Compose-time validation cannot rely on Stripo to surface typos — Orbit must validate variable names client-side against the module's variables array before push.\n\n${unknownArm.detail}`;
  }
  record("q.2.unknown — unregistered variable name behaviour", "info", unknownArmDetail);

  // q.2.manual arm — user-set-up custom binding
  if (options.custom_module_stripo_id && options.custom_variable_name) {
    const customId = String(options.custom_module_stripo_id);
    const customVarName = String(options.custom_variable_name);
    const customModule = liveModules.find(
      (m) => String(m.metadata?.stripo_id) === customId,
    );
    if (!customModule) {
      record(
        "q.2.manual — manually-edited custom variable",
        "fail",
        `custom_module_stripo_id "${customId}" not found in synced library. Confirm the module exists, is synced (re-run orbit_sync_stripo_modules), and is not archived.`,
      );
    } else {
      const customUid = String(customModule.metadata?.stripo_uid);
      const customHtml = fs.readFileSync(customModule.files["module.html"], "utf8");
      const customDynamicMatch = customHtml.match(/esd-dynamic-block=["']([^"']+)["']/);
      let customDynamicConfig = null;
      if (customDynamicMatch) {
        try {
          customDynamicConfig = JSON.parse(
            customDynamicMatch[1]
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, "&")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&#39;/g, "'"),
          );
        } catch {
          customDynamicConfig = null;
        }
      }

      const customVarNames = Array.isArray(customDynamicConfig?.variables)
        ? customDynamicConfig.variables.map((v) => v?.variable).filter(Boolean)
        : [];
      const customVarIsRegistered = customVarNames.includes(customVarName);

      const customSentinel = `ORBIT_PROBE_CUSTOM_${customVarName.toUpperCase()}_${ts}`;
      const customSentinels = {};
      for (const n of customVarNames) {
        customSentinels[n] =
          n === customVarName
            ? customSentinel
            : `ORBIT_PROBE_CUSTOM_FILLER_${n.toUpperCase()}_${ts}`;
      }
      if (!customVarIsRegistered) {
        customSentinels[customVarName] = customSentinel;
      }

      const customPayload = {
        templateId,
        emailName: `Orbit · smart-probe · q2-manual-custom · ${ts}`,
        dataSources: [
          {
            name: "orbit_smart_probe_q2_manual",
            type: "RAW",
            value: [{ id: customUid, values: customSentinels }],
          },
        ],
        transformers: [],
        composers: [],
      };

      const customArm = await pushAndVerify({
        config,
        label: `q.2.manual · custom var "${customVarName}" on module ${customId}`,
        payload: customPayload,
        expectSentinels: [customSentinel],
      });
      emailIds.push(...customArm.emailIds);
      record(
        `q.2.manual — manually-edited custom variable "${customVarName}"`,
        customArm.allFound ? "pass" : "fail",
        [
          `Custom module: id=${customId} uid=${customUid}`,
          `Variable registered in synced module's variables array: ${customVarIsRegistered}`,
          customVarIsRegistered
            ? "(re-sync confirmed the manual edit reached the saved module)"
            : "(re-sync did NOT pick up the variable — either the manual edit hasn't been saved in Stripo, or sync is reading a stale snapshot)",
          "",
          customArm.detail,
        ].join("\n"),
      );
    }
  } else {
    record(
      "q.2.manual — manually-edited custom variable",
      "needs_setup",
      [
        "This arm requires a Stripo-editor manual setup step that the API cannot perform (/modules is read-only).",
        "",
        "Steps for Sir to run before this arm can fire:",
        "  1. In Stripo's editor, open the test module (or duplicate it for safety).",
        "  2. Open the module's HTML via the code-edit panel (the < > icon).",
        "  3. Locate the `esd-dynamic-block` attribute on the wrapping element.",
        "  4. Add a new entry to its `variables` array, e.g.:",
        "       {",
        "         \"variable\": \"cta_text\",",
        "         \"defaultValue\": \"Default button text\",",
        "         \"blockMapping\": [{ \"selector\": \".esd-gen-cta-text\", \"attribute\": \"innerText\" }]",
        "       }",
        "  5. Add the matching CSS class (e.g. `esd-gen-cta-text`) to the inner",
        "     span/anchor element you want bound.",
        "  6. Save the module in Stripo.",
        "  7. Re-run `orbit_sync_stripo_modules` so Orbit's library reflects the edit.",
        "  8. Re-fire this probe with:",
        "       custom_module_stripo_id   = <the edited module's numeric ID>",
        "       custom_variable_name      = cta_text",
        "",
        "If the API honours the edit, the sentinel will appear in the rendered output.",
        "If it doesn't, Stripo's API only respects variable bindings that pass through the wizard's UI flow — which would close the door on per-slot customisation beyond the wizard's reach.",
      ].join("\n"),
    );
  }

  // ═══ Bonus arm — only-unknown-vars push ═══════════════════════════
  const onlyUnknownSentinel = `ORBIT_PROBE_ONLY_UNKNOWN_${ts}`;
  const onlyUnknownPayload = {
    templateId,
    emailName: `Orbit · smart-probe · bonus-only-unknown · ${ts}`,
    dataSources: [
      {
        name: "orbit_smart_probe_bonus_only_unknown",
        type: "RAW",
        value: [
          {
            id: moduleUid,
            values: { __orbit_only_unknown_var: onlyUnknownSentinel },
          },
        ],
      },
    ],
    transformers: [],
    composers: [],
  };

  const onlyUnknownArm = await pushAndVerify({
    config,
    label: "bonus · only unknown vars",
    payload: onlyUnknownPayload,
    expectSentinels: [onlyUnknownSentinel],
  });
  emailIds.push(...onlyUnknownArm.emailIds);

  let onlyUnknownDetail;
  if (onlyUnknownArm.pushFailed) {
    onlyUnknownDetail = `Stripo REJECTED a values payload containing only unknown variable names. Useful: confirms compose pre-flight can reject empty/invalid var sets server-side.\n\n${onlyUnknownArm.detail}`;
  } else if (onlyUnknownArm.allFound) {
    onlyUnknownDetail = `SURPRISING: only-unknown-vars payload composed AND the sentinel appeared. Investigate.\n\n${onlyUnknownArm.detail}`;
  } else {
    onlyUnknownDetail = `Stripo composed silently and dropped the only-unknown payload (sentinel absent). Defaults from the module's variables array filled in. Means Orbit MUST validate var names client-side or risk shipping the module's defaults when callers pass typos.\n\n${onlyUnknownArm.detail}`;
  }
  record("bonus — only-unknown-vars payload behaviour", "info", onlyUnknownDetail);

  // ─── Build summary ────────────────────────────────────────────────
  const q1Summary = !hasTopLevelLink
    ? "skipped (no top-level link field)"
    : [
        `q.1.a (link in values):     ${q1aResult?.allFound ? "PASS" : "fail"}`,
        `q.1.b (link sibling):       ${q1bResult?.allFound ? "PASS" : "fail"}`,
        `q.1.c (href in values):     ${q1cResult?.allFound ? "PASS" : "fail"}`,
      ].join(" | ");

  const q1Winner = !hasTopLevelLink
    ? null
    : q1aResult?.allFound
      ? "q.1.a — link inside values"
      : q1bResult?.allFound
        ? "q.1.b — link as sibling of values"
        : q1cResult?.allFound
          ? "q.1.c — href inside values"
          : null;

  const q3Resolution = (() => {
    if (q1Winner) {
      return `Top-level slot binding works via shape "${q1Winner}". A manually-JSON-edited cta_text binding would likely follow the same shape if added to the variables array (binding inner text via { selector: '.esd-gen-cta-text', attribute: 'innerText' }).`;
    }
    if (options.custom_module_stripo_id && options.custom_variable_name) {
      const manualFinding = findings.find((f) =>
        f.name.startsWith("q.2.manual"),
      );
      if (manualFinding?.status === "pass") {
        return `Manual JSON-edit path confirmed via q.2.manual — Sir can add cta_text to the module's variables array via Stripo's code editor, bind it to .esd-gen-cta-text, save, re-sync.`;
      }
    }
    return "Unresolved. q.1 found no working top-level shape, and q.2.manual either was not run or did not pass. Without API write access to /modules, the remaining options are: (a) advocate that Stripo expose CTA text in the wizard, (b) post-process the rendered HTML server-side to inject CTA text, (c) live with the wizard's auto-picked text.";
  })();

  const summary = {
    module_id: testModule.metadata?.stripo_id,
    module_uid: moduleUid,
    variables_discovered: variableNames,
    has_top_level_link: hasTopLevelLink,
    baseline_pass: baseline.allFound,
    q1_summary: q1Summary,
    q1_winner: q1Winner,
    q2_unknown_var_behaviour: unknownArm.pushFailed
      ? "rejected"
      : unknownArm.allFound
        ? "accepted+rendered (surprising)"
        : "silently dropped",
    q2_manual_arm_ran: Boolean(
      options.custom_module_stripo_id && options.custom_variable_name,
    ),
    q3_resolution: q3Resolution,
    bonus_only_unknown: onlyUnknownArm.pushFailed
      ? "rejected"
      : onlyUnknownArm.allFound
        ? "accepted+rendered (surprising)"
        : "silently dropped",
    emailIds,
  };

  return finalResult({ findings, config, emailIds, summary });
}

// ─── Helpers ────────────────────────────────────────────────────────

async function pushAndVerify({ config, label, payload, expectSentinels }) {
  let pushResult, pushError;
  try {
    pushResult = await stripoRestPost({ config, endpoint: "/email", body: payload });
  } catch (err) {
    pushError = err;
  }

  const emailId = pushResult
    ? pushResult.emailId ?? pushResult.id ?? pushResult.generatedEmailId ?? null
    : null;

  if (!emailId) {
    return {
      allFound: false,
      pushFailed: true,
      emailIds: [],
      detail: [
        `Arm: ${label}`,
        "Push: FAILED (no emailId returned)",
        `Error: ${pushError?.code ?? "unknown"} — ${pushError?.message?.slice(0, 600) ?? "(no message)"}`,
        "",
        "Request payload (first 1500 chars):",
        JSON.stringify(payload, null, 2).slice(0, 1500),
      ].join("\n"),
    };
  }

  let renderedBody;
  try {
    const fetched = await stripoRestGet({ config, endpoint: `/emails/${emailId}` });
    renderedBody = typeof fetched === "string" ? fetched : JSON.stringify(fetched);
  } catch (err) {
    return {
      allFound: false,
      pushFailed: false,
      emailIds: [emailId],
      detail: [
        `Arm: ${label}`,
        `emailId: ${emailId}`,
        `Fetch /emails/${emailId} failed: ${err.code ?? "unknown"} — ${err.message?.slice(0, 200)}`,
      ].join("\n"),
    };
  }

  const perResult = expectSentinels.map((s) => ({
    sentinel: s,
    found: renderedBody.includes(s),
  }));
  const allFound = perResult.every((r) => r.found);

  return {
    allFound,
    pushFailed: false,
    emailIds: [emailId],
    detail: [
      `Arm: ${label}`,
      `emailId: ${emailId}`,
      `Sentinels expected: ${expectSentinels.length}, found: ${perResult.filter((r) => r.found).length}`,
      "",
      "Per-sentinel:",
      ...perResult.map((r) => `  - ${r.sentinel} → ${r.found ? "FOUND" : "missing"}`),
      "",
      "Rendered email excerpt (first 2500 chars):",
      renderedBody.slice(0, 2500),
    ].join("\n"),
  };
}

function finalResult({ findings, config, emailIds = [], summary = null }) {
  const counts = findings.reduce((acc, f) => {
    acc[f.status] = (acc[f.status] ?? 0) + 1;
    return acc;
  }, {});

  const reportPath = writeReport({ config, findings, summary });

  return {
    status: "ok",
    counts,
    summary,
    report_path: reportPath,
    created_email_ids: emailIds,
    cleanup_hint:
      emailIds.length > 0
        ? `Probe created ${emailIds.length} throwaway email(s) named "Orbit · smart-probe · …". Filter and bulk-delete in Stripo's UI.`
        : "No emails created (probe failed before push).",
    findings,
  };
}

function writeReport({ config, findings, summary }) {
  const reportDir = path.join(config.defaultOutputDir, REPORT_DIR);
  ensureDir(reportDir);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(reportDir, `${timestamp}.md`);

  const summaryLines = summary
    ? [
        `- Module: id=${summary.module_id}, uid=${summary.module_uid}`,
        `- Variables discovered: ${summary.variables_discovered.join(", ")}`,
        `- Top-level \`link\` field present: ${summary.has_top_level_link}`,
        `- Baseline (variables in values): ${summary.baseline_pass ? "PASS" : "fail"}`,
        `- q.1 (top-level link): ${summary.q1_summary}`,
        `- q.1 winner: ${summary.q1_winner ?? "(none)"}`,
        `- q.2 unknown-var behaviour: ${summary.q2_unknown_var_behaviour}`,
        `- q.2 manual arm ran: ${summary.q2_manual_arm_ran}`,
        `- bonus only-unknown payload: ${summary.bonus_only_unknown}`,
        `- emailIds: ${summary.emailIds.join(", ") || "(none)"}`,
        "",
        `**q.3 resolution:** ${summary.q3_resolution}`,
      ].join("\n")
    : "_(probe did not reach summary stage)_";

  const lines = [
    "# Stripo Smart Element probe — findings",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    summaryLines,
    "",
    "## Probe results",
    "",
    ...findings.flatMap(({ name, status, details }) => [
      `### ${name}`,
      "",
      `**Status:** ${status}`,
      "",
      details ? "```" : "",
      details || "",
      details ? "```" : "",
      "",
    ]),
  ].filter((l) => l !== "");

  fs.writeFileSync(reportPath, lines.join("\n"));
  return reportPath;
}
