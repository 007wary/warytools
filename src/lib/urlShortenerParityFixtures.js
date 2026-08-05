// Shared JS↔SQL contract for the URL shortener's validation.
//
// `create_short_url` is callable directly via PostgREST with the public anon
// key, so when /api/shorten is bypassed the `is_shortenable_url` SQL function
// is the *only* gate. That makes the two implementations a pair that must
// agree, and they have drifted before: the SQL copy once accepted
// "HTTPS://..." that the JS side normalized, and both once accepted
// "https://localhost./x" because a trailing root-label dot slipped past the
// exact-match hostname set on one side and the suffix list on the other.
//
// These fixtures are the contract. urlShortenerValidation.test.js asserts the
// JS side against them on every run. To check the database half, run the
// query printed by `parityQuery()` against the project and confirm every row
// matches `shouldAccept` — do this whenever either implementation changes.
//
// Each case is [url, shouldAccept, why].
export const PARITY_CASES = [
  // --- accepted -----------------------------------------------------------
  ["https://example.com/x", true, "ordinary https"],
  ["http://example.com", true, "ordinary http"],
  ["https://sub.example.co.uk/a?b=1#c", true, "query and fragment are not host"],
  ["https://8.8.8.8/x", true, "public IPv4 literal"],
  ["https://example.com:8443/x", true, "explicit port is stripped before checks"],
  ["https://[2606:4700::1111]/x", true, "public IPv6 literal"],
  ["HTTPS://example.com/x", true, "scheme is case-insensitive"],
  ["https://EXAMPLE.com/x", true, "host is case-insensitive"],
  ["https://example.com./x", true, "root-label dot on a public name is still public"],

  // --- rejected: local / private targets ----------------------------------
  ["https://localhost/x", false, "loopback by name"],
  ["https://localhost./x", false, "loopback by fully-qualified name"],
  ["https://LOCALHOST./x", false, "loopback, mixed case and root-label dot"],
  ["https://127.0.0.1/x", false, "loopback literal"],
  ["https://10.0.0.1./x", false, "RFC1918 with root-label dot"],
  ["https://169.254.169.254/x", false, "cloud metadata endpoint"],
  ["https://100.64.0.1/x", false, "CGNAT"],
  ["https://172.16.0.1/x", false, "RFC1918"],
  ["https://192.168.1.1/x", false, "RFC1918"],
  ["https://0.0.0.0/x", false, "\"this network\""],
  ["https://224.0.0.1/x", false, "multicast"],
  ["https://[fc00::1]/x", false, "IPv6 unique-local"],
  ["https://[fe80::1]/x", false, "IPv6 link-local"],
  ["https://[::1]/x", false, "IPv6 loopback"],
  ["https://[::ffff:127.0.0.1]/x", false, "IPv4-mapped loopback, dotted spelling"],
  // new URL() canonicalizes the dotted spelling above into these hex forms, so
  // the hex form is what validation actually receives. Matching only the
  // dotted form let the metadata endpoint through on both sides.
  ["https://[::ffff:7f00:1]/x", false, "IPv4-mapped loopback, hex spelling"],
  ["https://[::ffff:a9fe:a9fe]/x", false, "IPv4-mapped cloud metadata, hex spelling"],
  ["https://[::ffff:a00:1]/x", false, "IPv4-mapped RFC1918, hex spelling"],
  ["https://nas.local./x", false, "mDNS name with root-label dot"],
  ["https://db.internal/x", false, "reserved internal TLD"],
  ["https://router.home.arpa/x", false, "RFC 8375"],
  ["https://x.test/x", false, "RFC 2606"],
  ["https://x.invalid/x", false, "RFC 2606"],
  ["https://intranet/x", false, "dotless single-label host"],
  ["https://2130706433/x", false, "decimal-encoded 127.0.0.1"],
  ["https://0x7f000001/x", false, "hex-encoded 127.0.0.1"],

  // --- rejected: other ----------------------------------------------------
  ["https://google.com@evil.example/x", false, "embedded credentials"],
  ["ftp://example.com/x", false, "non-http(s) scheme"],
];

// Renders PARITY_CASES as a single SQL statement, so the database half can be
// checked against the same list rather than a hand-retyped copy of it.
export function parityQuery() {
  const literals = PARITY_CASES.map(([url]) => `'${url.replace(/'/g, "''")}'`).join(",\n ");
  return `select u as url, public.is_shortenable_url(u) as sql_ok\nfrom unnest(array[\n ${literals}\n]) as u;`;
}
