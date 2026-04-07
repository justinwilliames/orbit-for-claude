import fs from "node:fs";
import path from "node:path";
import { isLocalPath } from "./config.js";
import {
  hashObject,
  inferMimeType,
  isHexColor,
  parseJsonInput,
  slugify,
  titleCase,
  writeJson,
  writeText
} from "./utils.js";

export const BRAND_GUIDELINE_SECTIONS = [
  "Brand Overview",
  "Audience And Promise",
  "Visual System",
  "Logos And Safe Usage",
  "Color And Typography",
  "Tone Of Voice",
  "Messaging Dos And Don’ts",
  "Email Header Rules",
  "Approved References",
  "Open Questions / TBD"
];

export const BRAND_GUIDELINES_INTAKE_STEPS = [
  {
    id: "brand-foundation",
    title: "Brand Foundation",
    purpose:
      "Capture the baseline brand story, audience, and voice before Orbit drafts anything.",
    questions: [
      {
        id: "brand_overview",
        label: "Brand overview",
        prompt:
          "In 1-2 sentences, what is the brand and what should Orbit understand about it?"
      },
      {
        id: "audience_and_promise",
        label: "Audience and promise",
        prompt:
          "Who is the audience, and what promise or impression should the brand communicate to them?"
      },
      {
        id: "tone_of_voice",
        label: "Tone of voice",
        prompt:
          "What tone of voice should Orbit follow? Include adjectives, language cues, and any words or styles to avoid if useful."
      }
    ]
  },
  {
    id: "brand-considerations",
    title: "Brand Considerations",
    purpose:
      "Capture the visual rules and constraints Orbit must respect instead of inventing them.",
    questions: [
      {
        id: "visual_system",
        label: "Visual system",
        prompt:
          "What are the important brand considerations Orbit should respect visually? Mention imagery, texture, spacing, composition, density, motion, or overall style cues."
      },
      {
        id: "color_and_typography",
        label: "Color and typography",
        prompt:
          "What colors and type choices are part of the brand system? You can give hex codes, font names, or a plain-language summary."
      },
      {
        id: "brand_dos",
        label: "Brand dos and don'ts",
        prompt:
          "What should Orbit always do, and what should it never do, when representing the brand?"
      },
      {
        id: "email_header_rules",
        label: "Email header rules",
        prompt:
          "Are there email or header-specific rules, such as no text in image, no gradients, logo sizing, or safe-space rules?"
      }
    ]
  },
  {
    id: "logo-assets",
    title: "Logo Assets",
    purpose:
      "Collect the official logo files Orbit must use for brand-safe creative output.",
    questions: [
      {
        id: "logo_paths",
        label: "Primary logo",
        prompt:
          "Upload your primary logo file using the attachment/upload button on your message."
      },
      {
        id: "alternate_logo_path",
        label: "Alternate logo",
        prompt:
          "If you have an alternate logo lockup, icon, or reversed logo, upload it now. Skip if not applicable."
      },
      {
        id: "logos_and_safe_usage",
        label: "Logo safe usage",
        prompt:
          "Any logo-safe-usage rules Orbit should follow, such as clear space, minimum size, or prohibited treatments?"
      }
    ]
  },
  {
    id: "brand-examples",
    title: "Brand Examples",
    purpose:
      "Collect approved reference examples so Orbit follows the real brand rather than guessing.",
    questions: [
      {
        id: "brand_example_paths",
        label: "Brand example file paths",
        prompt:
          "Please provide local file paths for at least two approved brand examples Orbit should learn from."
      },
      {
        id: "approved_references",
        label: "Approved reference notes",
        prompt:
          "Any notes on why these references are approved or what Orbit should emulate from them?"
      },
      {
        id: "preferred_header_families",
        label: "Preferred header layout family",
        prompt:
          "If you have a preferred Orbit header layout family, note it here: left-anchor, center-lock, split-stage, or framed-narrative."
      }
    ]
  }
];

export function startBrandGuidelinesIntake({
  config,
  intakeState,
  brandKitDir,
  brandName,
  companyName,
  logoPaths = [],
  brandExamplePaths = [],
  alternateLogoPath,
  colors = {},
  fonts = [],
  brandOverview,
  audienceAndPromise,
  visualSystem,
  logosAndSafeUsage,
  colorAndTypography,
  toneOfVoice,
  brandDos = [],
  brandDonts = [],
  emailHeaderRules = [],
  approvedReferences = [],
  openQuestions = [],
  preferredHeaderFamilies = [],
  defaultCanvas,
  visualStyle
}) {
  const state = mergeBrandKitIntakeState({
    current: intakeState,
    incoming: {
      brandKitDir,
      brandName,
      companyName,
      logoPaths,
      brandExamplePaths,
      alternateLogoPath,
      colors,
      fonts,
      brandOverview,
      audienceAndPromise,
      visualSystem,
      logosAndSafeUsage,
      colorAndTypography,
      toneOfVoice,
      brandDos,
      brandDonts,
      emailHeaderRules,
      approvedReferences,
      openQuestions,
      preferredHeaderFamilies,
      defaultCanvas,
      visualStyle
    },
    defaultBrandKitDir: config?.brandKitDir
  });

  const evaluation = evaluateBrandGuidelinesIntake(state);
  if (!evaluation.isComplete) {
    return buildBrandGuidelinesIntakeResponse(evaluation);
  }

  const draftResult = buildBrandKitDraft({
    config,
    ...state,
    allowTbdDraft: true
  });

  return {
    status: "ready_for_draft",
    workflow: "step_by_step_brand_guidelines_intake",
    brand_name: state.brandName ?? state.companyName ?? "TBD Brand Name",
    assistant_instruction:
      "The required intake is complete. Show the draft to the user for review, make any requested edits, and only write files after approval.",
    progress: {
      total_steps: BRAND_GUIDELINES_INTAKE_STEPS.length,
      completed_steps: BRAND_GUIDELINES_INTAKE_STEPS.map((step) => step.id),
      remaining_steps: [],
      completion_percent: 100
    },
    intake_state: serializeBrandKitIntakeState(state),
    intake_state_json: JSON.stringify(serializeBrandKitIntakeState(state)),
    guidance: [
      "Do not skip the review step. Confirm the draft before calling orbit_write_brand_kit.",
      "If the user wants changes, keep updating the intake answers or use orbit_update_brand_guidelines on the draft."
    ],
    draft: draftResult.draft,
    warnings: draftResult.draft?.warnings ?? []
  };
}

