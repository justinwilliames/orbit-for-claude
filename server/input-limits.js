/**
 * Central size limits for tool inputs.
 *
 * These constants are applied to Zod schemas in server/index.js and a
 * handful of shared schemas. They exist to prevent two classes of
 * abuse / footgun:
 *
 *   1. Resource exhaustion — a caller pastes a 50MB string into a
 *      z.string() field and the server balloons RAM trying to
 *      serialise it back. Caps keep worst-case memory bounded.
 *   2. Array DoS — a caller passes 100k items into a field that's
 *      supposed to hold a handful. Caps keep worst-case iteration
 *      bounded.
 *
 * Values are deliberately generous so no real workflow ever hits
 * them. If a legitimate workflow bumps a cap, raise it deliberately
 * rather than remove it.
 */

// String caps — applied via .max()
export const MAX_SHORT_STRING = 2_000;       // names, IDs, slugs, labels, short refs
export const MAX_MEDIUM_STRING = 20_000;     // goals, requests, descriptions, briefs
export const MAX_LONG_STRING = 200_000;      // HTML, MJML, markdown bodies, JSON blobs
export const MAX_PATH_STRING = 4_096;        // filesystem paths (POSIX PATH_MAX)
export const MAX_URL_STRING = 8_000;         // URLs (well over RFC practical limit)

// Array caps — applied via .max()
export const MAX_SHORT_ARRAY = 50;           // tags, refs, components in one call
export const MAX_MEDIUM_ARRAY = 200;         // ids to look up, user ids, emails
export const MAX_LONG_ARRAY = 1_000;         // bulk lists (rare)

// Numeric bounds
export const MIN_DAYS = 1;
export const MAX_DAYS = 365;
export const MIN_VARIATION_COUNT = 1;
export const MAX_VARIATION_COUNT = 20;

// Safety note: these caps are the OUTER bound. Per-tool handlers may
// apply tighter bounds where the domain requires it (e.g. a tool
// that writes files should not accept 200_000-char filenames even
// though a MAX_PATH_STRING is larger).
