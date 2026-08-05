// Human-readable file sizes, shared by the image tools and the PDF
// compressor. Lives in its own module rather than imageFile.js because the
// PDF compressor needs it too, and importing a helper called "imageFile"
// from a PDF tool reads as a mistake.

export function formatBytes(bytes) {
  // Guard non-numeric input rather than rendering "NaN MB" into the UI.
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
