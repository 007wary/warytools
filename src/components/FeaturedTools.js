import Link from "next/link";
import ToolIcon from "@/components/ToolIcon";
import { categoryColors, colors } from "@/lib/theme";

// The six promoted tools, rendered as large cards directly under the hero.
//
// Deliberately a different card from <ToolCard>: this one is bigger, carries a
// verb-led action label, and states the privacy position per card. The point
// is that these six should not read as "the first six of thirty-three" — they
// are the answer to "what did you come here to do", and a visitor who wants
// one of them should be one click from it without ever scrolling.
//
// The action label is the searched phrase ("Merge PDF files"), not a generic
// "Open" — the card is doing the job a headline does, naming the task in the
// words someone would have typed.

// Per-tool action copy. Held here rather than in tools.js because the registry
// feeds the navbar, hubs, footer and sitemap, where a verb phrase would read
// oddly; this wording exists only for the hero.
const ACTION_LABELS = {
  "/pdf/merge": "Merge PDF files",
  "/pdf/compress": "Compress a PDF",
  "/image/compress": "Compress an image",
  "/pdf/split": "Split a PDF",
  "/pdf/to-word": "PDF to Word",
  "/image/resize": "Resize an image",
};

// The four document converters upload; everything else does not. Rather than
// hardcode a second list that could drift from the one in tools.js, the card
// reads the tool's own description — every converter's registry description
// deliberately omits the "nothing uploaded" claim, and the honesty rule in
// tools.js says it must stay that way.
const UPLOADS = new Set([
  "/pdf/to-word",
  "/pdf/word-to-pdf",
  "/pdf/powerpoint-to-pdf",
  "/pdf/excel-to-pdf",
]);

export default function FeaturedTools({ tools }) {
  if (!Array.isArray(tools) || tools.length === 0) return null;

  return (
    <section
      aria-labelledby="featured-tools-heading"
      style={{ maxWidth: "1080px", margin: "0 auto", padding: "0 20px 8px" }}
    >
      <h2 id="featured-tools-heading" className="sr-only">
        Most used tools
      </h2>

      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "grid",
          // Wider minimum than the directory grid (260 vs 220): these cards
          // carry an extra line of copy, and at 220 the action label wrapped
          // onto two lines on a narrow laptop.
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "14px",
        }}
      >
        {tools.map((tool) => {
          const accent = categoryColors[tool.category] || categoryColors.pdf;
          const uploads = UPLOADS.has(tool.href);

          return (
            <li key={tool.href}>
              <Link
                href={tool.href}
                className="tool-card group"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  height: "100%",
                  gap: "10px",
                  border: `1px solid ${colors.border}`,
                  borderRadius: "16px",
                  padding: "22px",
                  textDecoration: "none",
                  color: "inherit",
                  backgroundColor: colors.surface,
                }}
              >
                <span
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "12px",
                    backgroundColor: accent.bg,
                    color: accent.text,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ToolIcon name={tool.icon} size={22} aria-hidden="true" />
                </span>

                <span
                  style={{
                    fontWeight: 650,
                    fontSize: "16.5px",
                    color: colors.text,
                    lineHeight: 1.3,
                  }}
                >
                  {ACTION_LABELS[tool.href] || tool.title}
                </span>

                <span
                  style={{
                    fontSize: "13.5px",
                    color: colors.textMuted,
                    lineHeight: 1.55,
                    // Pushes the footer line to the bottom so the privacy
                    // note aligns across cards of differing copy length.
                    flexGrow: 1,
                  }}
                >
                  {tool.description}
                </span>

                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: uploads ? colors.textFaint : accent.text,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  <ToolIcon
                    name={uploads ? "Server" : "ShieldCheck"}
                    size={13}
                    aria-hidden="true"
                  />
                  {uploads ? "Converts on our server" : "Never leaves your device"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
