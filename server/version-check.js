/**
 * Orbit version check — compares the installed version against the
 * latest release. No auth required; reads the manifest from the Orbit
 * website, which proxies the canonical manifest.json from the private
 * distribution bucket.
 *
 * We keep a GitHub-based fallback so that if the website is down the
 * check can still succeed against the public source repo's manifest
 * (which always matches the bucket after a release).
 */

import { fetchWithRetry, getBreaker } from "./orbit-resilience.js";

const WEBSITE_BREAKER = getBreaker("orbit-website");
const GITHUB_BREAKER = getBreaker("github");
const LATEST_MANIFEST_URL =
  "https://get.yourorbit.team/api/orbit/latest-version";
const FALLBACK_LATEST_URL =
  "https://raw.githubusercontent.com/justinwilliames-sketch/orbit-for-claude/main/manifest.json";

function compareVersions(a, b) {
  const [am, an, ap] = String(a).split(".").map((x) => Number.parseInt(x, 10) || 0);
  const [bm, bn, bp] = String(b).split(".").map((x) => Number.parseInt(x, 10) || 0);
  if (am !== bm) return am - bm;
  if (an !== bn) return an - bn;
  return ap - bp;
}

export async function checkOrbitVersion({ installedVersion }) {
  const sources = [LATEST_MANIFEST_URL, FALLBACK_LATEST_URL];
  let latest = null;
  let sourceUsed = null;
  let error = null;

  for (const url of sources) {
    try {
      // Use a per-host breaker so a flaky website doesn't cascade
      // into the GitHub-fallback's reputation and vice versa.
      const breaker = url.startsWith("https://get.yourorbit.team")
        ? WEBSITE_BREAKER
        : GITHUB_BREAKER;
      const res = await fetchWithRetry(
        url,
        { method: "GET", headers: { Accept: "application/json" } },
        { timeoutMs: 10_000, retries: 2, breaker }
      );
      if (!res.ok) {
        error = `Source returned ${res.status} for ${url}`;
        continue;
      }
      const data = await res.json();
      latest = data?.version;
      sourceUsed = url;
      if (latest) break;
    } catch (err) {
      error = err.message;
    }
  }

  if (!latest) {
    return {
      status: "error",
      code: "version_check_failed",
      message: `Could not reach the version-check endpoint: ${error ?? "unknown"}`,
      installed_version: installedVersion,
      suggested_next_steps: [
        "Check your internet connection.",
        "Visit https://get.yourorbit.team/account/downloads to see the latest release."
      ]
    };
  }

  const comparison = compareVersions(installedVersion, latest);
  let status;
  let message;
  if (comparison === 0) {
    status = "up_to_date";
    message = `You're running the latest Orbit (${installedVersion}).`;
  } else if (comparison > 0) {
    status = "ahead";
    message = `Your local Orbit (${installedVersion}) is ahead of the published release (${latest}). This usually means you're running a dev build.`;
  } else {
    status = "update_available";
    message = `A newer Orbit is available: ${latest} (you're on ${installedVersion}).`;
  }

  return {
    status,
    installed_version: installedVersion,
    latest_version: latest,
    source: sourceUsed,
    message,
    download_url: "https://get.yourorbit.team/download",
    suggested_next_steps: comparison < 0
      ? [
          "Open https://get.yourorbit.team/download in your browser.",
          "Download the latest .mcpb and double-click it. Claude Desktop replaces the old version in place — no uninstall required.",
          "Restart Claude Desktop after install to load the updated skills and tools."
        ]
      : []
  };
}
