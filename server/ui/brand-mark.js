/**
 * The Orbit mark, as a data URI, for MCP `icons`.
 *
 * Hosts render an icon beside the server and beside each tool call. That
 * is the only persistent branding surface an MCP server has — the rest
 * of the conversation belongs to the host — so it is worth getting the
 * bytes right.
 *
 * Why an SVG built here rather than the existing icon.png: the PNG is
 * 6,884 bytes, which is ~9.2KB once base64-encoded. Repeating that on
 * every one of 126 tools would add well over a megabyte to every
 * tools/list response, on a payload the host re-reads whenever the tool
 * list changes. This mark is a few hundred bytes, scales to any size a
 * host asks for, and costs nothing to repeat.
 *
 * A data URI rather than an https://yourorbit.team URL because Orbit
 * makes no network call it does not need to. An icon that only appears
 * when the user is online — and quietly reports each render to the
 * author's server — is not a trade worth making for a logo.
 *
 * Two variants. Hosts pick by `theme`, and a single-colour mark that
 * looks right on white is invisible on the dark chrome most people run
 * Claude Desktop in.
 */

/**
 * The glyph: a body on an elliptical orbit path. Drawn once, tinted per
 * theme. Kept deliberately simple — at the 16-20px a host actually
 * renders, detail becomes noise.
 */
function markSvg({ ring, body }) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">`,
    // The orbit path, tilted so it reads as a ring in perspective
    // rather than as a plain circle.
    `<ellipse cx="16" cy="16" rx="14" ry="6.4" transform="rotate(-28 16 16)" stroke="${ring}" stroke-width="2.2"/>`,
    // The body, offset onto the path rather than centred — a dot in the
    // middle of a ring reads as a target, not an orbit.
    `<circle cx="23.4" cy="10.9" r="4.3" fill="${body}"/>`,
    `</svg>`,
  ].join("");
}

function toDataUri(svg) {
  // Percent-encode rather than base64: an SVG this small is SHORTER
  // encoded this way, and it stays readable in a manifest diff.
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Indigo ring, indigo body — for light host chrome. */
export const ORBIT_MARK_LIGHT = toDataUri(markSvg({ ring: "#6366F1", body: "#4F46E5" }));

/** Lifted for dark chrome: the darker indigo disappears on near-black. */
export const ORBIT_MARK_DARK = toDataUri(markSvg({ ring: "#818CF8", body: "#A5ADFB" }));

/**
 * The `icons` array for a tool or for serverInfo.
 *
 * `sizes: ["any"]` is the correct declaration for vector art — it tells
 * the host it can render at whatever size it likes rather than guessing
 * whether a raster is big enough.
 */
export const ORBIT_ICONS = [
  { src: ORBIT_MARK_LIGHT, mimeType: "image/svg+xml", sizes: ["any"], theme: "light" },
  { src: ORBIT_MARK_DARK, mimeType: "image/svg+xml", sizes: ["any"], theme: "dark" },
];

/** Bytes both variants add to a payload. Asserted in the test suite. */
export function iconPayloadBytes() {
  return Buffer.byteLength(JSON.stringify(ORBIT_ICONS), "utf8");
}
