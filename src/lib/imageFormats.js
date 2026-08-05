"use client";

import { useEffect, useState } from "react";

// Which output formats this browser can actually encode.
//
// Offering a format the browser can't produce is worse than not offering it:
// canvas encoders don't throw on an unsupported type, they silently fall back
// to PNG. The user then downloads "photo.avif" containing PNG bytes, which
// most software will refuse to open. Detecting support up front means the
// option simply isn't shown.
//
// AVIF is worth the trouble — it's typically 30-50% smaller than JPG at
// equivalent quality and is now supported for encoding in current Chrome,
// Edge, Firefox and Safari.

export const ALL_FORMATS = [
  {
    mimeType: "image/jpeg",
    label: "JPG",
    extension: "jpg",
    lossy: true,
    note: "Universal support. Best for photos when compatibility matters most.",
  },
  {
    mimeType: "image/png",
    label: "PNG",
    extension: "png",
    lossy: false,
    note: "Lossless, keeps transparency. Best for graphics, screenshots and logos.",
  },
  {
    mimeType: "image/webp",
    label: "WebP",
    extension: "webp",
    lossy: true,
    note: "Smaller than JPG at the same quality, and keeps transparency.",
  },
  {
    mimeType: "image/avif",
    label: "AVIF",
    extension: "avif",
    lossy: true,
    note: "Smallest files of the four, with transparency. Slower to encode.",
  },
];

// JPG and PNG are required of every browser by the canvas spec, so they never
// need probing and are always available even before detection resolves.
const ALWAYS_SUPPORTED = new Set(["image/jpeg", "image/png"]);

/**
 * Probes whether the browser can encode a mime type.
 *
 * Encodes a 1x1 canvas and checks the type of what comes back — the only
 * reliable test, since an unsupported type produces a PNG rather than an
 * error.
 *
 * @param {string} mimeType
 * @returns {Promise<boolean>}
 */
export async function canEncode(mimeType) {
  if (ALWAYS_SUPPORTED.has(mimeType)) return true;
  if (typeof document === "undefined") return false;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;

    // OffscreenCanvas.convertToBlob is the modern path and matches what the
    // worker actually uses to encode, so the probe tests the real code path.
    if (typeof OffscreenCanvas !== "undefined") {
      const offscreen = new OffscreenCanvas(1, 1);
      offscreen.getContext("2d").fillRect(0, 0, 1, 1);
      const blob = await offscreen.convertToBlob({ type: mimeType });
      return blob.type === mimeType;
    }

    return await new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(Boolean(blob) && blob.type === mimeType), mimeType);
    });
  } catch {
    return false;
  }
}

/**
 * Returns the formats this browser can encode.
 *
 * Starts with the always-supported pair so the UI has something to render on
 * first paint, then fills in WebP/AVIF once probing resolves. Detection is
 * client-only, so this must not be relied on during SSR.
 */
export function useSupportedFormats() {
  const [formats, setFormats] = useState(() =>
    ALL_FORMATS.filter((f) => ALWAYS_SUPPORTED.has(f.mimeType))
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const results = await Promise.all(
        ALL_FORMATS.map(async (format) => ({
          format,
          supported: await canEncode(format.mimeType),
        }))
      );

      if (cancelled) return;
      setFormats(results.filter((r) => r.supported).map((r) => r.format));
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return formats;
}

/** Looks up a format descriptor by mime type. */
export function findFormat(mimeType) {
  return ALL_FORMATS.find((f) => f.mimeType === mimeType) || ALL_FORMATS[0];
}

/**
 * Picks a sensible default output format for a source image.
 *
 * Converting to the format you already have is a no-op the user didn't ask
 * for, so the default is always something different — but never a *worse*
 * choice: a PNG (likely a graphic with transparency) defaults to WebP rather
 * than JPG, which would flatten its alpha channel.
 */
export function defaultOutputFormat(sourceType, supported) {
  const has = (mime) => supported.some((f) => f.mimeType === mime);

  if (sourceType === "image/png") {
    if (has("image/webp")) return "image/webp";
    return "image/jpeg";
  }

  if (sourceType === "image/jpeg") {
    if (has("image/webp")) return "image/webp";
    return "image/png";
  }

  return has("image/jpeg") ? "image/jpeg" : "image/png";
}
