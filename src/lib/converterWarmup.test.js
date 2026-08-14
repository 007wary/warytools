import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { WARMUP_KEYS, warmupTargetFor } from "./converterWarmup";

// The key->URL map is a security boundary, not a convenience lookup. The
// converter URLs are server-only, so the browser names a key and this module is
// the only thing that turns one into a host we will fetch. A key that escapes
// the allowlist would make the warmup route an open proxy for probing arbitrary
// hosts from our infrastructure, which is worse than any cold start.

const ENV_KEYS = [
  "PDF_CONVERTER_URL",
  "WORD_CONVERTER_URL",
  "POWERPOINT_CONVERTER_URL",
  "EXCEL_CONVERTER_URL",
];

let saved;

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) saved[key] = process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("warmupTargetFor", () => {
  it("resolves a configured converter to its /health endpoint", () => {
    process.env.WORD_CONVERTER_URL = "https://warytools-word-converter.fly.dev";

    expect(warmupTargetFor("word-to-pdf")).toBe(
      "https://warytools-word-converter.fly.dev/health"
    );
  });

  it("appends /health without doubling a trailing slash", () => {
    process.env.WORD_CONVERTER_URL = "https://example.fly.dev/";

    expect(warmupTargetFor("word-to-pdf")).toBe("https://example.fly.dev/health");
  });

  // The env vars are legitimately absent in dev and preview deploys. That must
  // degrade to "no warmup", never to a fetch against a malformed URL.
  it("returns null when the converter is not configured", () => {
    delete process.env.EXCEL_CONVERTER_URL;

    expect(warmupTargetFor("excel-to-pdf")).toBeNull();
  });

  it("returns null for a malformed converter URL rather than throwing", () => {
    process.env.PDF_CONVERTER_URL = "not-a-url";

    expect(warmupTargetFor("pdf-to-word")).toBeNull();
  });

  it("refuses an unknown key", () => {
    expect(warmupTargetFor("nope")).toBeNull();
    expect(warmupTargetFor("")).toBeNull();
  });

  // The reason hasOwnProperty guards the lookup. Without it these resolve to
  // inherited members of Object.prototype and get called as though they were
  // configured converters — "constructor" returns a function, so the bug would
  // surface as a confusing throw rather than a clean refusal.
  it("refuses prototype-chain keys", () => {
    for (const key of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      expect(warmupTargetFor(key)).toBeNull();
    }
  });

  it("refuses non-string keys without throwing", () => {
    for (const key of [null, undefined, 42, {}, []]) {
      expect(warmupTargetFor(key)).toBeNull();
    }
  });

  // A key that reached the map but named a host we do not control would be the
  // whole vulnerability. Asserting the exact set means adding one is a
  // deliberate edit here rather than something a client can do at runtime.
  it("exposes exactly the four converters", () => {
    expect([...WARMUP_KEYS].sort()).toEqual([
      "excel-to-pdf",
      "pdf-to-word",
      "powerpoint-to-pdf",
      "word-to-pdf",
    ]);
  });

  it("never lets a client-supplied key change the host", () => {
    process.env.WORD_CONVERTER_URL = "https://warytools-word-converter.fly.dev";

    // Traversal and absolute-URL injection both have to fail closed: the key is
    // matched against the allowlist before it is ever used to build a URL.
    for (const key of [
      "../../etc/passwd",
      "https://evil.example",
      "word-to-pdf/../../x",
      "word-to-pdf ",
    ]) {
      expect(warmupTargetFor(key)).toBeNull();
    }
  });
});
