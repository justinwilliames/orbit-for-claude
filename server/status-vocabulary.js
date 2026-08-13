/**
 * The closed vocabulary of `status` values Orbit tools return, split by
 * what the value actually means for the caller.
 *
 * Why this file exists: `tool_call` minus `tool_error` was documented as
 * the success rate and wasn't one. Handlers hand back a shaped
 * `{status:"..."}` payload through the SUCCESS path, so the classifier
 * that decides "did this call do the thing" was a hand-maintained
 * ten-entry allowlist against a vocabulary of seventy-odd. Everything it
 * hadn't heard of counted as a win — including `push_not_configured` and
 * `needs_plugin_credentials`, the two most common ways a fresh install
 * fails on day one.
 *
 * Three buckets, not two, because "delivered", "asked the user a
 * question" and "refused" are genuinely different outcomes and lumping
 * the middle one either way produces a wrong number:
 *
 *   DELIVERED — the tool did the thing (possibly with caveats).
 *   PROMPTED  — the tool worked as designed and is waiting on the human:
 *               missing arguments, a confirmation, an approval. Counted
 *               as a success, because the conversational turn is the
 *               product, not a defect.
 *   FAILED    — the tool did not do the thing. Counted as a failure and
 *               emitted as the telemetry error class.
 *
 * Every member is identifier-shaped so it survives the receiving end's
 * error_class regex (get-orbit lib/db.ts: /^[A-Za-z][A-Za-z0-9_-]{0,80}$/).
 *
 * tests/suites/31-status-vocabulary.test.mjs greps every `status:` /
 * `status =` literal out of server/ and fails if one isn't in exactly one
 * bucket, so this can't silently decay the way the allowlist did.
 */

/** The tool did the thing. */
export const DELIVERED_STATUSES = new Set([
  "ok",
  "success",
  "approved",
  "archived",
  "collision_found",       // the collision check ran and found one — that IS the answer
  "no_collision",          // ...and so is this
  "composed",
  "created_unconfirmed",   // created; readback couldn't confirm — see created_gen_area_missing for the failure twin
  "created_unverified",
  "created_with_warnings",
  "draft",
  "dry_run",
  "instructions_only",
  "learned",
  "no_changes",
  "already_exists",
  "patched",
  "paths_resolved",
  // `ready` was missing from this file until the day orbit_check_setup could
  // first return it. It never could before: brand_header_render sat in
  // DEFAULT_FEATURES and needs an API key, so a keyless install — the whole
  // product — always came back needs_setup.
  "ready",
  "ready_for_draft",
  "ready_for_workspace",
  "ready_with_assumptions",
  "saved",
  "skipped",
  "synced",
  "up_to_date",
  "ahead",
  "update_available",
  "warning",
  "warnings",
  // `partial` is a DELIVERED, deliberately: the tool shipped some of the
  // work and told the caller what it couldn't do. Classifying it as a
  // failure would make every large Braze audit that trimmed one endpoint
  // read as a broken install.
  "partial",
  // `continuation_required` likewise: the job checkpointed and handed
  // back a resume token. Telemetry cannot see whether the user resumed,
  // and emitting an error for the working continuation pattern would
  // bury the real failures in noise. Abandonment is a funnel question
  // for the receiving end (continuation_required with no matching
  // orbit_continue_job), not an error class.
  "continuation_required",
]);

/** The tool is working as designed and waiting on the human. */
export const PROMPTED_STATUSES = new Set([
  "needs_inputs",
  "needs_approval",
  "needs_attention",
  "needs_confirmation",
  "needs_copy_confirmation",
  "needs_discovery",
  "needs_platform_confirmation",
  "no_strong_match",       // the router looked and found nothing close — an honest answer
  // Read N templates, hit the page cap, and cannot say whether the
  // name exists past it. Not FAILED — nothing broke. Not DELIVERED —
  // there is no answer. The user has to narrow the search or accept
  // the cap, which is what PROMPTED means.
  "not_found_in_partial_list",
  // A linter that read the document and could not resolve the thing it
  // grades. Nothing broke and nothing is missing — the encoding defeats
  // a regex parser, and the human can fix that by inlining the colours
  // or simplifying the selectors. PROMPTED, because the next move is
  // theirs. It exists so a check can decline to grade instead of
  // returning the `pass` a zero-measurement run used to produce.
  "not_measurable",
]);

