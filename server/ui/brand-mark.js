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
 * The glyph: a PLANET, a ring across it, and a satellite on the ring.
 *
 * The silhouette is icon.png's, deliberately — that PNG is the install
 * card, and get-orbit's favicon draws the same three shapes. An earlier
 * version of this file dropped the planet and shipped a bare tilted
 * ellipse with a dot, which is the most generic "orbit" glyph available
 * and shares no silhouette with either of the other two surfaces. This
 * is the highest-frequency Orbit mark anyone sees — beside the server
 * and beside every tool call — so it is the one that must be the same
 * object.
 *
 * Kept to three shapes: at the 16-20px a host actually renders, detail
 * becomes noise. The ring is stroked OVER the planet in a contrasting
 * tint rather than being occluded by it — an accurate front/back arc
 * split is invisible at that size and costs bytes to draw.
 */
function markSvg({ ring, body, bodyOpacity = 1 }) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">`,
    // The planet. Offset down-left so the ring's upper-right lift and the
    // satellite have room inside the 32-box.
    `<circle cx="14.6" cy="17" r="8.2" fill="${body}"${bodyOpacity === 1 ? "" : ` fill-opacity="${bodyOpacity}"`}/>`,
    // The ring, tilted so it reads in perspective rather than as a
    // concentric circle.
    `<ellipse cx="16" cy="16" rx="13" ry="5.2" transform="rotate(-25 16 16)" stroke="${ring}" stroke-width="2.1"/>`,
    // The satellite, sitting ON the ring path (10 degrees around the
    // unrotated ellipse, then rotated with it) rather than floating.
    `<circle cx="27.6" cy="9.8" r="3" fill="${ring}"/>`,
    `</svg>`,
  ].join("");
}

function toDataUri(svg) {
  // Percent-encode rather than base64: an SVG this small is SHORTER
  // encoded this way, and it stays readable in a manifest diff.
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Ring and planet are two SEPARATED tints, not two shades of one. The
// ring crosses the planet, so a pair a step apart on the indigo ramp
// merges into a blob at 16px — which is the size that matters.

/** Dark ring over a lighter planet — for light host chrome. */
export const ORBIT_MARK_LIGHT = toDataUri(markSvg({ ring: "#4338CA", body: "#A5B4FC" }));

/** Bright ring over a mid planet: the darker indigos vanish on near-black. */
export const ORBIT_MARK_DARK = toDataUri(markSvg({ ring: "#C7D2FE", body: "#6366F1" }));

/**
 * The same three shapes as raw markup, inked in `currentColor`, for
 * embedding inline in a document that already has a theme-correct text
 * colour — the standalone artifact signature. A data URI would need a
 * theme decision the document has already made.
 */
export const ORBIT_MARK_INLINE = markSvg({
  ring: "currentColor",
  body: "currentColor",
  bodyOpacity: 0.42,
});

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
