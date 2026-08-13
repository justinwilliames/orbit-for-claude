/**
 * MCP tool annotations — behavioural hints the host uses to decide how
 * much ceremony a tool call deserves.
 *
 * Why this file exists: every Orbit tool used to register with no
 * annotations at all, so a host had no way to tell
 * `orbit_sample_size` (pure arithmetic) apart from `orbit_sync_to_braze`
 * (writes a template into a production ESP) or `orbit_esp_send_test`
 * (puts a real email in a real inbox — unrecallable). Without hints the
 * spec default applies to all 119 equally: not read-only, possibly
 * destructive, open-world. That is simultaneously too alarming for the
 * calculators and too quiet for the ones that touch production.
 *
 * Three tiers, applied centrally in registerToolSafe():
 *
 *   READ_ONLY   — computes, validates, lints, scores, or reads. Mutates
 *                 nothing, anywhere. Safe to auto-run and safe to retry.
 *   LOCAL_WRITE — writes files inside the user's own workspace or Orbit
 *                 library. Reversible with a text editor, never reaches
 *                 a third party, so openWorldHint is false.
 *   REMOTE_WRITE— mutates something outside this machine: an ESP, a
 *                 Stripo workspace, a real recipient's inbox. These are
 *                 the calls that deserve a confirmation prompt.
 *
 * Classification rule: when a tool is ambiguous, it does NOT go in
 * READ_ONLY. An over-cautious hint costs a click; a wrong read-only
 * hint on a production write costs a send. Two tools sit where their
 * names mislead — `orbit_fix_stripo_module` only RETURNS corrected HTML
 * for manual paste-back (read-only despite "fix"), and
 * `orbit_check_push_copy` only previews truncation (read-only despite
 * matching every write-ish name pattern).
 *
 * ---- WHY THERE IS NO READ-ONLY DEFAULT ANY MORE ----------------------
 * This file used to end with `return { readOnlyHint: true, ... }` for
 * anything unlisted, on the reasoning that the safe group is the big one
 * so it should be the default. The reasoning is right about the ratio
 * and wrong about the direction: 57 of 121 tools were reaching hosts
 * with a FABRICATED read-only hint that nobody had ever checked, and one
 * of them — orbit_compose_stripo_email — POSTs an email into the user's
 * Stripo workspace. A default cannot be audited; a list can. Every tool
 * now names its tier, and an unlisted tool gets the conservative
 * annotation (not read-only, open-world) so the failure mode of
 * forgetting is a needless confirmation prompt rather than a silent
 * production write.
 *
 * tests/suites/27-tool-annotations.test.mjs asserts every registered
 * tool appears in exactly one tier, so a new tool cannot ship
 * unclassified.
 */

/** Mutates a third-party system. Host should confirm before running. */
export const REMOTE_WRITE = new Set([
  // push:true POSTs to Stripo's /emailgeneration/v1/email and creates a
  // new email in the user's workspace (server/stripo-compose.js). Its two
  // siblings were already here; this one was annotated read-only for
  // months purely because nobody listed it.
  "orbit_compose_stripo_email",
  // Redispatches an arbitrary handler out of TOOL_HANDLERS to resume a
  // truncated job — including, potentially, one of the writes above. It
  // is classified by the worst thing it can do, not the average one.
  "orbit_continue_job",
  "orbit_create_braze_canvas",
  "orbit_delete_stripo_email",
  "orbit_esp_push_template",
  "orbit_esp_send_test",
  "orbit_export_stripo_email_to_braze",
  "orbit_import_stripo_template",
  "orbit_sync_to_braze",
  "orbit_upload_image_to_braze",
  "orbit_upload_images_to_braze",
  "orbit_upload_template_images",
]);

/**
 * Irreversible members of REMOTE_WRITE. Everything else in that set
 * either creates a new object or overwrites one you can re-push, but
 * these two cannot be walked back: a deleted Stripo email is gone, and
 * a test send has already landed in someone's inbox.
 */