/**
 * The tool did not do the thing. These become the telemetry error class.
 *
 * The credential states lead deliberately: they are the dominant
 * fresh-install outcome and the whole reason the classifier exists.
 */
export const FAILED_STATUSES = new Set([
  // Missing / rejected credentials — day one on a stranger's machine.
  "needs_setup",
  "needs_plugin_credentials",
  "push_not_configured",
  "auth_failed",
  // Transport and upstream. Set by withToolErrorHandling's catch, which
  // maps err -> code -> status, so these never appear as a literal in a
  // handler and a grep alone would never find them.
  "timeout",
  "rate_limited",
  "upstream_unavailable",
  "fetch_failed",
  "fetch_error",
  "push_failed",
  "unexpected_response",
  "not_found",
  // Bad or unusable input.
  "error",
  "failed",
  "invalid_input",
  "validation_failed",
  "invalid_composition",
  "invalid_master_template_id",
  "invalid_platform_logic",
  "invalid_ref",
  "slot_values_invalid",
  "unsupported",
  "unsupported_platform",
  // The read Orbit needed did not come back, so NOTHING was checked. A
  // FAILURE, never a delivered empty result — the audits that emit it
  // (conversion events, preference centre, send calendar) would otherwise
  // have a clean-looking way to report that they examined nothing at all,
  // which is the exact success-while-wrong shape they were written against.
  "unavailable",
  // Asked for something that isn't there.
  "file_not_found",
  "file_too_large",
  // A PDF whose content stream yielded no words. The file is there and
  // readable; what is missing is any text to derive a design from —
  // typically a flat image export. A FAILURE, because the step did not
  // do the thing, and because "ok" over zero recovered words is what
  // used to feed a component map of empty rich_text blocks.
  "unreadable_pdf",
  // The Figma twin of the above: the node resolved and returned structure,
  // but nothing in it is component-sized — almost always the page or a
  // single layer rather than the frame holding the email. A FAILURE for
  // the same reason: "ok" with sections:[] flowed into a component map
  // that had nothing in it.
  "no_sections_detected",
  "gen_area_missing",
  "created_gen_area_missing",
  "html_missing",
  "html_not_extractable",
  "missing",
  "missing_components",
  "needs_assets",
  "needs_components",
  "module_list_failed",
  "module_not_found",
  "modules_not_found",
  "no_modules",
  "no_module_a",
  "no_markup",
  "no_buttons_found",
  "no_fixer",
  "overrides_not_pushable",
  "unresolved",
]);

/**
 * Statuses that exist but are set indirectly (computed into a variable,
 * or mapped from an error code) so the drift test's grep can't see them
 * at their return site. Listed here so the test still has to account for
 * them and so removing one from the sets above is caught.
 */
export const INDIRECT_STATUSES = [
  "timeout",
  "rate_limited",
  "upstream_unavailable",
  "needs_plugin_credentials",
];

/**
 * A shaped abstention, for any check whose input never arrived.
 *
 * The failure mode this exists to stop is specific and this repo has
 * shipped it three times: a lookup errors, the error is swallowed, and
 * the empty result is then reported as a positive finding — "no DKIM
 * selector was found", "p=missing", "all pairs pass". Nothing was found
 * because nothing was read. `verdict: null` is the point: there is no
 * grade, and a caller that wants one has to notice.
 */
export function unreadable(reason, extra = {}) {
  return {
    status: "not_measurable",
    verdict: null,
    not_measured: true,
    reason,
    ...extra,
  };
}

/** True when this status means the call did not do the thing. */
export function isFailureStatus(status) {
  return typeof status === "string" && FAILED_STATUSES.has(status);
}

/** Every status Orbit is known to emit, across all three buckets. */
export const ALL_STATUSES = new Set([
  ...DELIVERED_STATUSES,
  ...PROMPTED_STATUSES,
  ...FAILED_STATUSES,
]);
