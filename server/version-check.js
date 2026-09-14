/**
 * Orbit version check — compares the installed version against the latest
 * published release, across THREE independent sources.
 *
 * WHY THREE. Until 0.43.0 this read one endpoint: the Orbit website's
 * /api/orbit/latest-version. On 2026-09-08 the website's deploy stopped
 * running while releases kept shipping, and the single source went stale at
 * 0.40.0 for eight days. The failure was not that the check broke — it is
 * that it kept working and kept lying, in both directions at once:
 *
 *   installed 0.40.0 -> "up_to_date"                    (three releases behind)
 *   installed 0.42.1 -> "ahead ... dev build"           (the current release)
 *
 * Those are one bug seen from two sides, and the second is worse, because
 * version-nag.js gates on `status` — so the people furthest behind were the
 * ones told they were current, and the update prompt never fired for them.
 *
 * The old header justified the single source with "the source repo is
 * private". It is not, and probably never was by the time that line was
 * written: `gh api repos/justinwilliames/orbit-for-claude --jq .private`
 * returns false, unauthenticated. A dead reason is worse than a dead fact —
 * the fact would have been noticed.
 *
 * THE THREE SOURCES, and what each is good for:
 *
 *   1. GitHub Releases   — the tag. Unauthenticated, 60 req/hr, and it is
 *                          where CI publishes first, so it moves earliest.
 *   2. The MCP registry  — the tag AND a fileSha256 pinning the exact bytes.
 *                          The only source that says *which artefact*, not
 *                          just which number. Note the shape: entries nest
 *                          under `server`, and the list returns EVERY
 *                          published version unordered (16 at time of
 *                          writing, oldest first) — the current one is the
 *                          single entry flagged `isLatest` in its _meta.
 *                          Reading `servers[0].version` gets you 0.31.1.
 *   3. The Orbit website — retained, no longer trusted alone. It is the only
 *                          source that carries the counts sidecar, and it is
 *                          the one that went stale.
 *
 * THE RULE: highest version wins, and disagreement is reported rather than
 * hidden. A source that is unreachable is not an error — it is one fewer
 * vote. All three unreachable is the only hard failure.
 */

import { fetchWithRetry, getBreaker } from "./orbit-resilience.js";

const SOURCES = [
  {
    id: "github_releases",
    label: "GitHub Releases",
    url: "https://api.github.com/repos/justinwilliames/orbit-for-claude/releases/latest",
    breaker: getBreaker("github-releases"),
    // tag_name is "v0.42.1"; a draft or prerelease is not a release anyone
    // should be told to install, so it reports no version at all.
    extract: (d) =>
      d?.draft || d?.prerelease ? null : String(d?.tag_name ?? "").replace(/^v/, "") || null
  },
  {
    id: "mcp_registry",
    label: "MCP registry",
    url: "https://registry.modelcontextprotocol.io/v0/servers?search=orbit-lifecycle-mcp",
    breaker: getBreaker("mcp-registry"),
    extract: (d) => {
      const entries = Array.isArray(d?.servers) ? d.servers : [];
      const current = entries.find(
        (e) => e?._meta?.["io.modelcontextprotocol.registry/official"]?.isLatest
      );
      return current?.server?.version ?? null;
    }
  },
  {
    id: "orbit_website",
    label: "the Orbit website",
    url: "https://yourorbit.team/api/orbit/latest-version",
    breaker: getBreaker("orbit-website"),
    extract: (d) => d?.version ?? null
  }
];

function compareVersions(a, b) {
  const [am, an, ap] = String(a).split(".").map((x) => Number.parseInt(x, 10) || 0);
  const [bm, bn, bp] = String(b).split(".").map((x) => Number.parseInt(x, 10) || 0);
  if (am !== bm) return am - bm;
  if (an !== bn) return an - bn;
  return ap - bp;
}

/** Ask one source. Never throws — an unreachable source is a missing vote. */
async function askSource(source) {
  try {
    const res = await fetchWithRetry(
      source.url,
      { method: "GET", headers: { Accept: "application/json" } },
      { timeoutMs: 10_000, retries: 1, breaker: source.breaker }
    );
    if (!res.ok) {
      return { ...source, version: null, error: `HTTP ${res.status}` };
    }
    const version = source.extract(await res.json());
    return {
      ...source,
      version,
      error: version ? null : "no version in response"
    };
  } catch (err) {
    return { ...source, version: null, error: err.message };
  }
}