export function buildBrandKitDraft({
  config,
  brandKitDir,
  brandName,
  companyName,
  logoPaths = [],
  brandExamplePaths = [],
  alternateLogoPath,
  colors = {},
  fonts = [],
  brandOverview,
  audienceAndPromise,
  visualSystem,
  logosAndSafeUsage,
  colorAndTypography,
  toneOfVoice,
  brandDos = [],
  brandDonts = [],
  emailHeaderRules = [],
  approvedReferences = [],
  openQuestions = [],
  preferredHeaderFamilies = [],
  defaultCanvas,
  visualStyle,
  allowTbdDraft = false
}) {
  const normalizedInput = mergeBrandKitIntakeState({
    incoming: {
      brandKitDir,
      brandName,
      companyName,
      logoPaths,
      brandExamplePaths,
      alternateLogoPath,
      colors,
      fonts,
      brandOverview,
      audienceAndPromise,
      visualSystem,
      logosAndSafeUsage,
      colorAndTypography,
      toneOfVoice,
      brandDos,
      brandDonts,
      emailHeaderRules,
      approvedReferences,
      openQuestions,
      preferredHeaderFamilies,
      defaultCanvas,
      visualStyle
    },
    defaultBrandKitDir: config?.brandKitDir
  });
  const {
    brandKitDir: resolvedBrandKitDir,
    brandName: resolvedBrandName,
    companyName: resolvedCompanyName,
    logoPaths: resolvedLogoPaths,
    brandExamplePaths: resolvedBrandExamplePaths,
    alternateLogoPath: resolvedAlternateLogoPath,
    colors: resolvedColors,
    fonts: resolvedFonts,
    brandOverview: resolvedBrandOverview,
    audienceAndPromise: resolvedAudienceAndPromise,
    visualSystem: resolvedVisualSystem,
    logosAndSafeUsage: resolvedLogosAndSafeUsage,
    colorAndTypography: resolvedColorAndTypography,
    toneOfVoice: resolvedToneOfVoice,
    brandDos: resolvedBrandDos,
    brandDonts: resolvedBrandDonts,
    emailHeaderRules: resolvedEmailHeaderRules,
    approvedReferences: resolvedApprovedReferences,
    openQuestions: resolvedOpenQuestions,
    preferredHeaderFamilies: resolvedPreferredFamilies,
    defaultCanvas: resolvedDefaultCanvas,
    visualStyle: resolvedVisualStyle
  } = normalizedInput;

  if (!allowTbdDraft) {
    const evaluation = evaluateBrandGuidelinesIntake(normalizedInput);
    if (!evaluation.isComplete) {
      return buildBrandGuidelinesIntakeResponse(evaluation);
    }
  }

  const missingInputs = [];

  if (resolvedLogoPaths.length === 0) {
    missingInputs.push("logo_paths (minimum 1)");
  }
  if (resolvedBrandExamplePaths.length < 2) {
    missingInputs.push("brand_example_paths (minimum 2)");
  }

  const missingFiles = [
    ...resolvedLogoPaths.map((filePath) => ({ label: "logo", filePath })),
    ...(resolvedAlternateLogoPath
      ? [{ label: "alternate_logo", filePath: resolvedAlternateLogoPath }]
      : []),
    ...resolvedBrandExamplePaths.map((filePath) => ({
      label: "brand_example",
      filePath
    }))
  ].filter((item) => !fileExists(item.filePath));

  for (const missing of missingFiles) {
    missingInputs.push(`${missing.label}:${missing.filePath}`);
  }

  if (missingInputs.length > 0) {
    return {
      status: "needs_inputs",
      missing_inputs: [...new Set(missingInputs)],
      guidance: [
        "Provide at least one official logo file path.",
        "Provide at least two brand example file paths.",
        "Use local file paths rather than chat uploads for v1 brand-kit setup."
      ]
    };
  }

  const normalizedBrandName =
    cleanString(resolvedBrandName) ?? cleanString(resolvedCompanyName);
  const invalidColorKeys = Object.entries(resolvedColors ?? {})
    .filter(([, value]) => cleanString(value) && !isHexColor(value))
    .map(([key]) => key);
  const normalizedColors = normalizeColorMap(resolvedColors);
  const normalizedFonts = normalizeStringArray(resolvedFonts);
  const normalizedBrandDos = normalizeStringArray(resolvedBrandDos);
  const normalizedBrandDonts = normalizeStringArray(resolvedBrandDonts);
  const normalizedEmailHeaderRules = normalizeStringArray(resolvedEmailHeaderRules);
  const normalizedApprovedReferences = normalizeStringArray(resolvedApprovedReferences);
  const normalizedOpenQuestions = normalizeStringArray(resolvedOpenQuestions);
  const normalizedPreferredFamilies = normalizeStringArray(resolvedPreferredFamilies);
  const resolvedCanvas = normalizeCanvas(resolvedDefaultCanvas) ?? {
    width: 1200,
    height: 400
  };

  const assetPlan = buildAssetPlan({
    logoPaths: resolvedLogoPaths,
    alternateLogoPath: resolvedAlternateLogoPath,
    brandExamplePaths: resolvedBrandExamplePaths
  });

  const missingInfo = [];
  if (!normalizedBrandName) {
    missingInfo.push("brand_name");
  }
  if (Object.keys(normalizedColors).length === 0) {
    missingInfo.push("colors");
  }
  if (normalizedFonts.length === 0) {
    missingInfo.push("fonts");
  }
  if (!cleanString(resolvedBrandOverview)) {
    missingInfo.push("brand_overview");
  }
  if (!cleanString(resolvedAudienceAndPromise)) {
    missingInfo.push("audience_and_promise");
  }
  if (!cleanString(resolvedVisualSystem) && !cleanString(resolvedVisualStyle)) {
    missingInfo.push("visual_system");
  }
  if (!cleanString(resolvedToneOfVoice)) {
    missingInfo.push("tone_of_voice");
  }
  if (normalizedBrandDos.length === 0 && normalizedBrandDonts.length === 0) {
    missingInfo.push("messaging_dos_and_donts");
  }
  if (normalizedEmailHeaderRules.length === 0) {
    missingInfo.push("email_header_rules");
  }

  const draftProfile = {
    brand_name: normalizedBrandName ?? "TBD Brand Name",
    primary_logo: assetPlan.logos.find((item) => item.role === "primary")
      ?.destination_relative_path,
    alternate_logo:
      assetPlan.logos.find((item) => item.role === "alternate")
        ?.destination_relative_path ?? "",
    colors:
      Object.keys(normalizedColors).length > 0
        ? normalizedColors
        : { primary: "", accent: "", secondary: "" },
    example_assets: assetPlan.examples.map((item) => item.destination_relative_path),
    fonts: normalizedFonts,
    forbidden_treatments: normalizedBrandDonts,
    preferred_header_families: normalizedPreferredFamilies,
    default_canvas: resolvedCanvas
  };

  const approvedReferenceLines = [
    ...assetPlan.examples.map(
      (item, index) =>
        `Example ${index + 1}: ${path.basename(item.source_path)} -> ${item.destination_relative_path}`
    ),
    ...normalizedApprovedReferences
  ];
  const guidelinesMarkdown = buildBrandGuidelinesTemplate({
    brandName: draftProfile.brand_name,
    brandOverview: resolvedBrandOverview,
    audienceAndPromise: resolvedAudienceAndPromise,
    visualSystem: cleanString(resolvedVisualSystem) ?? cleanString(resolvedVisualStyle),
    logosAndSafeUsage: resolvedLogosAndSafeUsage,
    colorAndTypography:
      cleanString(resolvedColorAndTypography) ??
      buildColorTypographySummary(draftProfile.colors, draftProfile.fonts),
    toneOfVoice: resolvedToneOfVoice,
    brandDos: normalizedBrandDos,
    brandDonts: normalizedBrandDonts,
    emailHeaderRules: normalizedEmailHeaderRules,
    approvedReferences: approvedReferenceLines,
    openQuestions: [
      ...normalizedOpenQuestions,
      ...missingInfo.map((item) => `TBD: ${titleCase(item)}`)
    ]
  });

  const warnings = [];
  if (invalidColorKeys.length > 0) {
    warnings.push(
      `These color values are not hex colors and should be reviewed: ${invalidColorKeys.join(", ")}.`
    );
  }
  if (!resolvedBrandKitDir) {
    warnings.push(
      "No brand_kit_dir target is configured yet. Run orbit_bootstrap_home_workspace first, or provide a brand_kit_dir in the write step."
    );
  }
  if (normalizedBrandDos.length === 0) {
    warnings.push("No explicit brand dos were provided, so the draft keeps that section in TBD state.");
  }
  if (normalizedBrandDonts.length === 0) {
    warnings.push(
      "No explicit brand don'ts were provided, so the draft keeps that section in TBD state."
    );
  }

  const draft = {
    version: "1.0.0",
    type: "orbit_brand_kit_draft",
    id: `brand-kit-draft-${hashObject({
      brand: draftProfile.brand_name,
      logos: assetPlan.logos.map((item) => item.source_path),
      examples: assetPlan.examples.map((item) => item.source_path)
    }).slice(0, 12)}`,
    target: {
      brand_kit_dir: resolvedBrandKitDir ?? null
    },
    draft_profile_json: draftProfile,
    draft_guidelines_markdown: guidelinesMarkdown,
    asset_plan: assetPlan,
    missing_info: missingInfo,
    warnings
  };

  return {
    status: "ok",
    draft
  };
}

