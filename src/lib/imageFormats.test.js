import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ALL_FORMATS,
  canEncode,
  defaultOutputFormat,
  findFormat,
} from "./imageFormats";

// This module exists because canvas encoders do not throw on an unsupported
// type — they silently return PNG. An unprobed AVIF option therefore hands the
// user a file named ".avif" containing PNG bytes, which most software refuses
// to open, and nothing anywhere reports an error. Every assertion below is
// about that failure mode.
//
// `useSupportedFormats` is a hook and is covered by the component tier; the
// pure functions are tested here.

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Stubs OffscreenCanvas so convertToBlob returns a blob of `returnedType`,
 * mimicking a browser that accepts the call and silently encodes something
 * else. `requested` records what was asked for.
 */
function stubOffscreen(returnedType) {
  const requested = [];
  // canEncode bails out early when there is no `document`, before it ever
  // reaches the OffscreenCanvas branch — so a probe test needs both globals
  // even though only one of them ends up doing the work.
  vi.stubGlobal("document", {
    createElement: () => ({ width: 0, height: 0, toBlob: (cb) => cb(null) }),
  });
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      getContext() {
        return { fillRect: () => {} };
      }
      async convertToBlob({ type }) {
        requested.push(type);
        // The real silent-fallback behaviour: the returned type is whatever
        // the browser actually produced, not what was requested.
        return { type: typeof returnedType === "function" ? returnedType(type) : returnedType };
      }
    }
  );
  return requested;
}

describe("ALL_FORMATS", () => {
  it("declares the four output formats with matching extensions", () => {
    expect(ALL_FORMATS.map((f) => f.mimeType)).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/avif",
    ]);
    expect(ALL_FORMATS.map((f) => f.extension)).toEqual(["jpg", "png", "webp", "avif"]);
  });

  it("marks PNG as the only lossless format", () => {
    // The compressor's quality slider is shown or hidden off this flag, so a
    // wrong value here offers a meaningless control or hides a real one.
    const lossless = ALL_FORMATS.filter((f) => !f.lossy).map((f) => f.mimeType);
    expect(lossless).toEqual(["image/png"]);
  });

  it("gives every format a label and a note for the UI", () => {
    for (const format of ALL_FORMATS) {
      expect(format.label).toBeTruthy();
      expect(format.note).toBeTruthy();
    }
  });
});

describe("canEncode", () => {
  it("returns true for JPEG and PNG without probing at all", async () => {
    // The canvas spec requires both of every browser. Probing them would mean
    // the format list is empty on first paint for no reason.
    const requested = stubOffscreen("image/png");

    expect(await canEncode("image/jpeg")).toBe(true);
    expect(await canEncode("image/png")).toBe(true);
    expect(requested).toEqual([]);
  });

  it("returns true when the browser returns the type that was requested", async () => {
    stubOffscreen((type) => type);
    expect(await canEncode("image/avif")).toBe(true);
  });

  it("returns false when the browser silently falls back to PNG", async () => {
    // The entire reason this module exists. The call SUCCEEDS and yields a
    // blob — only the type reveals that AVIF was never encoded.
    stubOffscreen("image/png");
    expect(await canEncode("image/avif")).toBe(false);
    expect(await canEncode("image/webp")).toBe(false);
  });

  it("returns false when the encoder throws", async () => {
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        getContext() {
          return { fillRect: () => {} };
        }
        async convertToBlob() {
          throw new Error("encoding failed");
        }
      }
    );

    expect(await canEncode("image/avif")).toBe(false);
  });

  it("falls back to canvas.toBlob where OffscreenCanvas is absent", async () => {
    vi.stubGlobal("OffscreenCanvas", undefined);
    vi.stubGlobal("document", {
      createElement: () => ({
        width: 0,
        height: 0,
        toBlob: (callback, type) => callback({ type }),
      }),
    });

    expect(await canEncode("image/webp")).toBe(true);
  });

  it("treats a null blob from toBlob as unsupported rather than throwing", async () => {
    // toBlob yields null under memory pressure and on unsupported types in
    // some browsers. Reading `.type` off null would throw inside the probe.
    vi.stubGlobal("OffscreenCanvas", undefined);
    vi.stubGlobal("document", {
      createElement: () => ({ width: 0, height: 0, toBlob: (callback) => callback(null) }),
    });

    expect(await canEncode("image/webp")).toBe(false);
  });

  it("returns false during SSR, where there is no document", async () => {
    vi.stubGlobal("OffscreenCanvas", undefined);
    vi.stubGlobal("document", undefined);

    // Detection is client-only; the server must not claim support it cannot
    // verify, or the first paint offers an option that vanishes on hydration.
    expect(await canEncode("image/avif")).toBe(false);
  });
});

