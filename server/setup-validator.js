import fs from "node:fs";
import path from "node:path";
import {
  loadBrandProfile,
  resolveAgainstDir,
  resolveLoosePath,
  resolveOptionalPath,
  scanBrandKitFolder
} from "./config.js";
import { loadBrandGuidelines } from "./brand-kit.js";
import { getActivationState } from "./activation.js";
import { loadOrbitPreferences, saveCopyPreferences } from "./preferences.js";
import { BRAND_LAYOUT_FAMILIES, PLATFORM_OPTIONS } from "./visual-specs.js";
import { fileExists, isHexColor } from "./utils.js";

const DEFAULT_FEATURES = [
  "core",
  "lifecycle_diagrams",
  "brand_header_spec",
  "brand_header_render",
  "email_production",
  "library"
];

function buildLocalStorageNotice(config) {
  const workspaceRoot =
    config.homeWorkspace?.root ??
    config.homeWorkspace?.paths?.root ??
    path.join(config.host?.homeDir ?? "~", "Orbit");

  return {
    storage_mode: "local_only",
    workspace_root: workspaceRoot,
    summary:
      "Orbit stores templates, brand information, imported references, generated previews, and reusable library items locally on this device.",
    warning: `Back up ${workspaceRoot} if you want to keep your Orbit state. Moving to a different device starts from a fresh Orbit workspace unless you restore that folder.`,
    recommended_backup_paths: [
      workspaceRoot,
      path.join(workspaceRoot, "brand-kit"),
      path.join(workspaceRoot, "library"),
      path.join(workspaceRoot, "outputs"),
      path.join(workspaceRoot, "imports")
    ]
  };
}