export const IRREVERSIBLE = new Set([
  "orbit_delete_stripo_email",
  "orbit_esp_send_test",
]);

/** Writes files in the user's workspace / Orbit library. Local only. */
export const LOCAL_WRITE = new Set([
  "orbit_assemble_email_template_from_components",
  "orbit_assemble_template_variation",
  "orbit_bootstrap_brain",
  "orbit_bootstrap_home_workspace",
  "orbit_build_braze_pack",
  "orbit_build_exec_report",
  "orbit_build_program_workspace",
  "orbit_compile_email_template",
  "orbit_document_stripo_design_system",
  "orbit_email_component_map",
  "orbit_generate_email_components",
  "orbit_export_notion_bundle",
  "orbit_generate_brain_gate",
  "orbit_import_design",
  "orbit_init_verified_claims",
  "orbit_learn_email_template",
  // action="save" persists an item into the Orbit library.
  "orbit_library",
  // action="render" writes the diagram files to the outputs directory.
  "orbit_lifecycle_diagram",
  "orbit_modify_email_template",
  "orbit_preview_email_template",
  "orbit_reconcile_image_urls",
  "orbit_render_email_preview",
  // Measures rather than mutates, but it writes a standalone copy of
  // the gate when artifact_path is passed — same profile as
  // orbit_review_creative, so it is classified by what it can write.
  "orbit_render_gate",
  "orbit_review_creative",
  "orbit_save_logo_file",
  "orbit_scaffold_brain_program",
  "orbit_setup_stripo",
  "orbit_sync_stripo_modules",
  "orbit_update_brand_guidelines",
  "orbit_write_brand_kit",
]);

/**
 * Writes locally, but gets there by calling a third party.
 *
 * One member today: orbit_brand_header sends the logo and brand examples
 * to Gemini and writes the returned PNG to disk. LOCAL_WRITE would claim
 * openWorldHint:false, which is a lie about where the pixels came from,
 * and REMOTE_WRITE would claim it mutates someone's ESP, which is a lie
 * in the other direction. It needs its own row.
 */
export const LOCAL_WRITE_NETWORKED = new Set([
  "orbit_brand_header",
]);

/**
 * Read-only tools that still cross the network (they read Braze,
 * Stripo, DNS, or an ESP). Same safety profile as the other read-only
 * tools, but openWorldHint stays true because the result depends on a
 * system Orbit doesn't control.
 */
export const READ_ONLY_NETWORKED = new Set([
  // Reads /purchases/revenue_series plus the two list endpoints and the
  // two data_series endpoints. Joins them into a share; writes nothing.
  "orbit_audit_attributed_revenue",
  "orbit_audit_braze_instance",
  "orbit_audit_content_blocks",
  // Reads /campaigns/list, /campaigns/details, /events/list and the two
  // data_series endpoints. Joins them; writes nothing anywhere.
  "orbit_audit_conversion_events",
  // Reads the preference-centre list + details. The optional live-page leg
  // GETs the subscriber's own page and never submits its form.
  "orbit_audit_preference_centre",
  "orbit_audit_send_calendar",
  "orbit_audit_stripo_modules",
  "orbit_audit_unsubscribe_page",
  "orbit_braze_performance",
  "orbit_check_bimi",
  "orbit_check_deliverability",
  "orbit_check_email_auth",
  "orbit_check_esp_auth",
  "orbit_check_stripo_auth",
  "orbit_check_template_collision",
  "orbit_check_version",
  "orbit_esp_read",
  "orbit_esp_templates",
  "orbit_export_braze_user_by_id",
  "orbit_export_stripo_email_html",
  "orbit_fetch_braze_template",
  "orbit_get_stripo_email",
  "orbit_get_stripo_limits",
  "orbit_inspect_stripo_module_bindings",
  "orbit_list_braze_templates",
  "orbit_list_stripo_emails",
  "orbit_list_stripo_folders",
  "orbit_list_stripo_modules",
  "orbit_list_stripo_templates",
  "orbit_probe_stripo_inline_html",
  "orbit_probe_stripo_smart_element",
  "orbit_probe_stripo_values",
  "orbit_read_braze_campaign",
  "orbit_read_braze_canvas",
  "orbit_read_braze_segment",
  "orbit_validate_braze_data",
  "orbit_validate_test_users",
]);

