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
 * tests/suites/27-tool-annotations.test.mjs asserts every registered
 * tool appears in exactly one tier, so a new tool cannot ship
 * unclassified.
 */

/** Mutates a third-party system. Host should confirm before running. */
export const REMOTE_WRITE = new Set([
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
  "orbit_build_program_workspace",
  "orbit_document_stripo_design_system",
  "orbit_export_notion_bundle",
  "orbit_generate_brain_gate",
  "orbit_import_design",
  "orbit_init_verified_claims",
  "orbit_learn_email_template",
  "orbit_modify_email_template",
  "orbit_reconcile_image_urls",
  "orbit_review_creative",
  "orbit_save_logo_file",
  "orbit_scaffold_brain_program",
  "orbit_setup_stripo",
  "orbit_sync_stripo_modules",
  "orbit_update_brand_guidelines",
  "orbit_write_brand_kit",
]);

/**
 * Read-only tools that still cross the network (they read Braze,
 * Stripo, DNS, or an ESP). Same safety profile as the other read-only
 * tools, but openWorldHint stays true because the result depends on a
 * system Orbit doesn't control.
 */
export const READ_ONLY_NETWORKED = new Set([
  "orbit_audit_braze_instance",
  "orbit_audit_content_blocks",
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
 * Build the annotations object for a tool.
 *
 * Anything not named in the three sets above is treated as a local
 * read-only tool (calculators, linters, composers, skill routing) —
 * the largest and safest group, so it is the default rather than a
 * list that would need editing on every addition. The drift test is
 * what stops a genuine write sneaking in via that default: it fails
 * unless a new tool is explicitly acknowledged.
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
  if (READ_ONLY_NETWORKED.has(name)) {
    return {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    };
  }
  return {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };
}

/** Every explicitly-classified tool name, for the drift test. */
export function classifiedToolNames() {
  return new Set([...REMOTE_WRITE, ...LOCAL_WRITE, ...READ_ONLY_NETWORKED]);
}