export function checkSetup({ config, rootDir, brandKitDir, requestedFeatures = [] }) {
  const effectiveRootDir = rootDir ?? config.rootDir;
  const effectiveBrandKitDir =
    resolveOptionalPath(brandKitDir) ?? config.brandKitDir ?? null;
  const requested = requestedFeatures.length > 0 ? requestedFeatures : DEFAULT_FEATURES;
  const brandKit = validateBrandKit({
    config,
    brandKitDir: effectiveBrandKitDir
  });
  const { preferences } = loadOrbitPreferences({ config });
  const allowCopyWithoutBrandGuidelines = Boolean(
    preferences.copy_preferences?.allow_without_brand_guidelines
  );
  // Live activation state (no_key | valid | invalid | unverified). Surfaced
  // so this ungated healthcheck can self-diagnose a key-gated tool surface.
  const activation = getActivationState();

  const checks = [
    {
      key: "default_output_dir",
      passed: canWriteToDir(config.defaultOutputDir),
      detail: config.defaultOutputDir ?? null
    },
    {
      key: "library_dir",
      passed: canWriteToDir(config.libraryDir),
      detail: config.libraryDir ?? null
    },
    {
      key: "default_platform",
      passed: !config.defaultPlatform || PLATFORM_OPTIONS.includes(config.defaultPlatform),
      detail: config.defaultPlatform ?? null
    },
    {
      key: "brand_kit_dir",
      passed: !effectiveBrandKitDir || fileExists(effectiveBrandKitDir),
      detail: effectiveBrandKitDir
    },
    {
      key: "google_ai_api_key",
      passed: Boolean(config.googleAiApiKey),
      detail: config.googleAiApiKey ? "configured" : null
    },
    {
      key: "figma_api_token",
      passed: Boolean(config.figmaApiToken),
      detail: config.figmaApiToken ? "configured" : null
    },
    {
      key: "braze_api_key",
      passed: Boolean(config.brazeApiKey),
      detail: config.brazeApiKey ? "configured" : null
    },
    {
      key: "braze_rest_endpoint",
      passed: Boolean(config.brazeRestEndpoint),
      detail: config.brazeRestEndpoint ?? null
    },
    // Stripo credentials — presence only. These are appended LAST so the
    // index-based featureReadiness references above (checks[5..7]) stay
    // valid. Live token validity is checked by orbit_check_stripo_auth,
    // not here, to keep this healthcheck local and fast.
    {
      key: "stripo_rest_api_token",
      passed: Boolean(config.stripoRestApiToken),
      detail: config.stripoRestApiToken
        ? "configured (run orbit_check_stripo_auth to validate it live)"
        : null
    },
    {
      key: "stripo_plugin_credentials",
      passed: Boolean(config.stripoPluginId && config.stripoSecretKey),
      detail: config.stripoPluginId && config.stripoSecretKey ? "configured" : null
    },
    {
      key: "stripo_master_template_id",
      passed: Boolean(config.stripoMasterTemplateId),
      detail: config.stripoMasterTemplateId ?? null
    },
    // Free account-activation key (yourorbit.team). Appended LAST so the
    // index-based featureReadiness references above (checks[5..7]) stay
    // valid. `passed` reflects whether a key actually reached the server's
    // environment — the single field most likely to be empty right after a
    // version update, because Claude Desktop's long-lived MCP process keeps
    // running with the pre-update environment until it's fully relaunched.
    {
      key: "activation_key",
      passed: Boolean(config.activationKey),
      detail: config.activationKey
        ? `configured (activation status: ${activation.status})`
        : "missing — no Activation Key reached the server. If you've already pasted one in Settings → Extensions → Orbit, fully quit Claude Desktop (Cmd+Q on Mac; on Windows, quit from the system tray or Task Manager — closing the window is not enough) and relaunch so Orbit's background server restarts and re-reads it."
    }
  ];

  const featureReadiness = {
    core: {
      status: checks[0].passed ? "ready" : "needs_setup",
      blocking_issues: checks[0].passed ? [] : ["Set a writable default output directory."]
    },
    lifecycle_diagrams: {
      status: checks[0].passed ? "ready" : "needs_setup",
      blocking_issues: checks[0].passed
        ? []
        : ["Lifecycle diagram exports need a writable output directory."]
    },
    library: {
      status: checks[1].passed ? "ready" : "needs_setup",
      blocking_issues: checks[1].passed
        ? []
        : ["Orbit's library needs a writable library directory."]
    },
    email_production: {
      status: checks[0].passed && checks[1].passed ? "ready" : "needs_setup",
      blocking_issues: [
        ...(checks[0].passed ? [] : ["Email production needs a writable default output directory."]),
        ...(checks[1].passed ? [] : ["Email production needs a writable library directory."])
      ]
    },
    design_import: {
      status: checks[5].passed ? "ready" : "needs_setup",
      blocking_issues: checks[5].passed
        ? []
        : ["Add a Figma API token before importing Figma email designs."]
    },
    braze_publish: {
      status: checks[6].passed && checks[7].passed ? "ready" : "needs_setup",
      blocking_issues: [
        ...(checks[6].passed ? [] : ["Add a Braze API key before publishing templates from Orbit."]),
        ...(checks[7].passed
          ? []
          : ["Add a Braze REST endpoint, such as https://rest.iad-01.braze.com, before publishing."])
      ]
    },
    copy_generation: {
      status:
        brandKit.operational_status === "full" && brandKit.tone_of_voice_defined
          ? "ready"
          : allowCopyWithoutBrandGuidelines
            ? "ready_with_assumptions"
            : "needs_setup",
      blocking_issues: allowCopyWithoutBrandGuidelines
        ? []
        : [
            ...(brandKit.guidelines_path
              ? []
              : [
                  "Create brand guidelines before Orbit writes copy. Run the brand-guidelines intake first."
                ]),
            ...(brandKit.tone_of_voice_defined
              ? []
              : [
                  "Define Tone Of Voice in brand-guidelines.md before requesting copy from Orbit."
                ])
          ],
      guidance:
        brandKit.guidelines_path && brandKit.tone_of_voice_defined
          ? [
              "Orbit can write copy with the configured brand guidelines and tone of voice."
            ]
          : allowCopyWithoutBrandGuidelines
            ? [
                "Orbit will proceed with explicit brand assumptions because the user chose to skip brand-guidelines setup.",
                "You can still run orbit_start_brand_guidelines_intake later if you want Orbit to stop assuming the brand voice."
              ]
          : [
              "Orbit should pause copy generation until the brand-guidelines intake is completed.",
              "Use orbit_start_brand_guidelines_intake to collect voice, brand considerations, logos, and references."
            ]
    },
    brand_header_spec: {
      status:
        brandKit.operational_status === "full"
          ? "fully_operational"
          : brandKit.operational_status === "profile_only"
            ? "ready"
            : "conditional",
      blocking_issues: [],
      guidance:
        brandKit.operational_status === "full"
          ? ["Brand headers can use the configured brand kit, including brand-guidelines.md, by default."]
          : brandKit.operational_status === "profile_only"
            ? [
                "Brand headers can use the configured brand profile and assets by default.",
                "Add brand-guidelines.md to make the kit fully operational for creative guidance."
              ]
          : [
              "You can still build a brand-header spec by supplying logo and example references in the request.",
              "A local brand kit removes repetitive setup and improves consistency."
            ]
    },
    brand_header_render: {
      status:
        (brandKit.operational_status === "full" ||
          brandKit.operational_status === "profile_only") &&
        Boolean(config.googleAiApiKey)
          ? brandKit.operational_status === "full"
            ? "fully_operational"
            : "ready"
          : "needs_setup",
      blocking_issues: [
        ...(brandKit.operational_status === "missing" ||
        brandKit.operational_status === "incomplete"
          ? ["Configure a valid brand kit with a brand-profile.json, logo, and at least two examples."]
          : []),
        ...(config.googleAiApiKey ? [] : ["Add a Google AI API key in Settings → Extensions → Orbit, then fully quit and relaunch Claude Desktop (Cmd+Q on Mac; quit from the system tray or Task Manager on Windows)."])
      ]
    }
  };

  const missing = checks.filter((check) => !check.passed).map((check) => check.key);
  const requestedBlockers = requested.flatMap(
    (feature) => featureReadiness[feature]?.blocking_issues ?? []
  );

  const homeWorkspaceRoot = config.homeWorkspace?.root ?? null;
  const bootstrapRequired = homeWorkspaceRoot ? !fs.existsSync(homeWorkspaceRoot) : false;

  return {
    status: requestedBlockers.length === 0 ? "ready" : "needs_setup",
    bootstrap_required: bootstrapRequired,
    requested_features: requested,
    brand_kit_state: brandKit.operational_status,
    // Prominent local path guidance — always use these paths, never hardcode alternatives
    local_paths: {
      brand_kit_dir: effectiveBrandKitDir,
      default_output_dir: config.defaultOutputDir ?? null,
      library_dir: config.libraryDir ?? null,
      workspace_root: config.homeWorkspace?.root ?? null,
      note: "Always use these exact paths. Never substitute sandbox, temp, or fabricated paths."
    },
    host: config.host,
    config_snapshot: {
      company_name: config.companyName ?? null,
      default_platform: config.defaultPlatform ?? null,
      default_geography: config.defaultGeography ?? null,
      activation_key: config.activationKey ? "configured" : "missing",
      activation_status: activation.status,
      brand_kit_dir: effectiveBrandKitDir,
      default_output_dir: config.defaultOutputDir ?? null,
      library_dir: config.libraryDir ?? null,
      google_ai_api_key: config.googleAiApiKey ? "configured" : "missing",
      figma_api_token: config.figmaApiToken ? "configured" : "missing",
      braze_api_key: config.brazeApiKey ? "configured" : "missing",
      braze_rest_endpoint: config.brazeRestEndpoint ?? null,
      stripo_rest_api_token: config.stripoRestApiToken ? "configured" : "missing",
      stripo_plugin_credentials:
        config.stripoPluginId && config.stripoSecretKey ? "configured" : "missing",
      stripo_master_template_id: config.stripoMasterTemplateId ?? null
    },
    home_workspace: config.homeWorkspace,
    local_storage_notice: buildLocalStorageNotice(config),
    copy_preferences: {
      allow_without_brand_guidelines: allowCopyWithoutBrandGuidelines
    },
    checks,
    missing,
    feature_readiness: featureReadiness,
    brand_kit_validation: brandKit,
    starter_assets: {
      quickstart: path.join(effectiveRootDir, "docs", "SETUP.md"),
      starter_brand_kit: path.join(effectiveRootDir, "starter-brand-kit"),
      starter_brand_guidelines_template: path.join(
        effectiveRootDir,
        "starter-brand-kit",
        "brand-guidelines.template.md"
      ),
      library_dir: config.libraryDir
    },
    next_steps: dedupe([
      ...requestedBlockers,
      ...(brandKit.operational_status === "full"
        ? []
        : bootstrapRequired
          ? ["Run orbit_bootstrap_home_workspace to create your local Orbit workspace, then run orbit_start_brand_guidelines_intake to set up your brand kit."]
          : ["Run orbit_start_brand_guidelines_intake to set up your brand kit."]),
      ...(brandKit.operational_status === "profile_only"
        ? [
            "Add brand-guidelines.md or use Orbit's brand-kit draft tools to make the kit fully operational."
          ]
        : [])
    ])
  };
}