/**
 * Reads, computes, validates, lints, scores or composes — entirely on
 * this machine, mutating nothing. The calculators, the linters, the
 * skill router, the copy scorers.
 *
 * Enumerated rather than defaulted: see the header. Every name here was
 * checked against its handler for a filesystem write or an outbound
 * request before it went in.
 */
export const READ_ONLY_LOCAL = new Set([
  "orbit_accessibility_lint",
  "orbit_analyse_segments",
  "orbit_braze_namer",
  "orbit_braze_namer_dimensions",
  "orbit_build_brand_kit_draft",
  "orbit_build_email_from_template",
  "orbit_build_email_template_spec",
  "orbit_build_message_plan",
  "orbit_check_copy_readiness",
  "orbit_check_email_size",
  "orbit_check_push_copy",
  "orbit_check_setup",
  // Pure string transforms of HTML the caller supplied. No fetch, no browser.
  "orbit_client_sim",
  "orbit_cohort_retention",
  "orbit_compose_sequence",
  "orbit_compose_sms",
  "orbit_dark_mode_check",
  "orbit_esp_capabilities",
  "orbit_fix_stripo_module",
  "orbit_free_shipping_threshold",
  "orbit_gdpr_consent_audit",
  "orbit_generate_mjml_template",
  "orbit_generate_template_variations",
  "orbit_get_template",
  "orbit_liquid_snippet",
  // Enumerates 2^n renders of a string in memory. Nothing leaves the process.
  "orbit_liquid_state_matrix",
  "orbit_list_growth_forecast",
  "orbit_list_skills",
  "orbit_load_skill",
  "orbit_ltv_payback",
  "orbit_parse_master_template",
  "orbit_parse_postmaster_signal",
  "orbit_parse_test_readout",
  "orbit_qa_email",
  "orbit_replenishment_calc",
  "orbit_rfm_score",
  "orbit_route_task",
  "orbit_sample_size",
  "orbit_score_preheader",
  "orbit_score_subject_line",
  "orbit_start_brand_guidelines_intake",
  "orbit_start_program_discovery",
  "orbit_test_significance",
  "orbit_validate_brand_kit",
  "orbit_validate_email_template",
  "orbit_validate_liquid",
  "orbit_validate_output",
]);

/**
 * Build the annotations object for a tool.
 *
 * Anything not named in one of the five sets above gets the conservative
 * annotation — not read-only, open-world — so a tool added without a
 * classification costs a confirmation prompt instead of shipping a
 * fabricated safety claim. The drift test names it on the next run.
 */
export function annotationsFor(name) {
  if (REMOTE_WRITE.has(name)) {
    return {
      readOnlyHint: false,
      // Additive pushes can be re-run; a delete or a send cannot.
      destructiveHint: IRREVERSIBLE.has(name),
      idempotentHint: false,
      openWorldHint: true,
    };
  }
  if (LOCAL_WRITE.has(name)) {
    return {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    };
  }
  if (LOCAL_WRITE_NETWORKED.has(name)) {
    return {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    };
  }
  if (READ_ONLY_NETWORKED.has(name)) {
    return {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    };
  }
  if (READ_ONLY_LOCAL.has(name)) {
    return {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    };
  }
  // Unclassified. Assume the worst that isn't irreversible.
  return {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  };
}

/** Every explicitly-classified tool name, for the drift test. */
export function classifiedToolNames() {
  return new Set([
    ...REMOTE_WRITE,
    ...LOCAL_WRITE,
    ...LOCAL_WRITE_NETWORKED,
    ...READ_ONLY_NETWORKED,
    ...READ_ONLY_LOCAL,
  ]);
}
