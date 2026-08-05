import { describe, it, expect } from "vitest";
import {
  isValidUrl,
  checkUrl,
  isPubliclyRoutableHost,
  rejectionMessage,
  MAX_URL_LENGTH,
  UrlRejection,
} from "./urlShortenerValidation";
import { PARITY_CASES, parityQuery } from "./urlShortenerParityFixtures";

const SITE_ORIGIN = "https://wary.tools";

describe("isValidUrl", () => {
  it("accepts a normal https URL", () => {
    expect(isValidUrl("https://example.com/page", SITE_ORIGIN)).toBe(true);
  });

  it("accepts a normal http URL", () => {
    expect(isValidUrl("http://example.com", SITE_ORIGIN)).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidUrl("", SITE_ORIGIN)).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(isValidUrl(null, SITE_ORIGIN)).toBe(false);
    expect(isValidUrl(undefined, SITE_ORIGIN)).toBe(false);
    expect(isValidUrl(123, SITE_ORIGIN)).toBe(false);
  });

  it("rejects a malformed URL", () => {
    expect(isValidUrl("not a url", SITE_ORIGIN)).toBe(false);
  });

  it("rejects non-http(s) protocols", () => {
    expect(isValidUrl("ftp://example.com/file", SITE_ORIGIN)).toBe(false);
    expect(isValidUrl("javascript:alert(1)", SITE_ORIGIN)).toBe(false);
    expect(isValidUrl("mailto:test@example.com", SITE_ORIGIN)).toBe(false);
    expect(isValidUrl("data:text/html,<script>alert(1)</script>", SITE_ORIGIN)).toBe(false);
  });

  it("rejects a URL longer than MAX_URL_LENGTH", () => {
    const longUrl = "https://example.com/" + "a".repeat(MAX_URL_LENGTH);
    expect(isValidUrl(longUrl, SITE_ORIGIN)).toBe(false);
  });

  it("rejects shortening the site's own /s/ links (prevents redirect loops)", () => {
    expect(isValidUrl(`${SITE_ORIGIN}/s/abc123`, SITE_ORIGIN)).toBe(false);
  });

  it("allows other paths on the same origin", () => {
    expect(isValidUrl(`${SITE_ORIGIN}/pdf/merge`, SITE_ORIGIN)).toBe(true);
  });

  it("allows /s/-like paths on a different origin", () => {
    expect(isValidUrl("https://other.com/s/abc123", SITE_ORIGIN)).toBe(true);
  });
});

describe("checkUrl", () => {
  it("reports why an input was rejected", () => {
    expect(checkUrl("", SITE_ORIGIN).reason).toBe(UrlRejection.EMPTY);
    expect(checkUrl("   ", SITE_ORIGIN).reason).toBe(UrlRejection.EMPTY);
    expect(checkUrl("nonsense", SITE_ORIGIN).reason).toBe(UrlRejection.MALFORMED);
    expect(checkUrl("ftp://example.com", SITE_ORIGIN).reason).toBe(UrlRejection.BAD_SCHEME);
    expect(checkUrl(`${SITE_ORIGIN}/s/abcdefg`, SITE_ORIGIN).reason).toBe(
      UrlRejection.SELF_SHORTLINK
    );
  });

  it("rejects embedded credentials used to disguise the real host", () => {
    // Reads as google.com to a human; actually goes to evil.example.
    const result = checkUrl("https://google.com@evil.example/login", SITE_ORIGIN);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe(UrlRejection.HAS_CREDENTIALS);
    expect(checkUrl("https://user:pass@example.com", SITE_ORIGIN).reason).toBe(
      UrlRejection.HAS_CREDENTIALS
    );
  });

  it("rejects local and private-network targets", () => {
    const targets = [
      "http://localhost:3000/admin",
      "http://127.0.0.1/",
      "http://0.0.0.0/",
      "http://10.0.0.5/",
      "http://192.168.1.1/",
      "http://172.16.0.1/",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/",
      "http://printer.local/",
      "http://intranet/",
    ];
    for (const target of targets) {
      expect(checkUrl(target, SITE_ORIGIN).reason, target).toBe(UrlRejection.NOT_PUBLIC);
    }
  });

  it("still allows public addresses that look superficially similar", () => {
    expect(checkUrl("http://172.32.0.1/", SITE_ORIGIN).ok).toBe(true);
    expect(checkUrl("http://11.0.0.1/", SITE_ORIGIN).ok).toBe(true);
    expect(checkUrl("https://local.example.com/", SITE_ORIGIN).ok).toBe(true);
  });

  it("returns the parsed serialization so storage is normalized", () => {
    expect(checkUrl("  https://Example.com/a?b=1  ", SITE_ORIGIN).url).toBe(
      "https://example.com/a?b=1"
    );
  });

  it("works without a site origin (server-side callers)", () => {
    expect(checkUrl("https://example.com", undefined).ok).toBe(true);
  });

  it("has a message for every rejection reason", () => {
    for (const reason of Object.values(UrlRejection)) {
      expect(typeof rejectionMessage(reason)).toBe("string");
      expect(rejectionMessage(reason).length).toBeGreaterThan(0);
    }
  });
});

