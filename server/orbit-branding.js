import fs from "node:fs";
import path from "node:path";
import { escapeXml, fileExists, readFileAsDataUri } from "./utils.js";

const BRANDING_DIRNAME = "_orbit-branding";
const FONT_DIRNAME = "fonts";
const ORBIT_ATTRIBUTION = "Built in Orbit";
const ORBIT_TAGLINE = "Lifecycle Marketing Operating System for Claude";
const ORBIT_URL = "https://yourorbit.team";
const ORBIT_LOGO_URL = "https://yourorbit.team/images/orbit-icon.png";
const ORBIT_LOGO_DARK_URL = "https://yourorbit.team/images/orbit-icon-dark.png";
const ORBIT_LOGO_WHITE_URL = "https://yourorbit.team/images/orbit-icon-white.png";
const ORBIT_ACCENT = "#6366F1";

// Orbit theme colours (Black, White, Indigo)
export const ORBIT_THEME = {
  accent: ORBIT_ACCENT,
  bg: { light: "#FFFFFF", dark: "#0A0A0B" },
  text: { primary: { light: "rgba(0,0,0,0.90)", dark: "rgba(255,255,255,0.93)" }, secondary: { light: "rgba(0,0,0,0.55)", dark: "rgba(255,255,255,0.60)" } },
  border: { light: "rgba(0,0,0,0.10)", dark: "rgba(255,255,255,0.10)" },
  url: ORBIT_URL,
  logo: { default: ORBIT_LOGO_URL, dark: ORBIT_LOGO_DARK_URL, white: ORBIT_LOGO_WHITE_URL },
};

const BRANDING_ASSETS = {
  light: {
    source: "icon-light.png",
    filename: "orbit-logo-light.png"
  },
  dark: {
    source: "icon-dark.png",
    filename: "orbit-logo-dark.png"
  }
};

const FONT_ASSETS = {
  ui: {
    family: "Sora",
    source: path.join("assets", "fonts", "Sora", "Sora-Variable.ttf"),
    filename: "Sora-Variable.ttf",
    format: "truetype",
    weight: "300 600"
  },
  display: {
    family: "Oxanium",
    source: path.join("assets", "fonts", "Oxanium", "Oxanium-Variable.ttf"),
    filename: "Oxanium-Variable.ttf",
    format: "truetype",
    weight: "400 600"
  },
  mono: {
    family: "Geist Mono",
    source: path.join("assets", "fonts", "GeistMono", "GeistMono-Regular.ttf"),
    filename: "GeistMono-Regular.ttf",
    format: "truetype",
    weight: "400"
  }
};

const ORBIT_FONT_STACKS = {
  ui: "'Sora', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  display:
    "'Oxanium', 'Sora', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  mono:
    "'Geist Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace"
};

export function ensureOrbitBrandingAssets({ rootDir, outputDir }) {
  if (!rootDir || !outputDir) {
    return null;
  }

  const brandingDir = path.join(outputDir, BRANDING_DIRNAME);
  const fontDir = path.join(brandingDir, FONT_DIRNAME);
  fs.mkdirSync(brandingDir, { recursive: true });
  fs.mkdirSync(fontDir, { recursive: true });

  const assets = Object.fromEntries(
    Object.entries(BRANDING_ASSETS).map(([theme, asset]) => {
      const sourcePath = path.join(rootDir, asset.source);
      const targetPath = path.join(brandingDir, asset.filename);
      if (fileExists(sourcePath) && !fileExists(targetPath)) {
        fs.copyFileSync(sourcePath, targetPath);
      }

      return [
        theme,
        {
          absolute: targetPath,
          relative: `${BRANDING_DIRNAME}/${asset.filename}`
        }
      ];
    })
  );

  const fonts = Object.fromEntries(
    Object.entries(FONT_ASSETS).map(([key, asset]) => {
      const sourcePath = path.join(rootDir, asset.source);
      const targetPath = path.join(fontDir, asset.filename);
      if (fileExists(sourcePath) && !fileExists(targetPath)) {
        fs.copyFileSync(sourcePath, targetPath);
      }

      return [
        key,
        fileExists(sourcePath)
          ? {
              absolute: targetPath,
              relative: `${BRANDING_DIRNAME}/${FONT_DIRNAME}/${asset.filename}`,
              family: asset.family,
              format: asset.format,
              weight: asset.weight
            }
          : null
      ];
    })
  );

  return {
    dir: brandingDir,
    assets,
    fonts,
    attribution: ORBIT_ATTRIBUTION,
    tagline: ORBIT_TAGLINE,
    font_stacks: getOrbitFontStacks()
  };
}

export function getOrbitLogoDataUri({ rootDir, theme = "light" }) {
  if (!rootDir) {
    return null;
  }

  const asset = BRANDING_ASSETS[normalizeTheme(theme)];
  const logoPath = path.join(rootDir, asset.source);
  return fileExists(logoPath) ? readFileAsDataUri(logoPath) : null;
}

export function getOrbitLogoPath({ rootDir, theme = "light" }) {
  if (!rootDir) {
    return null;
  }

  const asset = BRANDING_ASSETS[normalizeTheme(theme)];
  const logoPath = path.join(rootDir, asset.source);
  return fileExists(logoPath) ? logoPath : null;
}

