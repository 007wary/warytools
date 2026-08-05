// Validation and normalization for the URL shortener's input, kept separate
// from the client component so it's testable without a DOM/window.
// `siteOrigin` is passed in explicitly (rather than read from
// window.location) for the same reason — it's the one piece of this check
// that depends on where the page is hosted, so the caller supplies it.
//
// This module is the single source of truth for "is this URL shortenable",
// shared by the client (fast feedback), the /api/shorten route (the real
// gate), and mirrored by the `create_short_url` RLS/RPC rules in the
// database. When you change a rule here, check the other two.

export const MAX_URL_LENGTH = 2048;

// Reasons are returned as codes rather than sentences so the caller decides
// the wording — the client shows them inline, the API route returns them as
// JSON. A bare boolean couldn't tell "no scheme" from "we don't shorten our
// own links", which are very different things to tell a user.
export const UrlRejection = {
  EMPTY: "empty",
  TOO_LONG: "too_long",
  MALFORMED: "malformed",
  BAD_SCHEME: "bad_scheme",
  HAS_CREDENTIALS: "has_credentials",
  NOT_PUBLIC: "not_public",
  SELF_SHORTLINK: "self_shortlink",
};

export const REJECTION_MESSAGES = {
  [UrlRejection.EMPTY]: "Paste a URL to shorten.",
  [UrlRejection.TOO_LONG]: `That URL is longer than ${MAX_URL_LENGTH} characters.`,
  [UrlRejection.MALFORMED]: "That doesn't look like a valid URL.",
  [UrlRejection.BAD_SCHEME]: "Only http:// and https:// links can be shortened.",
  [UrlRejection.HAS_CREDENTIALS]:
    "That URL contains a username or password. Remove them before shortening.",
  [UrlRejection.NOT_PUBLIC]:
    "That URL points to a local or private address, which wouldn't work for anyone else.",
  [UrlRejection.SELF_SHORTLINK]: "That's already a short link from this site.",
};

// Hostnames that only mean something on the visitor's own machine or
// network. Shortening them is never useful — the resulting link is broken
// for every other person — and a public redirector pointing at private
// address space is a standing SSRF//pivot tool for anything that follows
// our redirects (link previewers, crawlers, corporate proxies).
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::]", "[::1]", "::1"]);

// Suffixes reserved for local/internal naming (RFC 6762, RFC 8375, RFC 2606).
const PRIVATE_TLDS = [".local", ".localhost", ".internal", ".home.arpa", ".test", ".invalid"];

function isPrivateIpv4(hostname) {
  const parts = hostname.split(".");
  if (parts.length !== 4) return false;

  const octets = parts.map((p) => {
    // Reject anything that isn't plain decimal, so "0x7f.1" style encodings
    // don't slip through as "not an IP" and get treated as a domain.
    if (!/^\d{1,3}$/.test(p)) return NaN;
    return Number(p);
  });

  if (octets.some((n) => Number.isNaN(n) || n > 255)) return false;

  const [a, b] = octets;
  return (
    a === 0 || // "this network"
    a === 10 || // private
    a === 127 || // loopback
    (a === 169 && b === 254) || // link-local (cloud metadata lives at 169.254.169.254)
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    a >= 224 // multicast / reserved
  );
}

function isPrivateIpv6(hostname) {
  // URL parsing keeps IPv6 literals in brackets.
  if (!hostname.startsWith("[") || !hostname.endsWith("]")) return false;
  const inner = hostname.slice(1, -1).toLowerCase();

  if (inner === "::1" || inner === "::") return true;
  // fc00::/7 unique-local, fe80::/10 link-local.
  if (/^f[cd]/.test(inner)) return true;
  if (/^fe[89ab]/.test(inner)) return true;
  // IPv4-mapped (::ffff:127.0.0.1) — check the embedded address.
  //
  // Both spellings have to be handled. `new URL()` canonicalizes the
  // dotted-decimal form into hex ("[::ffff:127.0.0.1]" parses to
  // "[::ffff:7f00:1]"), so by the time checkUrl() reads url.hostname only the
  // hex form is ever present — matching the dotted form alone let
  // "https://[::ffff:169.254.169.254]/x" through to the metadata endpoint.
  // The dotted branch is kept because this helper is also called directly
  // with un-parsed hostnames.
  const mappedDotted = inner.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mappedDotted) return isPrivateIpv4(mappedDotted[1]);

  const mappedHex = inner.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const high = parseInt(mappedHex[1], 16);
    const low = parseInt(mappedHex[2], 16);
    const dotted = [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
    return isPrivateIpv4(dotted);
  }

  return false;
}

