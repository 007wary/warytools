// Shared helpers for client-side image tools (compress, resize, convert).

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

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

export const outputFormats = [
  { mimeType: "image/jpeg", label: "JPG", extension: "jpg", supportsQuality: true },
  { mimeType: "image/webp", label: "WebP", extension: "webp", supportsQuality: true },
  { mimeType: "image/png", label: "PNG", extension: "png", supportsQuality: false },
];