describe("isPubliclyRoutableHost", () => {
  it("accepts ordinary public hostnames", () => {
    expect(isPubliclyRoutableHost("example.com")).toBe(true);
    expect(isPubliclyRoutableHost("sub.example.co.uk")).toBe(true);
    expect(isPubliclyRoutableHost("8.8.8.8")).toBe(true);
  });

  it("rejects loopback, private, link-local and reserved ranges", () => {
    expect(isPubliclyRoutableHost("127.0.0.1")).toBe(false);
    expect(isPubliclyRoutableHost("10.1.2.3")).toBe(false);
    expect(isPubliclyRoutableHost("169.254.169.254")).toBe(false);
    expect(isPubliclyRoutableHost("100.64.0.1")).toBe(false);
    expect(isPubliclyRoutableHost("224.0.0.1")).toBe(false);
    expect(isPubliclyRoutableHost("[fe80::1]")).toBe(false);
    expect(isPubliclyRoutableHost("[::ffff:127.0.0.1]")).toBe(false);
  });

  it("rejects reserved internal TLDs", () => {
    expect(isPubliclyRoutableHost("nas.local")).toBe(false);
    expect(isPubliclyRoutableHost("db.internal")).toBe(false);
    expect(isPubliclyRoutableHost("router.home.arpa")).toBe(false);
  });

  it("rejects empty input", () => {
    expect(isPubliclyRoutableHost("")).toBe(false);
    expect(isPubliclyRoutableHost(undefined)).toBe(false);
  });

  it("strips a single root-label dot rather than being fooled by it", () => {
    // "localhost." resolves exactly like "localhost", but the exact-match set
    // and the reserved-suffix list both miss the dotted spelling unless it is
    // normalized away first.
    expect(isPubliclyRoutableHost("localhost.")).toBe(false);
    expect(isPubliclyRoutableHost("nas.local.")).toBe(false);
    expect(isPubliclyRoutableHost("example.com.")).toBe(true);
    // Only one root-label dot is meaningful; a doubled one is not a resolvable
    // name, so stripping must not turn "localhost.." into a public host.
    expect(isPubliclyRoutableHost("localhost..")).toBe(false);
  });

  it("rejects IPv4-mapped IPv6 in the hex form new URL() produces", () => {
    // "[::ffff:169.254.169.254]" parses to "[::ffff:a9fe:a9fe]", so the hex
    // form is the one that reaches this check in practice.
    expect(isPubliclyRoutableHost("[::ffff:a9fe:a9fe]")).toBe(false);
    expect(isPubliclyRoutableHost("[::ffff:7f00:1]")).toBe(false);
    expect(isPubliclyRoutableHost("[::ffff:a00:1]")).toBe(false);
    // A genuinely public mapped address is still allowed.
    expect(isPubliclyRoutableHost("[::ffff:808:808]")).toBe(true);
  });
});

// The SQL mirror of these rules is the only gate when /api/shorten is
// bypassed and create_short_url is called directly via PostgREST, so the two
// implementations have to agree case for case. See the module header for how
// to run the database half against this same list.
describe("JS↔SQL parity contract", () => {
  it.each(PARITY_CASES)("%s -> %s (%s)", (url, shouldAccept) => {
    expect(isValidUrl(url, SITE_ORIGIN)).toBe(shouldAccept);
  });

  it("renders every case into the query used to check the database half", () => {
    const query = parityQuery();
    expect(query).toContain("public.is_shortenable_url");
    for (const [url] of PARITY_CASES) {
      expect(query).toContain(url);
    }
  });
});
