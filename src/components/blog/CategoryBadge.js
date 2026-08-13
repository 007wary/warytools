import { CATEGORIES } from "@/lib/blogFrontmatter";
import { categoryColors } from "@/lib/theme";

// The coloured pill naming a post's category.
//
// Colours are borrowed from the existing per-tool-category palette rather
// than introducing a fifth set of tokens: the site already teaches readers
// that red is PDF, violet is image, cyan is calculators. Reusing three of
// those hues for blog categories keeps the visual vocabulary to one system.
// The mapping is arbitrary but fixed — what matters is that a category always
// reads the same colour, not which colour it is.
const BADGE_COLORS = {
  guide: categoryColors.pdf,
  explainer: categoryColors.image,
  announcement: categoryColors.calculators,
  changelog: categoryColors["url-shortener"],
};

export default function CategoryBadge({ category }) {
  const meta = CATEGORIES[category];
  const accent = BADGE_COLORS[category] || categoryColors.pdf;

  // Frontmatter validation already rejects unknown categories at build time,
  // so this can only fire if BADGE_COLORS falls out of sync with CATEGORIES —
  // in which case the fallback above keeps the page rendering.
  if (!meta) return null;

  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "11.5px",
        fontWeight: 600,
        letterSpacing: "0.03em",
        textTransform: "uppercase",
        color: accent.text,
        backgroundColor: accent.bg,
        border: `1px solid ${accent.border}`,
        borderRadius: "999px",
        padding: "3px 10px",
        // Guards against the badge shrinking in a flex row of metadata.
        flexShrink: 0,
        lineHeight: 1.4,
      }}
    >
      {meta.label}
    </span>
  );
}