/**
 * The decision, separated from the network so it can be tested against real
 * code rather than a copy of it. Takes votes, returns the verdict.
 *
 * Exported for tests/suites/32-version-nag.test.mjs. An earlier draft of that
 * suite re-implemented this reduce inline and asserted against the copy —
 * which would have passed while this function did anything at all.
 */
export function decideVersion(installedVersion, votes) {
  const reachable = votes.filter((r) => r.version);
  if (reachable.length === 0) return { status: "error", latest: null, stale: [] };
  const latest = reachable
    .map((r) => r.version)
    .reduce((best, v) => (compareVersions(v, best) > 0 ? v : best));
  const comparison = compareVersions(installedVersion, latest);
  return {
    status:
      comparison === 0 ? "up_to_date" : comparison > 0 ? "ahead" : "update_available",
    latest,
    comparison,
    agreeing: reachable.filter((r) => r.version === latest),
    disagreeing: reachable.filter((r) => r.version !== latest),
    stale: reachable.filter((r) => r.version !== latest).map((r) => r.id)
  };
}

export async function checkOrbitVersion({ installedVersion }) {
  const results = await Promise.all(SOURCES.map(askSource));
  const reachable = results.filter((r) => r.version);

  const sources_checked = results.map((r) => ({
    source: r.id,
    version: r.version,
    error: r.error
  }));

  if (reachable.length === 0) {
    return {
      status: "error",
      code: "version_check_failed",
      message:
        "Could not reach any of the three version sources: " +
        results.map((r) => `${r.label} (${r.error})`).join(", "),
      installed_version: installedVersion,
      sources_checked,
      suggested_next_steps: [
        "Check your internet connection.",
        "Visit https://github.com/justinwilliames/orbit-for-claude/releases, which needs no account at all.",
        "Or https://yourorbit.team/downloads."
      ]
    };
  }

  // Highest wins. A stale source cannot drag the answer down, which is the
  // whole point — 0.40.0 from the website loses to 0.42.1 from the registry.
  const { latest, comparison, agreeing, disagreeing } = decideVersion(
    installedVersion,
    reachable
  );
  let status;
  let message;
  if (comparison === 0) {
    status = "up_to_date";
    message = `You're running the latest Orbit (${installedVersion}).`;
  } else if (comparison > 0) {
    // Only reachable when the install is genuinely newer than EVERY source —
    // a local build. The old single-source version reached this for a
    // correctly-installed release whenever the one endpoint lagged.
    status = "ahead";
    message = `Your local Orbit (${installedVersion}) is ahead of every published release (newest seen: ${latest}). This usually means you're running a dev build.`;
  } else {
    status = "update_available";
    message = `A newer Orbit is available: ${latest} (you're on ${installedVersion}).`;
  }

  // Surfaced, not swallowed. A lagging source is the early warning that a
  // publish step or a deploy has stopped, and it is exactly what nobody saw
  // for eight days in September 2026.
  const stale_sources = disagreeing.map((r) => ({
    source: r.id,
    reports: r.version,
    behind_by: `${latest} is newer`
  }));
  if (disagreeing.length > 0) {
    message +=
      ` (Sources disagree: ${agreeing.map((r) => r.label).join(" and ")} ` +
      `report ${latest}, while ${disagreeing
        .map((r) => `${r.label} reports ${r.version}`)
        .join(" and ")}. Taking the newest.)`;
  }

  return {
    status,
    installed_version: installedVersion,
    latest_version: latest,
    source: agreeing.map((r) => r.id).join("+"),
    sources_checked,
    ...(stale_sources.length > 0 ? { stale_sources } : {}),
    message,
    // Plural. The singular /download is a redirect into the sign-up wall.
    download_url: "https://yourorbit.team/downloads",
    suggested_next_steps:
      comparison < 0
        ? [
            "Open https://yourorbit.team/downloads in your browser — free, no licence key. The site asks for a free account (one email); https://github.com/justinwilliames/orbit-for-claude/releases is ungated.",
            "Download the latest .mcpb and double-click it. Claude Desktop replaces the old version in place — no uninstall required.",
            "Restart Claude Desktop after install to load the updated skills and tools."
          ]
        : []
  };
}