export function writeBrandKit({ config, draft, brandKitDir }) {
  const parsedDraft =
    typeof draft === "string" ? parseJsonInput(draft, "brand kit draft") : draft;

  if (parsedDraft?.type !== "orbit_brand_kit_draft") {
    throw new Error("The supplied draft is not an Orbit brand kit draft.");
  }

  const targetDir = normalizeOptionalPath(
    brandKitDir ?? parsedDraft.target?.brand_kit_dir ?? config?.brandKitDir
  );

  if (!targetDir) {
    return {
      status: "needs_inputs",
      missing_inputs: ["brand_kit_dir"],
      guidance: [
        "Provide a target brand_kit_dir or run orbit_bootstrap_home_workspace to create the default workspace."
      ]
    };
  }

  fs.mkdirSync(path.join(targetDir, "logos"), { recursive: true });
  fs.mkdirSync(path.join(targetDir, "examples"), { recursive: true });

  const copiedAssets = [];
  for (const group of ["logos", "examples"]) {
    for (const item of parsedDraft.asset_plan[group] ?? []) {
      const destinationPath = path.join(targetDir, item.destination_relative_path);
      fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
      if (path.resolve(item.source_path) !== path.resolve(destinationPath)) {
        fs.copyFileSync(item.source_path, destinationPath);
      }
      copiedAssets.push({
        role: item.role,
        source_path: item.source_path,
        destination_path: destinationPath
      });
    }
  }

  const brandProfilePath = writeJson(
    path.join(targetDir, "brand-profile.json"),
    parsedDraft.draft_profile_json
  );
  const brandGuidelinesPath = writeText(
    path.join(targetDir, "brand-guidelines.md"),
    `${parsedDraft.draft_guidelines_markdown.trim()}\n`
  );

  return {
    status: "ok",
    brand_kit_dir: targetDir,
    files: {
      brand_profile: brandProfilePath,
      brand_guidelines: brandGuidelinesPath
    },
    copied_assets: copiedAssets
  };
}