// Whether a hostname is reachable by the general public. Note this is a
// syntactic check, not a DNS resolution — a public hostname can still
// resolve to a private address. It stops the obvious cases; it isn't a
// complete SSRF defence, and doesn't need to be, since we only ever hand
// the URL back to the browser rather than fetching it ourselves.
export function isPubliclyRoutableHost(hostname) {
  if (!hostname) return false;

  // A trailing dot is the fully-qualified (root-label) form of a name:
  // "localhost." resolves exactly like "localhost". Stripping it before the
  // checks below is what stops it slipping past them — the exact-match set
  // and the suffix list both otherwise miss the dotted spelling, while the
  // IP-shape tests already rejected "10.0.0.1." by failing to parse.
  //
  // Every trailing dot goes, not just one: stripping a single dot leaves
  // "localhost.." as "localhost.", which still misses the exact-match set.
  // Only the trailing run is touched, so an interior dot still separates
  // labels as usual.
  const lower = hostname.toLowerCase().replace(/\.+$/, "");
  if (!lower) return false;

  if (LOCAL_HOSTNAMES.has(lower)) return false;
  if (PRIVATE_TLDS.some((tld) => lower === tld.slice(1) || lower.endsWith(tld))) return false;
  if (isPrivateIpv4(lower)) return false;
  if (isPrivateIpv6(lower)) return false;

  // A bare single-label host ("intranet") is only resolvable via a local
  // search domain, so it's in the same category as the above.
  if (!lower.startsWith("[") && !lower.includes(".")) return false;

  return true;
}

// Full check. Returns a discriminated result rather than a boolean so
// callers can explain *why* — the same shape the calculator inputs use.
export function checkUrl(value, siteOrigin) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { ok: false, reason: UrlRejection.EMPTY };
  }

  const trimmed = value.trim();

  if (trimmed.length > MAX_URL_LENGTH) {
    return { ok: false, reason: UrlRejection.TOO_LONG };
  }

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: UrlRejection.MALFORMED };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: UrlRejection.BAD_SCHEME };
  }

  // "https://google.com@evil.example" reads as Google to a human but goes
  // to evil.example. A shortener that accepts these becomes a phishing
  // laundering service, and the short link hides the giveaway entirely.
  if (url.username || url.password) {
    return { ok: false, reason: UrlRejection.HAS_CREDENTIALS };
  }

  if (!isPubliclyRoutableHost(url.hostname)) {
    return { ok: false, reason: UrlRejection.NOT_PUBLIC };
  }

  // Block shortening our own /s/ links — prevents redirect chains/loops
  // and stops the shortener being used to obscure other short links.
  if (siteOrigin && url.origin === siteOrigin && url.pathname.startsWith("/s/")) {
    return { ok: false, reason: UrlRejection.SELF_SHORTLINK };
  }

  // Store the parsed serialization rather than the raw input, so the same
  // link typed two ways doesn't become two different rows and, more
  // importantly, so what we store is what the URL parser agreed it means.
  return { ok: true, url: url.href };
}

// Boolean convenience wrapper, kept because it reads better at call sites
// that only branch on validity.
export function isValidUrl(value, siteOrigin) {
  return checkUrl(value, siteOrigin).ok;
}

export function rejectionMessage(reason) {
  return REJECTION_MESSAGES[reason] || "That doesn't look like a valid URL.";
}
