// Produce desktop / mobile / dark-mode preview HTML artifacts from
// raw email HTML. Unlike orbit_preview_email_template (which takes
// an Orbit template spec), this one accepts arbitrary HTML and wraps
// each variant in a viewport-matched frame with the right CSS so
// Claude Desktop can render it as an inline artifact.
//
// Not a rasteriser — no PNG generation, no headless browser
// dependency. The HTML artifacts are "the preview", rendered by
// whatever viewer opens them.

import fs from "node:fs";
import path from "node:path";
import { ensureDir, cleanString } from "./config.js";
import { slugify } from "./utils.js";

const DESKTOP_WIDTH = 680;
const MOBILE_WIDTH = 375;

export function renderEmailPreview({ html, label, outputDir }) {
  if (!html || typeof html !== "string" || html.trim().length === 0) {
    return {
      status: "needs_inputs",
      missing: ["html"],
      message: "Provide the email HTML to preview.",
    };
  }

  const slug = slugify(cleanString(label) ?? `email-preview-${Date.now()}`);

  const desktopHtml = wrapInFrame(html, {
    title: "Desktop preview",
    viewportWidth: DESKTOP_WIDTH,
    dark: false,
  });
  const mobileHtml = wrapInFrame(html, {
    title: "Mobile preview",
    viewportWidth: MOBILE_WIDTH,
    dark: false,
  });
  const darkHtml = wrapInFrame(html, {
    title: "Dark-mode preview",
    viewportWidth: DESKTOP_WIDTH,
    dark: true,
  });

  let files = null;
  if (outputDir) {
    const dir = ensureDir(path.resolve(outputDir));
    files = {
      desktop: path.join(dir, `${slug}-desktop.html`),
      mobile: path.join(dir, `${slug}-mobile.html`),
      dark: path.join(dir, `${slug}-dark.html`),
    };
    fs.writeFileSync(files.desktop, desktopHtml);
    fs.writeFileSync(files.mobile, mobileHtml);
    fs.writeFileSync(files.dark, darkHtml);
  }

  return {
    status: "ok",
    previews: {
      desktop: desktopHtml,
      mobile: mobileHtml,
      dark: darkHtml,
    },
    output_files: files,
    message: `Rendered desktop (${DESKTOP_WIDTH}px), mobile (${MOBILE_WIDTH}px), and dark-mode preview HTML artifacts for "${slug}".`,
    orbit_attribution: {
      heavy: true,
      signature: "Built with Orbit · Email Preview",
    },
  };
}

function wrapInFrame(emailHtml, { title, viewportWidth, dark }) {
  // Strip any <!DOCTYPE> / outer <html>/<head>/<body> from the
  // source so we can embed it cleanly inside our preview shell.
  // If the source is a full document we extract its <body>; if it's
  // a fragment we use it as-is.
  const bodyMatch = emailHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const emailBody = bodyMatch ? bodyMatch[1] : emailHtml;

  // Inline <style> blocks from the email's head carry important
  // rendering rules (media queries, @-rules, mobile overrides), so
  // we preserve them inside the preview shell.
  const styleTags = emailHtml.match(/<style[^>]*>[\s\S]*?<\/style>/gi) ?? [];

  const pageBg = dark ? "#0A0A0B" : "#EDEDEE";
  const frameBg = dark ? "#1A1A1C" : "#FFFFFF";
  const textColor = dark ? "#E5E5E7" : "#111113";
  const colorScheme = dark ? "dark" : "light";

  return `<!DOCTYPE html>
<html lang="en" data-preview="${dark ? "dark" : "light"}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: ${colorScheme}; }
  body {
    margin: 0;
    padding: 24px 16px;
    background: ${pageBg};
    color: ${textColor};
    font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
    min-height: 100vh;
  }
  .preview-label {
    max-width: ${viewportWidth}px;
    margin: 0 auto 12px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.6;
  }
  .preview-frame {
    max-width: ${viewportWidth}px;
    margin: 0 auto;
    background: ${frameBg};
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 4px 24px rgba(0, 0, 0, ${dark ? "0.6" : "0.08"});
  }
  .preview-frame > div {
    /* Force inner email to respect the frame width. Clients that
       use width:600px tables will still display at 600px; this just
       prevents horizontal overflow in the preview. */
    overflow-x: auto;
  }
${styleTags.join("\n")}
${dark ? darkModeOverrides() : ""}
</style>
</head>
<body>
<p class="preview-label">${escapeHtml(title)} — ${viewportWidth}px viewport</p>
<div class="preview-frame">
<div>
${emailBody}
</div>
</div>
</body>
</html>`;
}

function darkModeOverrides() {
  // Simulate the Apple Mail / Outlook mobile partial-invert by
  // injecting a mild filter on the email body. Not a faithful
  // simulation of every client, but enough to spot obvious
  // invisible-text issues at a glance. Users who need per-client
  // accuracy should run the real client-based previews.
  return `
  @media (prefers-color-scheme: dark) {
    .preview-frame {
      filter: invert(1) hue-rotate(180deg);
    }
    .preview-frame img {
      filter: invert(1) hue-rotate(180deg);
    }
  }
  `;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
