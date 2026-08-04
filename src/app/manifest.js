export default function manifest() {
  return {
    name: "WaryTools — Free Online PDF, Image & Calculator Tools",
    short_name: "WaryTools",
    description:
      "Free online tools for PDF editing, image processing, calculators, and URL shortening. All PDF and image tools run 100% in your browser — no uploads.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    // Chrome's install prompt requires raster 192 and 512 icons; an SVG-only
    // list is not enough to make the banner fire. "maskable" lets Android crop
    // to its own shape without clipping the letters.
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
