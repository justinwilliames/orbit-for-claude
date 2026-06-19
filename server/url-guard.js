/**
 * Shared SSRF guard for outbound fetches of externally-supplied URLs.
 *
 * Any URL that originates from the model, a Stripo/Figma payload, or
 * other untrusted input must pass through assertPublicHttpUrl() before
 * we fetch it. The guard:
 *   - whitelists the http/https schemes (rejects file:, gopher:, data:,
 *     ftp:, etc.);
 *   - resolves the hostname via DNS and rejects every result that lands
 *     on loopback, link-local, RFC1918 private space, unique-local IPv6,
 *     or the cloud-metadata address (169.254.169.254 / fd00:ec2::254);
 *   - rejects bare IP literals in those same ranges.
 *
 * fetchGuarded() additionally pins redirect handling to "manual" so a
 * public URL cannot 30x-bounce into an internal target after the check.
 */

import dns from "node:dns/promises";
import net from "node:net";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

// IPv4 cloud-metadata endpoint (AWS/GCP/Azure/DO all share 169.254.169.254).
const METADATA_IPV4 = "169.254.169.254";

/**
 * Classify an IP literal as private / disallowed for outbound fetches.
 * Returns a reason string if blocked, or null if the address is public.
 */
function blockedIpReason(ip) {
  if (net.isIPv4(ip)) {
    const octets = ip.split(".").map((n) => parseInt(n, 10));
    const [a, b] = octets;
    if (ip === METADATA_IPV4) return "cloud-metadata address";
    if (a === 0) return "unspecified/this-network range";
    if (a === 10) return "RFC1918 private range (10.0.0.0/8)";
    if (a === 127) return "loopback range (127.0.0.0/8)";
    if (a === 169 && b === 254) return "link-local range (169.254.0.0/16)";
    if (a === 172 && b >= 16 && b <= 31) return "RFC1918 private range (172.16.0.0/12)";
    if (a === 192 && b === 168) return "RFC1918 private range (192.168.0.0/16)";
    if (a >= 224) return "multicast/reserved range";
    return null;
  }

  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return "IPv6 loopback/unspecified";
    if (lower.startsWith("fe80:")) return "IPv6 link-local range (fe80::/10)";
    if (lower.startsWith("fc") || lower.startsWith("fd")) return "IPv6 unique-local range (fc00::/7)";
    if (lower.startsWith("ff")) return "IPv6 multicast range (ff00::/8)";
    // IPv4-mapped IPv6 (::ffff:a.b.c.d) — re-check the embedded v4 address.
    const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return blockedIpReason(mapped[1]);
    if (lower.startsWith("fd00:ec2:") || lower.includes("fd00:ec2::254")) return "cloud-metadata address";
    return null;
  }

  return null;
}

/**
 * Validate that a URL is safe to fetch from the server: a public
 * http(s) endpoint that does not resolve into a private/internal range.
 *
 * Returns the parsed URL on success; throws an Error (code "ssrf_blocked")
 * otherwise. The caller is expected to surface a sanitised message.
 */
export async function assertPublicHttpUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    const err = new Error("URL is not parseable.");
    err.code = "ssrf_blocked";
    throw err;
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    const err = new Error(`Blocked URL scheme "${parsed.protocol}" — only http/https are permitted.`);
    err.code = "ssrf_blocked";
    throw err;
  }

  // Test-only escape hatch: when explicitly enabled, allow private/loopback/
  // link-local hosts so the suite can exercise outbound fetches against a
  // localhost mock server. Production NEVER sets this var, so the SSRF
  // protection below is unchanged in the real world.
  if (process.env.ORBIT_ALLOW_PRIVATE_HOSTS === "1") {
    return parsed;
  }

  const host = parsed.hostname;

  // Bare IP literal — classify directly without DNS.
  if (net.isIP(host)) {
    const reason = blockedIpReason(host);
    if (reason) {
      const err = new Error(`Blocked private/internal address (${reason}).`);
      err.code = "ssrf_blocked";
      throw err;
    }
    return parsed;
  }

  // Hostname — resolve and reject if any answer is private/internal.
  let addresses;
  try {
    addresses = await dns.lookup(host, { all: true });
  } catch {
    const err = new Error(`Could not resolve host "${host}".`);
    err.code = "ssrf_blocked";
    throw err;
  }

  if (!addresses.length) {
    const err = new Error(`Host "${host}" resolved to no addresses.`);
    err.code = "ssrf_blocked";
    throw err;
  }

  for (const { address } of addresses) {
    const reason = blockedIpReason(address);
    if (reason) {
      const err = new Error(`Host "${host}" resolves to a private/internal address (${reason}).`);
      err.code = "ssrf_blocked";
      throw err;
    }
  }

  return parsed;
}

/**
 * SSRF-guarded fetch. Validates the URL, then fetches with
 * redirect:"manual" so a public URL cannot 30x-bounce into an internal
 * target after the host check. If `init.fetchImpl` is supplied (e.g.
 * fetchWithRetry) it is used instead of the global fetch, with the same
 * guarantees applied to its init.
 *
 * Returns the Response. On a 3xx, the caller gets the redirect response
 * rather than an opaquely-followed one.
 */
export async function fetchGuarded(rawUrl, init = {}) {
  const parsed = await assertPublicHttpUrl(rawUrl);
  const { fetchImpl, fetchOptions, ...rest } = init;
  const guardedInit = { ...rest, redirect: "manual" };
  if (typeof fetchImpl === "function") {
    return fetchImpl(parsed.href, guardedInit, fetchOptions ?? {});
  }
  return fetch(parsed.href, guardedInit);
}
