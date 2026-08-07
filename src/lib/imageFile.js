// Shared helpers for client-side image tools (compress, resize, convert,
// watermark).

// Re-exported so the image tools can keep importing it from here alongside
// loadImage/canvasToBlob; the implementation is shared with the PDF
// compressor and lives in formatBytes.js.
export { formatBytes } from "./formatBytes";

// Loads a File/Blob into an HTMLImageElement.
export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load this image."));
    };
    img.src = url;
  });
}

// Draws an image onto a canvas at the given size and returns a Blob.
export function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode image."))),
      mimeType,
      quality
    );
  });
}

// Full-resolution phone photos (8000px+ on a side) are slow to draw/encode
// and can spike memory enough to crash the tab on low-end devices. Caps the
// longest edge for canvas work that doesn't have an explicit target size
// (i.e. compress, which re-encodes at the source resolution by default).
export const MAX_CANVAS_EDGE = 4096;

export function getCappedDimensions(width, height, maxEdge = MAX_CANVAS_EDGE) {
  const longestEdge = Math.max(width, height);
  if (longestEdge <= maxEdge) return { width, height, capped: false };

  const scale = maxEdge / longestEdge;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    capped: true,
  };
}

export const outputFormats = [
  { mimeType: "image/jpeg", label: "JPG", extension: "jpg", supportsQuality: true },
  { mimeType: "image/webp", label: "WebP", extension: "webp", supportsQuality: true },
  { mimeType: "image/png", label: "PNG", extension: "png", supportsQuality: false },
];
