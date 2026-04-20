/**
 * Path-safety utilities for user-supplied file / directory inputs.
 *
 * The MCPB runs locally on the user's own machine, so this isn't
 * adversarial-attacker territory. But operators still mistype paths,
 * and a stray `../` in a config can write or read outside the
 * intended Orbit workspace root. These utilities prevent that.
 *
 * Two primary concerns:
 *
 *   1. Traversal — `../../../etc/passwd` style paths that escape a
 *      permitted root directory. Usually accidental; always worth
 *      blocking.
 *   2. Absolute paths — an absolute path bypasses the permitted
 *      root entirely. By default we allow them, but callers can opt
 *      into "relative only" for extra hygiene.
 *
 * Semantics:
 *   - `resolveSafe(userPath, { root })` — returns the absolute,
 *     canonical path IF it resolves inside `root`. Throws otherwise.
 *   - `resolveSafe(userPath)` without `root` — returns the absolute
 *     path, rejecting only obviously suspicious patterns (null bytes).
 */

import path from "node:path";

/** Classify a user-supplied path. Throws on violation. */
export function resolveSafe(userPath, { root, requireRelative = false } = {}) {
  if (typeof userPath !== "string") {
    throw Object.assign(new Error("Path must be a string."), { code: "invalid_path" });
  }
  if (userPath.length === 0) {
    throw Object.assign(new Error("Path cannot be empty."), { code: "invalid_path" });
  }
  // Null bytes are a classic path-injection trick — reject hard.
  if (userPath.includes("\0")) {
    throw Object.assign(new Error("Path cannot contain null bytes."), { code: "invalid_path" });
  }

  if (requireRelative && path.isAbsolute(userPath)) {
    throw Object.assign(
      new Error(`Path must be relative, got absolute path "${userPath}".`),
      { code: "invalid_path" }
    );
  }

  // Resolve to an absolute path. If `root` is supplied, resolve the
  // user path against it first so relative paths are measured from
  // the allowed root rather than the process cwd.
  const resolved = root
    ? path.resolve(root, userPath)
    : path.resolve(userPath);

  if (root) {
    const normalisedRoot = path.resolve(root);
    // The resolved path must either be inside the root OR be the
    // root itself. Use path.relative and check the result doesn't
    // start with `..` and isn't absolute — that's the idiomatic
    // "is X inside Y" test.
    const rel = path.relative(normalisedRoot, resolved);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw Object.assign(
        new Error(
          `Path "${userPath}" resolves to "${resolved}", which is outside the permitted root "${normalisedRoot}".`
        ),
        { code: "invalid_path" }
      );
    }
  }

  return resolved;
}

/**
 * Convenience wrapper that returns null instead of throwing. Useful
 * when the caller wants to branch on validity without wrapping in
 * try/catch.
 */
export function tryResolveSafe(userPath, opts = {}) {
  try {
    return { ok: true, path: resolveSafe(userPath, opts) };
  } catch (err) {
    return { ok: false, error: err.message, code: err.code ?? "invalid_path" };
  }
}