export function validateBrandKit({ config, brandKitDir }) {
  const effectiveBrandKitDir =
    resolveOptionalPath(brandKitDir) ?? config.brandKitDir ?? null;

  if (!effectiveBrandKitDir) {
    return {
      status: "missing",
      operational_status: "missing",
      brand_kit_dir: null,
      checks: [],
      missing: ["brand_kit_dir"],
      warnings: ["No Brand Kit Directory is configured."],
      guidance: [
        "Run orbit_bootstrap_home_workspace to create the local workspace, then run orbit_start_brand_guidelines_intake to set up your brand kit."
      ]
    };
  }

  const checks = [];
  const missing = [];
  const warnings = [];
  const profilePath = path.join(effectiveBrandKitDir, "brand-profile.json");
  const guidelines = loadBrandGuidelines(effectiveBrandKitDir);

  checks.push({
    key: "brand_kit_dir_exists",
    passed: fileExists(effectiveBrandKitDir),
    detail: effectiveBrandKitDir
  });

  if (!fileExists(effectiveBrandKitDir)) {
    return {
      status: "needs_attention",
      operational_status: "incomplete",
      brand_kit_dir: effectiveBrandKitDir,
      checks,
      missing: ["brand_kit_dir"],
      warnings,
      guidance: [
        "Create the directory or point Orbit to an existing brand kit folder."
      ]
    };
  }

  checks.push({
    key: "brand_profile_exists",
    passed: fileExists(profilePath),
    detail: profilePath
  });

  if (!fileExists(profilePath)) {
    missing.push("brand-profile.json");
    return {
      status: "needs_attention",
      operational_status: "incomplete",
      brand_kit_dir: effectiveBrandKitDir,
      profile_path: profilePath,
      checks,
      missing,
      warnings,
      guidance: [
        "Copy starter-brand-kit/brand-profile.template.json to brand-profile.json and fill it in."
      ]
    };
  }

  let parsedProfile;
  try {
    parsedProfile = loadBrandProfile(effectiveBrandKitDir);
  } catch (error) {
    return {
      status: "needs_attention",
      operational_status: "incomplete",
      brand_kit_dir: effectiveBrandKitDir,
      profile_path: profilePath,
      checks,
      missing: ["brand-profile.json"],
      warnings: [`brand-profile.json could not be parsed: ${error.message}`],
      guidance: ["Fix the JSON syntax in brand-profile.json."]
    };
  }

  checks.push({
    key: "brand_name",
    passed: Boolean(parsedProfile?.brandName),
    detail: parsedProfile?.brandName ?? null
  });
  if (!parsedProfile?.brandName) {
    missing.push("brand_name");
  }

  // Dynamic discovery: scan logos/ and examples/ folders for actual files on disk
  const discoveredLogos = scanBrandKitFolder(effectiveBrandKitDir, "logos");
  const discoveredExamples = scanBrandKitFolder(effectiveBrandKitDir, "examples");

  // Primary logo: use loose path resolution (handles Unicode whitespace variants),
  // then fall back to first discovered logo on disk
  let resolvedPrimaryLogo = parsedProfile?.primaryLogo
    ? resolveLoosePath(effectiveBrandKitDir, parsedProfile.primaryLogo)
    : null;
  if (!resolvedPrimaryLogo) {
    resolvedPrimaryLogo = discoveredLogos[0]
      ? resolveAgainstDir(effectiveBrandKitDir, discoveredLogos[0])
      : null;
  }
  checks.push({
    key: "primary_logo",
    passed: Boolean(resolvedPrimaryLogo && fileExists(resolvedPrimaryLogo)),
    detail: resolvedPrimaryLogo
  });
  if (!resolvedPrimaryLogo || !fileExists(resolvedPrimaryLogo)) {
    missing.push("primary_logo");
  }

  // Example assets: loose-resolve profile paths (handles U+202F vs U+0020),
  // then fall back to discovered examples if profile paths don't resolve
  let exampleAssets = (parsedProfile?.exampleAssets ?? []).map((asset) =>
    resolveLoosePath(effectiveBrandKitDir, asset)
  ).filter(Boolean);
  if (exampleAssets.length === 0 && discoveredExamples.length > 0) {
    exampleAssets = discoveredExamples.map((rel) =>
      resolveAgainstDir(effectiveBrandKitDir, rel)
    );
  }
  checks.push({
    key: "example_assets",
    passed: exampleAssets.length >= 2 && exampleAssets.every((asset) => fileExists(asset)),
    detail: exampleAssets
  });
  checks.push({
    key: "discovered_logos",
    passed: discoveredLogos.length > 0,
    detail: discoveredLogos
  });
  checks.push({
    key: "discovered_examples",
    passed: discoveredExamples.length > 0,
    detail: discoveredExamples
  });
  if (exampleAssets.length < 2) {
    missing.push("example_assets (minimum 2)");
  }
  if (exampleAssets.some((asset) => !fileExists(asset))) {
    missing.push("example_asset_files");
  }

  const colors = parsedProfile?.colors ?? {};
  const colorEntries = Object.entries(colors);
  checks.push({
    key: "colors",
    passed: colorEntries.length > 0,
    detail: colors
  });
  if (colorEntries.length === 0) {
    missing.push("colors");
  }
  const invalidColors = colorEntries
    .filter(([, value]) => !isHexColor(value))
    .map(([key]) => key);
  checks.push({
    key: "color_values_are_hex",
    passed: invalidColors.length === 0,
    detail: invalidColors
  });
  if (invalidColors.length > 0) {
    warnings.push(
      `These colors are not hex values and may not render consistently: ${invalidColors.join(", ")}`
    );
  }

  const invalidFamilies = (parsedProfile?.preferredHeaderFamilies ?? []).filter(
    (family) => !BRAND_LAYOUT_FAMILIES.includes(family)
  );
  checks.push({
    key: "preferred_header_families",
    passed: invalidFamilies.length === 0,
    detail: parsedProfile?.preferredHeaderFamilies ?? []
  });
  if (invalidFamilies.length > 0) {
    warnings.push(
      `Invalid preferred_header_families found: ${invalidFamilies.join(", ")}`
    );
  }

  const profileSummary = {
    brand_name: parsedProfile?.brandName ?? null,
    primary_logo: resolvedPrimaryLogo,
    example_assets: exampleAssets,
    colors,
    fonts: parsedProfile?.fonts ?? [],
    forbidden_treatments: parsedProfile?.forbiddenTreatments ?? [],
    brand_guidelines: guidelines?.guidelinesPath ?? null
  };

  checks.push({
    key: "brand_guidelines_exists",
    passed: Boolean(guidelines?.guidelinesPath),
    detail: guidelines?.guidelinesPath ?? null
  });
  if (!guidelines) {
    warnings.push(
      "brand-guidelines.md is missing. The brand kit is usable with profile/assets only, but not fully operational."
    );
  }

  const toneOfVoiceText = guidelines?.sections?.["Tone Of Voice"] ?? "";
  const toneOfVoiceDefined = Boolean(
    toneOfVoiceText && !/^TBD[:\s-]/i.test(toneOfVoiceText.trim())
  );
  checks.push({
    key: "tone_of_voice_defined",
    passed: !guidelines?.guidelinesPath || toneOfVoiceDefined,
    detail: toneOfVoiceDefined ? "defined" : null
  });
  if (guidelines?.guidelinesPath && !toneOfVoiceDefined) {
    warnings.push(
      "brand-guidelines.md exists, but the Tone Of Voice section is still missing or marked TBD."
    );
  }

  const operationalStatus =
    missing.length > 0
      ? "incomplete"
      : guidelines?.guidelinesPath
        ? "full"
        : "profile_only";

  return {
    status: missing.length === 0 ? "ok" : "needs_attention",
    operational_status: operationalStatus,
    brand_kit_dir: effectiveBrandKitDir,
    profile_path: profilePath,
    guidelines_path: guidelines?.guidelinesPath ?? null,
    tone_of_voice_defined: toneOfVoiceDefined,
    profile_summary: profileSummary,
    checks,
    missing: dedupe(missing),
    warnings,
    guidance:
      missing.length === 0
        ? operationalStatus === "full"
          ? ["Brand kit is fully operational. Orbit can use the profile, assets, and guidelines by default."]
          : [
              "Brand kit is usable with the profile and assets that are present.",
              "Add brand-guidelines.md or use Orbit's brand-kit draft tools to make the kit fully operational."
            ]
        : [
            "Fix the missing brand profile fields or files listed above.",
            "Use the starter-brand-kit template as the baseline structure."
          ],
    copy_guidance:
      guidelines?.guidelinesPath && toneOfVoiceDefined
        ? ["Copy generation can proceed with the configured brand voice."]
        : [
            "Orbit should ask whether to set up brand guidelines before writing net-new copy.",
            "If the user declines, Orbit can proceed with explicit assumptions and optionally remember that choice."
          ]
  };
}

