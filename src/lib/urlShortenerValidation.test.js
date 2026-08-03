import { describe, it, expect } from "vitest";
import { isValidUrl, MAX_URL_LENGTH } from "./urlShortenerValidation";

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