export function updateBrandGuidelines({
  guidelinesMarkdown,
  draft,
  brandKitDir,
  revisionRequest,
  brandOverview,
  audienceAndPromise,
  visualSystem,
  logosAndSafeUsage,
  colorAndTypography,
  toneOfVoice,
  brandDos = [],
  brandDonts = [],
  emailHeaderRules = [],
  approvedReferences = [],
  openQuestions = []
}) {
  const resolvedGuidelines = resolveGuidelinesInput({
    guidelinesMarkdown,
    draft,
    brandKitDir
  });

  const parsed = parseBrandGuidelinesMarkdown(resolvedGuidelines.markdown);
  const inferred = inferGuidelineUpdates(revisionRequest);
  const sections = { ...parsed.sections };
  const changedSections = new Set();

  const patchMap = {
    "Brand Overview": cleanString(brandOverview) ?? inferred.brandOverview,
    "Audience And Promise":
      cleanString(audienceAndPromise) ?? inferred.audienceAndPromise,
    "Visual System": cleanString(visualSystem) ?? inferred.visualSystem,
    "Logos And Safe Usage":
      cleanString(logosAndSafeUsage) ?? inferred.logosAndSafeUsage,
    "Color And Typography":
      cleanString(colorAndTypography) ?? inferred.colorAndTypography,
    "Tone Of Voice": cleanString(toneOfVoice) ?? inferred.toneOfVoice
  };

  for (const [sectionTitle, value] of Object.entries(patchMap)) {
    if (value) {
      sections[sectionTitle] = value;
      changedSections.add(sectionTitle);
    }
  }

  const nextBrandDos = normalizeStringArray(brandDos);
  const nextBrandDonts = normalizeStringArray(brandDonts);
  if (
    nextBrandDos.length > 0 ||
    nextBrandDonts.length > 0 ||
    inferred.brandDos.length > 0 ||
    inferred.brandDonts.length > 0
  ) {
    sections["Messaging Dos And Don’ts"] = buildDosDontsSection({
      brandDos: nextBrandDos.length > 0 ? nextBrandDos : inferred.brandDos,
      brandDonts: nextBrandDonts.length > 0 ? nextBrandDonts : inferred.brandDonts
    });
    changedSections.add("Messaging Dos And Don’ts");
  }

  const nextHeaderRules = normalizeStringArray(emailHeaderRules);
  if (nextHeaderRules.length > 0 || inferred.emailHeaderRules.length > 0) {
    sections["Email Header Rules"] = toBulletBlock(
      nextHeaderRules.length > 0 ? nextHeaderRules : inferred.emailHeaderRules,
      "TBD: add explicit email-header rules."
    );
    changedSections.add("Email Header Rules");
  }

  const nextApprovedReferences = normalizeStringArray(approvedReferences);
  if (nextApprovedReferences.length > 0 || inferred.approvedReferences.length > 0) {
    sections["Approved References"] = toBulletBlock(
      nextApprovedReferences.length > 0
        ? nextApprovedReferences
        : inferred.approvedReferences,
      "TBD: add approved reference assets or notes."
    );
    changedSections.add("Approved References");
  }

  const nextOpenQuestions = normalizeStringArray(openQuestions);
  if (nextOpenQuestions.length > 0 || inferred.openQuestions.length > 0) {
    sections["Open Questions / TBD"] = toBulletBlock(
      nextOpenQuestions.length > 0 ? nextOpenQuestions : inferred.openQuestions,
      "TBD: capture unresolved brand questions here."
    );
    changedSections.add("Open Questions / TBD");
  }

  if (revisionRequest && changedSections.size === 0) {
    const existingOpenQuestions = extractBulletItems(
      sections["Open Questions / TBD"] ?? ""
    );
    sections["Open Questions / TBD"] = toBulletBlock(
      [...existingOpenQuestions, `Revision requested: ${revisionRequest.trim()}`],
      "TBD: capture unresolved brand questions here."
    );
    changedSections.add("Open Questions / TBD");
  }

  const updatedMarkdown = serializeBrandGuidelinesMarkdown({
    title: parsed.title,
    sections
  });

  const result = {
    status: "ok",
    updated_guidelines_markdown: updatedMarkdown,
    changed_sections: [...changedSections]
  };

  if (draft) {
    const parsedDraft =
      typeof draft === "string" ? parseJsonInput(draft, "brand kit draft") : draft;
    if (parsedDraft?.type === "orbit_brand_kit_draft") {
      result.updated_draft = {
        ...parsedDraft,
        draft_guidelines_markdown: updatedMarkdown
      };
    }
  }

  return result;
}

export function loadBrandGuidelines(brandKitDir) {
  const resolvedDir = normalizeOptionalPath(brandKitDir);
  if (!resolvedDir) {
    return null;
  }

  const guidelinesPath = path.join(resolvedDir, "brand-guidelines.md");
  if (!fileExists(guidelinesPath)) {
    return null;
  }

  const raw = fs.readFileSync(guidelinesPath, "utf8");
  return {
    guidelinesPath,
    raw,
    ...parseBrandGuidelinesMarkdown(raw)
  };
}

