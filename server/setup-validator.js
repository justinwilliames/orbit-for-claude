import fs from "node:fs";
import path from "node:path";
import {
  loadBrandProfile,
  resolveAgainstDir,
  resolveOptionalPath
} from "./config.js";
import { loadBrandGuidelines } from "./brand-kit.js";
import { BRAND_LAYOUT_FAMILIES, PLATFORM_OPTIONS } from "./visual-specs.js";
import { fileExists, isHexColor } from "./utils.js";

const DEFAULT_FEATURES = [
  "core",
  "lifecycle_diagrams",
  "brand_header_spec",
  "brand_header_render"
];

export function checkSetup({ config, rootDir, brandKitDir, requestedFeatures = [] }) {
  const effectiveRootDir = rootDir ?? config.rootDir;
  const effectiveBrandKitDir =
    resolveOptionalPath(brandKitDir) ?? config.brandKitDir ?? null;
  const requested = requestedFeatures.length > 0 ? requestedFeatures : DEFAULT_FEATURES;
  const brandKit = validateBrandKit({
    config,
    brandKitDir: effectiveBrandKitDir
  });

  const checks = [
    {
      key: "default_output_dir",
      passed: canWriteToDir(config.defaultOutputDir),
      detail: config.defaultOutputDir ?? null
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
        ...(config.googleAiApiKey ? [] : ["Add a Google AI API key in the Orbit extension settings for Nano Banana Pro rendering."])
      ]
    }
  };

  const missing = checks.filter((check) => !check.passed).map((check) => check.key);
  const requestedBlockers = requested.flatMap(
    (feature) => featureReadiness[feature]?.blocking_issues ?? []
  );

  return {
    status: requestedBlockers.length === 0 ? "ready" : "needs_setup",
    requested_features: requested,
    brand_kit_state: brandKit.operational_status,
    host: config.host,
    config_snapshot: {
      company_name: config.companyName ?? null,
      default_platform: config.defaultPlatform ?? null,
      default_geography: config.defaultGeography ?? null,
      brand_kit_dir: effectiveBrandKitDir,
      default_output_dir: config.defaultOutputDir ?? null,
      google_ai_api_key: config.googleAiApiKey ? "configured" : "missing"
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
      )
    },
    next_steps: dedupe([
      ...requestedBlockers,
      ...(brandKit.operational_status === "full"
        ? []
        : [
            "Copy the starter brand kit into your own assets folder and update the paths.",
            "Point Orbit's Brand Kit Directory setting to that folder."
          ]),
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
        "Set Brand Kit Directory in Claude Desktop or provide logo/example paths at call time."
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

  const resolvedPrimaryLogo = parsedProfile?.primaryLogo
    ? resolveAgainstDir(effectiveBrandKitDir, parsedProfile.primaryLogo)
    : null;
  checks.push({
    key: "primary_logo",
    passed: Boolean(resolvedPrimaryLogo && fileExists(resolvedPrimaryLogo)),
    detail: resolvedPrimaryLogo
  });
  if (!resolvedPrimaryLogo || !fileExists(resolvedPrimaryLogo)) {
    missing.push("primary_logo");
  }

  const exampleAssets = (parsedProfile?.exampleAssets ?? []).map((asset) =>
    resolveAgainstDir(effectiveBrandKitDir, asset)
  );
  checks.push({
    key: "example_assets",
    passed: exampleAssets.length >= 2 && exampleAssets.every((asset) => fileExists(asset)),
    detail: exampleAssets
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
          ]
  };
}

function canWriteToDir(dirPath) {
  if (!dirPath) {
    return false;
  }

  try {
    fs.mkdirSync(dirPath, { recursive: true });
    fs.accessSync(dirPath, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function dedupe(values) {
  return [...new Set(values.filter(Boolean))];
}