// Persist the user's decision to skip brand-guidelines for copy writing.
// Call this separately after checkCopyReadiness — not inside the check itself.
export function saveCopyReadinessPreference({ config, libraryDir, allowWithoutBrandGuidelines }) {
  return saveCopyPreferences({ config, libraryDir, allowWithoutBrandGuidelines });
}

export function checkCopyReadiness({
  config,
  rootDir,
  brandKitDir,
  libraryDir,
  allowWithoutBrandGuidelines = false
}) {
  const setup = checkSetup({
    config,
    rootDir,
    brandKitDir,
    requestedFeatures: ["copy_generation"]
  });
  const readiness = setup.feature_readiness.copy_generation;

  if (readiness.status === "ready" || readiness.status === "ready_with_assumptions") {
    return {
      status: readiness.status,
      assistant_instruction:
        readiness.status === "ready"
          ? "Brand guidelines and tone of voice are ready. Orbit can write copy. Also suggest the next useful Orbit step, such as drafting variants or turning the copy into an email template."
          : "Proceed with explicit assumptions and remind the user that Orbit is using a saved skip-guidelines preference. Also suggest that Orbit can still set up brand guidelines later if they want to lock the tone of voice.",
      brand_kit_validation: setup.brand_kit_validation,
      copy_preferences: setup.copy_preferences ?? null,
      guidance: readiness.guidance ?? [],
      suggested_orbit_tools:
        readiness.status === "ready"
          ? [
              "orbit_build_email_template_spec",
              "orbit_generate_mjml_template",
              "orbit_preview_email_template"
            ]
          : ["orbit_start_brand_guidelines_intake", "orbit_build_email_template_spec"],
      suggested_next_steps:
        readiness.status === "ready"
          ? [
              "Orbit can write the copy now using the configured tone of voice.",
              "If this copy belongs in an email, Orbit can turn it into a reusable email template and preview it next.",
              "If you want variants, ask Orbit for subject line, preheader, CTA, or body-copy options next."
            ]
          : [
              "Orbit can write copy now with explicit assumptions because the user chose to skip brand-guidelines setup.",
              "If you want Orbit to stop making tone-of-voice assumptions later, run orbit_start_brand_guidelines_intake.",
              "If this copy belongs in an email, Orbit can still turn it into an MJML/HTML template after the copy draft."
            ]
    };
  }

  if (allowWithoutBrandGuidelines) {
    return {
      status: "ready_with_assumptions",
      assistant_instruction:
        "The user chose to skip brand-guidelines setup. Proceed with explicit brand assumptions and state that Orbit is writing copy without a configured brand voice. Also suggest that Orbit can still set up brand guidelines later.",
      brand_kit_validation: setup.brand_kit_validation,
      copy_preferences: null,
      guidance: [
        "Proceed with explicit assumptions and avoid claiming this copy reflects an approved brand voice.",
        "If the user wants Orbit to remember this choice, call saveCopyReadinessPreference after returning this result."
      ],
      suggested_orbit_tools: ["orbit_start_brand_guidelines_intake", "orbit_build_email_template_spec"],
      suggested_next_steps: [
        "Orbit can draft the copy now with explicit assumptions.",
        "If you want a proper tone of voice later, run orbit_start_brand_guidelines_intake.",
        "If the copy belongs in an email, Orbit can turn it into a reusable MJML/HTML template next."
      ]
    };
  }

  return {
    status: "needs_confirmation",
    assistant_instruction:
      "Pause and ask whether the user wants to set up brand guidelines first. If they say no, call orbit_check_copy_readiness again with allow_without_brand_guidelines=true and remember_choice=true if they want Orbit to remember that choice. Make the next Orbit steps explicit so the user knows both paths are supported.",
    question_prompt:
      "Brand guidelines and Tone Of Voice are not set up yet. Do you want to create them first, or should Orbit proceed with explicit assumptions and remember that choice for future copy requests?",
    brand_kit_validation: setup.brand_kit_validation,
    copy_preferences: setup.copy_preferences ?? null,
    guidance: [
      "If the user says yes, run orbit_start_brand_guidelines_intake.",
      "If the user says no, Orbit can proceed with explicit assumptions and optionally remember that preference."
    ],
    suggested_orbit_tools: ["orbit_start_brand_guidelines_intake", "orbit_build_email_template_spec"],
    suggested_next_steps: [
      "Reply yes and Orbit will walk through tone of voice, brand constraints, logos, and examples.",
      "Reply no and Orbit can proceed with explicit assumptions for this copy request.",
      "If the copy belongs in an email, Orbit can turn the approved copy into a reusable template after this step."
    ]
  };
}

function canWriteToDir(dirPath) {
  if (!dirPath) return false;
  try {
    if (!fs.existsSync(dirPath)) {
      // Dir not created yet — check if parent is writable instead.
      const parent = path.dirname(dirPath);
      if (!fs.existsSync(parent)) return false;
      fs.accessSync(parent, fs.constants.W_OK);
      return true;
    }
    fs.accessSync(dirPath, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function dedupe(values) {
  return [...new Set(values.filter(Boolean))];
}