export function parseBrandGuidelinesMarkdown(markdown) {
  const raw = String(markdown ?? "").trim();
  const lines = raw.split("\n");
  const title =
    lines.find((line) => line.startsWith("# "))?.replace(/^#\s+/, "").trim() ??
    "Brand Guidelines";
  const sections = Object.fromEntries(BRAND_GUIDELINE_SECTIONS.map((title) => [title, ""]));

  let currentSection = null;
  for (const line of lines.slice(1)) {
    if (line.startsWith("## ")) {
      currentSection = line.replace(/^##\s+/, "").trim();
      if (!Object.prototype.hasOwnProperty.call(sections, currentSection)) {
        sections[currentSection] = "";
      }
      continue;
    }

    if (!currentSection) {
      continue;
    }

    sections[currentSection] = [sections[currentSection], line]
      .filter(Boolean)
      .join("\n")
      .trimEnd();
  }

  return {
    title,
    sections: Object.fromEntries(
      Object.entries(sections).map(([key, value]) => [key, String(value).trim()])
    )
  };
}

export function buildBrandGuidelinesTemplate({
  brandName,
  brandOverview,
  audienceAndPromise,
  visualSystem,
  logosAndSafeUsage,
  colorAndTypography,
  toneOfVoice,
  brandDos = [],
  brandDonts = [],
  emailHeaderRules = [],
  approvedReferences = [],
  openQuestions = []
}) {
  const sections = {
    "Brand Overview":
      cleanString(brandOverview) ??
      "TBD: describe the brand in one or two plain-language sentences.",
    "Audience And Promise":
      cleanString(audienceAndPromise) ??
      "TBD: describe who the brand serves and the promise it should communicate.",
    "Visual System":
      cleanString(visualSystem) ??
      "TBD: describe the overall visual direction, texture, imagery, spacing, and composition cues.",
    "Logos And Safe Usage":
      cleanString(logosAndSafeUsage) ??
      [
        `Use the official ${brandName ?? "brand"} logo assets from the local brand kit.`,
        "Do not redraw, distort, crop, recolor, or stylize the official logo.",
        "Keep logo placement inside deterministic safe zones."
      ]
        .map((line) => `- ${line}`)
        .join("\n"),
    "Color And Typography":
      cleanString(colorAndTypography) ??
      "TBD: document brand colors, typography preferences, and any type restrictions.",
    "Tone Of Voice":
      cleanString(toneOfVoice) ??
      "TBD: describe the tone of voice Orbit should reflect in creative and messaging choices.",
    "Messaging Dos And Don’ts": buildDosDontsSection({
      brandDos,
      brandDonts
    }),
    "Email Header Rules": toBulletBlock(
      emailHeaderRules,
      "TBD: add explicit email-header rules, such as text-in-image guidance, visual density, and brand-safe treatments."
    ),
    "Approved References": toBulletBlock(
      approvedReferences,
      "TBD: add the approved examples, campaign references, or visual systems Orbit should reference."
    ),
    "Open Questions / TBD": toBulletBlock(
      openQuestions,
      "TBD: capture unresolved brand questions or placeholders here."
    )
  };

  return serializeBrandGuidelinesMarkdown({
    title: `${brandName ?? "Brand"} Guidelines`,
    sections
  });
}

export function extractBrandGuidelineContext(guidelines) {
  if (!guidelines) {
    return {
      toneOfVoice: null,
      visualRestrictions: [],
      emailHeaderRules: [],
      messagingGuidance: null,
      approvedReferences: [],
      flags: {
        avoidTextInImage: false,
        avoidGradients: false
      }
    };
  }

  const sections = guidelines.sections;
  const combinedRestrictions = [
    ...extractRestrictionLines(sections["Visual System"]),
    ...extractRestrictionLines(sections["Logos And Safe Usage"]),
    ...extractRestrictionLines(sections["Messaging Dos And Don’ts"]),
    ...extractRestrictionLines(sections["Email Header Rules"])
  ];

  const normalizedRestrictions = [...new Set(combinedRestrictions)];
  const toneOfVoice = summarizeText(sections["Tone Of Voice"], 220);
  const messagingGuidance = summarizeText(
    sections["Messaging Dos And Don’ts"],
    260
  );
  const emailHeaderRules = extractBulletItems(sections["Email Header Rules"]);
  const approvedReferences = extractBulletItems(sections["Approved References"]);
  const allGuidelineText = Object.values(sections).join("\n").toLowerCase();

  return {
    toneOfVoice,
    visualRestrictions: normalizedRestrictions,
    emailHeaderRules,
    messagingGuidance,
    approvedReferences,
    flags: {
      avoidTextInImage:
        /avoid text in image|no text in image|do not use text in image/i.test(
          allGuidelineText
        ),
      avoidGradients: /avoid gradients|no gradients|do not use gradients/i.test(
        allGuidelineText
      )
    }
  };
}

function mergeBrandKitIntakeState({ current, incoming = {}, defaultBrandKitDir }) {
  const parsedCurrent =
    typeof current === "string" ? parseJsonInput(current, "brand intake state") : current;
  const state = parsedCurrent && typeof parsedCurrent === "object" ? parsedCurrent : {};

  // Reject any brandKitDir that isn't a real local path (e.g. Claude sandbox paths
  // like /home/claude/... that the model may fabricate). Fall back to the default.
  const rawBrandKitDir = normalizeOptionalPath(
    incoming.brandKitDir ?? state.brandKitDir ?? defaultBrandKitDir
  );
  const resolvedBrandKitDir =
    rawBrandKitDir && isLocalPath(rawBrandKitDir)
      ? rawBrandKitDir
      : normalizeOptionalPath(defaultBrandKitDir) ?? null;

  return {
    brandKitDir: resolvedBrandKitDir,
    _rejected_brand_kit_dir:
      rawBrandKitDir && !isLocalPath(rawBrandKitDir) ? rawBrandKitDir : undefined,
    brandName: cleanString(incoming.brandName) ?? cleanString(state.brandName),
    companyName: cleanString(incoming.companyName) ?? cleanString(state.companyName),
    logoPaths: dedupeResolvedPaths(
      mergeArrays(state.logoPaths, incoming.logoPaths).map((item) =>
        normalizeOptionalPath(item)
      )
    ),
    brandExamplePaths: dedupeResolvedPaths(
      mergeArrays(state.brandExamplePaths, incoming.brandExamplePaths).map((item) =>
        normalizeOptionalPath(item)
      )
    ),
    alternateLogoPath: normalizeOptionalPath(
      incoming.alternateLogoPath ?? state.alternateLogoPath
    ),
    colors: {
      ...normalizeColorMap(state.colors),
      ...normalizeColorMap(incoming.colors)
    },
    fonts: dedupeStrings(mergeArrays(state.fonts, incoming.fonts)),
    brandOverview: cleanString(incoming.brandOverview) ?? cleanString(state.brandOverview),
    audienceAndPromise:
      cleanString(incoming.audienceAndPromise) ?? cleanString(state.audienceAndPromise),
    visualSystem: cleanString(incoming.visualSystem) ?? cleanString(state.visualSystem),
    logosAndSafeUsage:
      cleanString(incoming.logosAndSafeUsage) ?? cleanString(state.logosAndSafeUsage),
    colorAndTypography:
      cleanString(incoming.colorAndTypography) ??
      cleanString(state.colorAndTypography),
    toneOfVoice: cleanString(incoming.toneOfVoice) ?? cleanString(state.toneOfVoice),
    brandDos: dedupeStrings(mergeArrays(state.brandDos, incoming.brandDos)),
    brandDonts: dedupeStrings(mergeArrays(state.brandDonts, incoming.brandDonts)),
    emailHeaderRules: dedupeStrings(
      mergeArrays(state.emailHeaderRules, incoming.emailHeaderRules)
    ),
    approvedReferences: dedupeStrings(
      mergeArrays(state.approvedReferences, incoming.approvedReferences)
    ),
    openQuestions: dedupeStrings(mergeArrays(state.openQuestions, incoming.openQuestions)),
    preferredHeaderFamilies: dedupeStrings(
      mergeArrays(state.preferredHeaderFamilies, incoming.preferredHeaderFamilies)
    ),
    defaultCanvas:
      normalizeCanvas(incoming.defaultCanvas) ?? normalizeCanvas(state.defaultCanvas),
    visualStyle: cleanString(incoming.visualStyle) ?? cleanString(state.visualStyle)
  };
}

function evaluateBrandGuidelinesIntake(state) {
  const validLogoPaths = state.logoPaths.filter((filePath) => fileExists(filePath));
  const invalidLogoPaths = state.logoPaths.filter((filePath) => !fileExists(filePath));
  const validBrandExamplePaths = state.brandExamplePaths.filter((filePath) =>
    fileExists(filePath)
  );
  const invalidBrandExamplePaths = state.brandExamplePaths.filter(
    (filePath) => !fileExists(filePath)
  );
  const hasBrandConsiderationsIdentity =
    Boolean(state.visualSystem) ||
    Boolean(state.visualStyle) ||
    Boolean(state.colorAndTypography) ||
    Object.keys(state.colors).length > 0 ||
    state.fonts.length > 0;
  const hasBrandConsiderationsConstraints =
    Boolean(state.logosAndSafeUsage) ||
    state.brandDos.length > 0 ||
    state.brandDonts.length > 0 ||
    state.emailHeaderRules.length > 0;

  const steps = BRAND_GUIDELINES_INTAKE_STEPS.map((step) => {
    if (step.id === "brand-foundation") {
      const missingFields = [];
      if (!state.brandOverview) {
        missingFields.push("brand_overview");
      }
      if (!state.audienceAndPromise) {
        missingFields.push("audience_and_promise");
      }
      if (!state.toneOfVoice) {
        missingFields.push("tone_of_voice");
      }

      return {
        ...step,
        complete: missingFields.length === 0,
        missing_fields: missingFields
      };
    }

    if (step.id === "brand-considerations") {
      const missingFields = [];
      if (!hasBrandConsiderationsIdentity) {
        missingFields.push("visual_system_or_color_and_typography");
      }
      if (!hasBrandConsiderationsConstraints) {
        missingFields.push("brand_dos_donts_or_email_header_rules");
      }

      return {
        ...step,
        complete: missingFields.length === 0,
        missing_fields: missingFields
      };
    }

    if (step.id === "logo-assets") {
      const missingFields = [];
      if (validLogoPaths.length === 0) {
        missingFields.push("logo_paths (minimum 1)");
      }
      for (const filePath of invalidLogoPaths) {
        missingFields.push(`logo:${filePath}`);
      }

      return {
        ...step,
        complete: missingFields.length === 0,
        missing_fields: missingFields
      };
    }

    const missingFields = [];
    if (validBrandExamplePaths.length < 2) {
      missingFields.push("brand_example_paths (minimum 2)");
    }
    for (const filePath of invalidBrandExamplePaths) {
      missingFields.push(`brand_example:${filePath}`);
    }

    return {
      ...step,
      complete: missingFields.length === 0,
      missing_fields: missingFields
    };
  });

  return {
    state,
    steps,
    isComplete: steps.every((step) => step.complete),
    currentStep: steps.find((step) => !step.complete) ?? null,
    validLogoPaths,
    invalidLogoPaths,
    validBrandExamplePaths,
    invalidBrandExamplePaths
  };
}

function getBrandFieldValue(state, questionId) {
  const map = {
    brand_overview: state.brandOverview,
    audience_and_promise: state.audienceAndPromise,
    tone_of_voice: state.toneOfVoice,
    visual_system: state.visualSystem,
    color_and_typography: state.colorAndTypography,
    brand_dos: state.brandDos?.length > 0 ? state.brandDos.join(", ") : null,
    email_header_rules: state.emailHeaderRules?.length > 0 ? state.emailHeaderRules.join(", ") : null,
    logo_paths: state.logoPaths?.length > 0 ? state.logoPaths.join(", ") : null,
    alternate_logo_path: state.alternateLogoPath,
    logos_and_safe_usage: state.logosAndSafeUsage,
    brand_example_paths: state.brandExamplePaths?.length > 0 ? state.brandExamplePaths.join(", ") : null,
    approved_references: state.approvedReferences?.length > 0 ? state.approvedReferences.join(", ") : null,
    preferred_header_families: state.preferredHeaderFamilies?.length > 0 ? state.preferredHeaderFamilies.join(", ") : null
  };
  const val = map[questionId];
  return (val !== null && val !== undefined && String(val).trim()) ? String(val).trim() : null;
}

function buildBrandGuidelinesIntakeResponse(evaluation) {
  const { state, steps, currentStep, invalidLogoPaths, invalidBrandExamplePaths } =
    evaluation;
  const brandLabel = state.brandName ?? state.companyName ?? "this brand";
  const completedSteps = steps.filter((step) => step.complete).map((step) => step.id);
  const remainingSteps = steps.filter((step) => !step.complete).map((step) => step.id);
  const stepNumber = completedSteps.length + 1;
  const totalSteps = steps.length;

  // Split current step questions into pre-filled and still-needed
  const prefilledQuestions = currentStep
    ? currentStep.questions.filter((q) => getBrandFieldValue(state, q.id) !== null)
    : [];
  const pendingQuestions = currentStep
    ? currentStep.questions.filter((q) => getBrandFieldValue(state, q.id) === null)
    : [];

  const questionPrompt = currentStep
    ? [
        `**Brand Kit — Step ${stepNumber} of ${totalSteps}: ${currentStep.title}**`,
        "",
        prefilledQuestions.length > 0
          ? [
              `I've pre-filled the following from context — please confirm or correct:`,
              "",
              ...prefilledQuestions.map(
                (q) => `- **${q.label}**: ${getBrandFieldValue(state, q.id)}`
              ),
              ""
            ].join("\n")
          : null,
        pendingQuestions.length > 0
          ? [
              pendingQuestions.length === 1 && prefilledQuestions.length > 0
                ? `Just one more question for this step:`
                : `Please answer ${pendingQuestions.length === 1 ? "this question" : "these questions"} before Orbit drafts anything:`,
              "",
              ...pendingQuestions.map((q, index) => `${index + 1}. ${q.prompt}`),
              ""
            ].join("\n")
          : null,
        currentStep?.id === "brand-examples"
          ? "Use local file paths for any brand example assets."
          : null
      ].filter(Boolean).join("\n")
    : null;

  return {
    status: "needs_inputs",
    workflow: "step_by_step_brand_guidelines_intake",
    brand_name: state.brandName ?? state.companyName ?? null,
    assistant_instruction:
      "Show the question_prompt text to the user exactly as written. Do not infer or answer any pending questions. Wait for the user's reply, then call orbit_start_brand_guidelines_intake again with their answers and intake_state_json passed through unchanged.",
    current_step: currentStep
      ? {
          id: currentStep.id,
          step_label: `Step ${stepNumber} of ${totalSteps}`,
          title: currentStep.title,
          missing_fields: currentStep.missing_fields,
          prefilled_fields: prefilledQuestions.map((q) => q.id),
          pending_fields: pendingQuestions.map((q) => q.id)
        }
      : null,
    missing_inputs: currentStep?.missing_fields ?? [],
    invalid_asset_paths: {
      logo_paths: invalidLogoPaths,
      brand_example_paths: invalidBrandExamplePaths
    },
    ...(state._rejected_brand_kit_dir
      ? {
          path_warning: `The brand_kit_dir "${state._rejected_brand_kit_dir}" was rejected as a non-local path. Using the configured local path instead: "${state.brandKitDir}". Do not pass non-local paths.`
        }
      : {}),
    question_prompt: questionPrompt,
    intake_state_json: JSON.stringify(serializeBrandKitIntakeState(state)),
    next_action:
      `Show Step ${stepNumber} of ${totalSteps} to the user. Wait for their answers. Then call orbit_start_brand_guidelines_intake again with those answers and intake_state_json.`
  };
}

function serializeBrandKitIntakeState(state) {
  return {
    brandKitDir: state.brandKitDir ?? null,
    brandName: state.brandName ?? null,
    companyName: state.companyName ?? null,
    logoPaths: state.logoPaths,
    brandExamplePaths: state.brandExamplePaths,
    alternateLogoPath: state.alternateLogoPath ?? null,
    colors: state.colors,
    fonts: state.fonts,
    brandOverview: state.brandOverview ?? null,
    audienceAndPromise: state.audienceAndPromise ?? null,
    visualSystem: state.visualSystem ?? null,
    logosAndSafeUsage: state.logosAndSafeUsage ?? null,
    colorAndTypography: state.colorAndTypography ?? null,
    toneOfVoice: state.toneOfVoice ?? null,
    brandDos: state.brandDos,
    brandDonts: state.brandDonts,
    emailHeaderRules: state.emailHeaderRules,
    approvedReferences: state.approvedReferences,
    openQuestions: state.openQuestions,
    preferredHeaderFamilies: state.preferredHeaderFamilies,
    defaultCanvas: state.defaultCanvas ?? null,
    visualStyle: state.visualStyle ?? null
  };
}

function buildAssetPlan({ logoPaths, alternateLogoPath, brandExamplePaths }) {
  const logos = [];
  const primaryLogoPath = logoPaths[0];
  const alternatePath = alternateLogoPath ?? logoPaths[1] ?? null;

  if (primaryLogoPath) {
    logos.push(
      makeAssetPlanItem({
        role: "primary",
        sourcePath: primaryLogoPath,
        destinationDir: "logos",
        destinationBaseName: "primary-logo"
      })
    );
  }
  if (alternatePath) {
    logos.push(
      makeAssetPlanItem({
        role: "alternate",
        sourcePath: alternatePath,
        destinationDir: "logos",
        destinationBaseName: "alternate-logo"
      })
    );
  }

  const examples = brandExamplePaths.map((sourcePath, index) =>
    makeAssetPlanItem({
      role: `example_${index + 1}`,
      sourcePath,
      destinationDir: "examples",
      destinationBaseName: `example-${index + 1}`
    })
  );

  return {
    logos,
    examples
  };
}

function makeAssetPlanItem({
  role,
  sourcePath,
  destinationDir,
  destinationBaseName
}) {
  const extension = path.extname(sourcePath).toLowerCase() || ".bin";
  const destinationRelativePath = path.join(
    destinationDir,
    `${slugify(destinationBaseName) || "asset"}${extension}`
  );

  return {
    role,
    source_path: sourcePath,
    destination_relative_path: destinationRelativePath,
    mime_type: inferMimeType(sourcePath)
  };
}

function resolveGuidelinesInput({ guidelinesMarkdown, draft, brandKitDir }) {
  if (cleanString(guidelinesMarkdown)) {
    return { markdown: String(guidelinesMarkdown).trim() };
  }

  if (draft) {
    const parsedDraft =
      typeof draft === "string" ? parseJsonInput(draft, "brand kit draft") : draft;
    if (parsedDraft?.draft_guidelines_markdown) {
      return { markdown: parsedDraft.draft_guidelines_markdown };
    }
  }

  const guidelines = loadBrandGuidelines(brandKitDir);
  if (guidelines) {
    return { markdown: guidelines.raw };
  }

  throw new Error(
    "Provide guidelines_markdown, a draft payload, or a brand_kit_dir with brand-guidelines.md."
  );
}

function inferGuidelineUpdates(revisionRequest) {
  const request = String(revisionRequest ?? "");
  if (!request.trim()) {
    return {
      brandDos: [],
      brandDonts: [],
      emailHeaderRules: [],
      approvedReferences: [],
      openQuestions: []
    };
  }

  const inferred = {
    brandDos: [],
    brandDonts: [],
    emailHeaderRules: [],
    approvedReferences: [],
    openQuestions: []
  };

  const sectionPatterns = [
    ["brandOverview", /brand overview\s*[:\-]\s*(.+)$/im],
    ["audienceAndPromise", /audience(?: and promise)?\s*[:\-]\s*(.+)$/im],
    ["visualSystem", /visual system\s*[:\-]\s*(.+)$/im],
    ["logosAndSafeUsage", /logos?(?: and safe usage)?\s*[:\-]\s*(.+)$/im],
    ["colorAndTypography", /color(?: and typography)?\s*[:\-]\s*(.+)$/im],
    ["toneOfVoice", /tone(?: of voice)?\s*[:\-]\s*(.+)$/im]
  ];

  for (const [key, pattern] of sectionPatterns) {
    const match = request.match(pattern);
    if (match) {
      inferred[key] = match[1].trim();
    }
  }

  inferred.brandDos.push(
    ...[...request.matchAll(/\bdo\s*[:\-]\s*(.+)$/gim)].map((match) => match[1].trim())
  );
  inferred.brandDonts.push(
    ...[...request.matchAll(/\b(?:don't|do not|avoid)\s*[:\-]\s*(.+)$/gim)].map(
      (match) => match[1].trim()
    )
  );
  inferred.emailHeaderRules.push(
    ...[...request.matchAll(/email header rules?\s*[:\-]\s*(.+)$/gim)].map((match) =>
      match[1].trim()
    )
  );
  inferred.approvedReferences.push(
    ...[...request.matchAll(/approved references?\s*[:\-]\s*(.+)$/gim)].map(
      (match) => match[1].trim()
    )
  );
  inferred.openQuestions.push(
    ...[...request.matchAll(/open questions?\s*[:\-]\s*(.+)$/gim)].map((match) =>
      match[1].trim()
    )
  );

  if (/avoid text in image|no text in image|do not use text in image/i.test(request)) {
    inferred.emailHeaderRules.push("Avoid text in image unless a campaign explicitly requires it.");
  }
  if (/avoid gradients|no gradients|do not use gradients/i.test(request)) {
    inferred.brandDonts.push("Do not use gradients in branded header art.");
    inferred.visualSystem = inferred.visualSystem
      ? `${inferred.visualSystem}\n- Avoid gradients in branded header art.`
      : "- Avoid gradients in branded header art.";
  }

  return inferred;
}

function serializeBrandGuidelinesMarkdown({ title, sections }) {
  const lines = [`# ${title || "Brand Guidelines"}`];

  for (const sectionTitle of BRAND_GUIDELINE_SECTIONS) {
    lines.push("", `## ${sectionTitle}`, "");
    lines.push(sections[sectionTitle] || defaultSectionContent(sectionTitle));
  }

  return `${lines.join("\n").trim()}\n`;
}

function defaultSectionContent(sectionTitle) {
  switch (sectionTitle) {
    case "Approved References":
      return "TBD: add approved reference assets or notes.";
    case "Open Questions / TBD":
      return "TBD: capture unresolved brand questions here.";
    default:
      return `TBD: add guidance for ${sectionTitle.toLowerCase()}.`;
  }
}

function buildDosDontsSection({ brandDos, brandDonts }) {
  const doLines = brandDos.length > 0 ? brandDos : ["TBD: add messaging dos."];
  const dontLines =
    brandDonts.length > 0 ? brandDonts : ["TBD: add messaging don'ts."];

  return [
    "### Do",
    "",
    ...doLines.map((line) => `- ${line}`),
    "",
    "### Avoid",
    "",
    ...dontLines.map((line) => `- ${line}`)
  ].join("\n");
}

function extractRestrictionLines(text) {
  const lines = extractBulletItems(text);
  const directMatches = lines.filter((line) =>
    /\b(do not|don't|avoid|never|no )\b/i.test(line)
  );
  if (directMatches.length > 0) {
    return directMatches;
  }

  return String(text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /\b(do not|don't|avoid|never|no )\b/i.test(line));
}

function extractBulletItems(text) {
  return String(text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean);
}

function summarizeText(text, maxLength) {
  const normalized = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return null;
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function buildColorTypographySummary(colors, fonts) {
  const colorSummary = Object.entries(colors ?? {})
    .filter(([, value]) => cleanString(value))
    .map(([key, value]) => `${titleCase(key)}: ${value}`)
    .join(", ");
  const fontSummary = normalizeStringArray(fonts).join(", ");

  if (!colorSummary && !fontSummary) {
    return null;
  }

  return [
    colorSummary ? `Colors: ${colorSummary}.` : null,
    fontSummary ? `Fonts: ${fontSummary}.` : null
  ]
    .filter(Boolean)
    .join(" ");
}

function normalizeColorMap(colors) {
  if (!colors || typeof colors !== "object" || Array.isArray(colors)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(colors)
      .map(([key, value]) => [String(key), cleanString(value)])
      .filter(([, value]) => Boolean(value))
      .map(([key, value]) => [key, value])
  );
}

function normalizeCanvas(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const width = Number(value.width);
  const height = Number(value.height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }

  return {
    width: Math.round(width),
    height: Math.round(height)
  };
}

function toBulletBlock(items, fallback) {
  const normalized = normalizeStringArray(items);
  if (normalized.length === 0) {
    return fallback;
  }
  return normalized.map((item) => `- ${item}`).join("\n");
}

function cleanString(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => cleanString(item))
    .filter(Boolean);
}

function mergeArrays(left, right) {
  return [...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])];
}

function dedupeStrings(items) {
  return [...new Set(normalizeStringArray(items))];
}

function normalizeOptionalPath(value) {
  const cleaned = cleanString(value);
  return cleaned ? path.resolve(cleaned) : null;
}

function dedupeResolvedPaths(paths) {
  return [...new Set((paths ?? []).map((item) => normalizeOptionalPath(item)).filter(Boolean))];
}

function fileExists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}
