import { AlertTriangle, Info, Lightbulb } from "lucide-react";
import { colors } from "@/lib/theme";

// A highlighted aside inside a post: <Callout type="warning">…</Callout>.
//
// Separate from the site's WarningBanner component, which is a *tool* UI
// element carrying a live caveat about the file someone is about to process.
// This is editorial. Sharing one component would mean a prop threading two
// unrelated meanings through the same markup, and the tool banner's styling
// is deliberately louder than a post aside should be.
const TYPES = {
  note: { icon: Info, color: colors.primary, bg: colors.primarySoft, border: colors.primarySoftBorder },
  tip: { icon: Lightbulb, color: colors.success, bg: colors.successSoft, border: colors.successSoftBorder },
  warning: {
    icon: AlertTriangle,
    color: colors.warningIcon,
    bg: colors.warningSoft,
    border: colors.warningSoftBorder,
  },
};

export default function Callout({ type = "note", children }) {
  const { icon: Icon, color, bg, border } = TYPES[type] || TYPES.note;

  return (
    <aside
      style={{
        display: "flex",
        gap: "12px",
        padding: "14px 16px",
        margin: "24px 0",
        borderRadius: "10px",
        border: `1px solid ${border}`,
        backgroundColor: bg,
      }}
    >
      <Icon size={18} style={{ color, flexShrink: 0, marginTop: "2px" }} aria-hidden="true" />
      {/* Children are MDX paragraphs, which carry their own bottom margin;
          the last-child reset would need a stylesheet, so the container drops
          its own bottom padding instead and lets the paragraph's margin do it. */}
      <div style={{ fontSize: "15px", lineHeight: 1.65, color: colors.textSecondary, minWidth: 0 }}>
        {children}
      </div>
    </aside>
  );
}