export function getOrbitFontStacks() {
  return { ...ORBIT_FONT_STACKS };
}

export function buildOrbitFontFaceCss({
  rootDir,
  branding = null,
  embed = false
}) {
  const rules = [];

  for (const [key, asset] of Object.entries(FONT_ASSETS)) {
    const src = buildFontSrc({
      rootDir,
      asset,
      brandingEntry: branding?.fonts?.[key] ?? null,
      embed
    });
    if (!src) {
      continue;
    }

    rules.push([
      "@font-face {",
      `  font-family: '${asset.family}';`,
      `  src: ${src};`,
      `  font-style: normal;`,
      `  font-weight: ${asset.weight};`,
      "  font-display: swap;",
      "}"
    ].join("\n"));
  }

  return rules.join("\n\n");
}

export function buildOrbitSvgTypographyStyles({ rootDir }) {
  const fontFaceCss = buildOrbitFontFaceCss({
    rootDir,
    embed: true
  });
  const stacks = getOrbitFontStacks();

  return [
    "<style>",
    fontFaceCss,
    `text { font-family: ${stacks.ui}; }`,
    `.orbit-ui { font-family: ${stacks.ui}; }`,
    `.orbit-display { font-family: ${stacks.display}; }`,
    `.orbit-mono { font-family: ${stacks.mono}; }`,
    ".orbit-strong { font-weight: 600; }",
    ".orbit-bold { font-weight: 700; }",
    "</style>"
  ]
    .filter(Boolean)
    .join("\n");
}

export function registerOrbitPdfFonts({ doc, rootDir }) {
  const families = {
    ui: "Helvetica",
    display: "Helvetica-Bold",
    mono: "Courier"
  };

  if (!doc || !rootDir) {
    return families;
  }

  for (const [key, asset] of Object.entries(FONT_ASSETS)) {
    const sourcePath = path.join(rootDir, asset.source);
    if (!fileExists(sourcePath)) {
      continue;
    }

    const alias =
      key === "ui" ? "OrbitUIFont" : key === "display" ? "OrbitDisplayFont" : "OrbitMonoFont";
    doc.registerFont(alias, sourcePath);
    families[key] = alias;
  }

  return families;
}

export function buildOrbitMarkdownHeader({
  title,
  subtitle,
  logoPath,
  contextLines = []
}) {
  const logo = logoPath || ORBIT_LOGO_DARK_URL;
  return [
    `[![Orbit](${logo})](${ORBIT_URL})`,
    "",
    `_${ORBIT_ATTRIBUTION}_ · [${ORBIT_URL}](${ORBIT_URL})`,
    subtitle ? `_${subtitle}_` : null,
    ...(contextLines.length > 0 ? ["", ...contextLines] : []),
    "",
    `# ${title}`,
    ""
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildOrbitMarkdownFooter() {
  return [
    "",
    "---",
    "",
    `_Generated by [Orbit](${ORBIT_URL}). Internal artifacts are branded for visibility; production customer-facing email output remains unbranded by default._`
  ].join("\n");
}

export function renderOrbitSvgBrandBadge({
  rootDir,
  theme = "light",
  x,
  y,
  width = 168,
  height = 42,
  label = ORBIT_ATTRIBUTION
}) {
  const logoUri = getOrbitLogoDataUri({ rootDir, theme });
  const fontStacks = getOrbitFontStacks();
  const fill = theme === "dark" ? "#0A0A0B" : "#ffffff";
  const stroke = theme === "dark" ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
  const text = theme === "dark" ? "#f5f5f5" : "#171717";
  const accent = ORBIT_ACCENT;
  const logoSize = 22;
  const logoX = x + 14;
  const logoY = y + (height - logoSize) / 2;
  const textX = x + 46;
  const textY = y + 18;
  const subtextY = y + 30;

  return [
    `<g class="orbit-brand-badge">`,
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="16" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>`,
    logoUri
      ? `<image href="${logoUri}" x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>`
      : "",
    `<text x="${textX}" y="${textY}" font-size="12.5" font-weight="700" font-family="${escapeXml(
      fontStacks.display
    )}" fill="${accent}">${escapeXml(label)}</text>`,
    `<text x="${textX}" y="${subtextY}" font-size="10.5" font-family="${escapeXml(
      fontStacks.ui
    )}" fill="${text}" opacity="0.72">${escapeXml(
      ORBIT_TAGLINE
    )}</text>`,
    `</g>`
  ].join("");
}

export function getOrbitBrandingMeta() {
  return {
    attribution: ORBIT_ATTRIBUTION,
    tagline: ORBIT_TAGLINE,
    url: ORBIT_URL,
    logo: ORBIT_LOGO_URL,
    accent: ORBIT_ACCENT
  };
}

function normalizeTheme(theme) {
  return theme === "dark" ? "dark" : "light";
}

function buildFontSrc({ rootDir, asset, brandingEntry, embed }) {
  if (brandingEntry?.relative) {
    return `url('${brandingEntry.relative}') format('${asset.format}')`;
  }

  if (!embed || !rootDir) {
    return null;
  }

  const sourcePath = path.join(rootDir, asset.source);
  if (!fileExists(sourcePath)) {
    return null;
  }

  return `url('${readFileAsDataUri(sourcePath)}') format('${asset.format}')`;
}