describe("findFormat", () => {
  it("looks a format up by mime type", () => {
    expect(findFormat("image/webp").label).toBe("WebP");
    expect(findFormat("image/avif").extension).toBe("avif");
  });

  it("falls back to JPG for an unknown type rather than returning undefined", () => {
    // Four clients read `.extension` and `.label` off this result directly, so
    // an undefined return would crash the tool rather than degrade it. A stale
    // format persisted from an older build lands here.
    expect(findFormat("image/heic").mimeType).toBe("image/jpeg");
    expect(findFormat(undefined).mimeType).toBe("image/jpeg");
  });
});

describe("defaultOutputFormat", () => {
  const withWebp = ALL_FORMATS.filter((f) => f.mimeType !== "image/avif");
  const jpegPngOnly = ALL_FORMATS.filter((f) =>
    ["image/jpeg", "image/png"].includes(f.mimeType)
  );

  it("never defaults to the format the file already is", () => {
    // Converting PNG to PNG is a no-op the user did not ask for, and makes the
    // tool look broken when the "converted" file is byte-identical.
    for (const source of ["image/png", "image/jpeg", "image/webp"]) {
      expect(defaultOutputFormat(source, ALL_FORMATS)).not.toBe(source);
    }
  });

  it("sends a PNG to WebP rather than JPG, to preserve transparency", () => {
    // A PNG is likely a graphic with an alpha channel. Defaulting to JPG would
    // flatten it onto a matte, which is unrecoverable and invisible until the
    // user places the image on a non-white background.
    expect(defaultOutputFormat("image/png", withWebp)).toBe("image/webp");
  });

  it("falls back to JPG for a PNG only when WebP cannot be encoded", () => {
    expect(defaultOutputFormat("image/png", jpegPngOnly)).toBe("image/jpeg");
  });

  it("sends a JPEG to WebP, or to PNG when WebP is unavailable", () => {
    expect(defaultOutputFormat("image/jpeg", withWebp)).toBe("image/webp");
    expect(defaultOutputFormat("image/jpeg", jpegPngOnly)).toBe("image/png");
  });

  it("defaults any other source to JPG", () => {
    // WebP, AVIF, GIF, BMP: all reach here, and JPG is the universally
    // openable target.
    expect(defaultOutputFormat("image/webp", ALL_FORMATS)).toBe("image/jpeg");
    expect(defaultOutputFormat("image/gif", ALL_FORMATS)).toBe("image/jpeg");
  });

  it("only ever returns a format the browser actually supports", () => {
    // The guarantee that matters: whatever comes back must be encodable, or
    // the user gets a mislabelled file. Checked across every source against
    // every plausible support set.
    const supportSets = [ALL_FORMATS, withWebp, jpegPngOnly];
    const sources = [
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/avif",
      "image/gif",
      "image/bmp",
      undefined,
    ];

    for (const supported of supportSets) {
      for (const source of sources) {
        const chosen = defaultOutputFormat(source, supported);
        expect(supported.some((f) => f.mimeType === chosen)).toBe(true);
      }
    }
  });

  it("still returns an encodable format when the supported list is empty", () => {
    // Reachable on first paint before probing resolves. PNG is required of
    // every browser, so it is safe even when nothing has been probed yet.
    expect(defaultOutputFormat("image/png", [])).toBe("image/jpeg");
    expect(defaultOutputFormat("image/gif", [])).toBe("image/png");
  });
});
