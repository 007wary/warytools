// Central design tokens. These reference the CSS custom properties defined
// in globals.css (light values in :root, dark overrides under
// prefers-color-scheme: dark) rather than hardcoding hex values, so any
// color read from here — inline style, JS logic, wherever — automatically
// follows the OS/browser color-scheme preference along with the rest of
// the site. Category colors give each tool group a distinct identity
// across cards, hub pages, and the nav — everything else stays neutral so
// the color reads as intentional, not noisy.
export const categoryColors = {
  pdf: {
    text: "var(--category-pdf-text)",
    bg: "var(--category-pdf-bg)",
    border: "var(--category-pdf-border)",
  },
  image: {
    text: "var(--category-image-text)",
    bg: "var(--category-image-bg)",
    border: "var(--category-image-border)",
  },
  calculators: {
    text: "var(--category-calculators-text)",
    bg: "var(--category-calculators-bg)",
    border: "var(--category-calculators-border)",
  },
  "url-shortener": {
    text: "var(--category-url-shortener-text)",
    bg: "var(--category-url-shortener-bg)",
    border: "var(--category-url-shortener-border)",
  },
};

export const colors = {
  text: "var(--text)",
  textSecondary: "var(--text-secondary)",
  textMuted: "var(--text-muted)",
  textFaint: "var(--text-faint)",
  border: "var(--border)",
  borderMuted: "var(--border-muted)",
  borderInput: "var(--border-input)",
  surface: "var(--surface)",
  surfaceMuted: "var(--surface-muted)",
  surfaceHover: "var(--surface-hover)",
  primary: "var(--primary)",
  primaryHover: "var(--primary-hover)",
  primarySoft: "var(--primary-soft)",
  primarySoftBorder: "var(--primary-soft-border)",
  primaryDisabled: "var(--primary-disabled)",
  primaryContrast: "var(--primary-contrast)",
  danger: "var(--danger)",
  dangerSoft: "var(--danger-soft)",
  dangerSoftBorder: "var(--danger-soft-border)",
  success: "var(--success)",
  successSoft: "var(--success-soft)",
  successSoftBorder: "var(--success-soft-border)",
  warningText: "var(--warning-text)",
  warningIcon: "var(--warning-icon)",
  warningSoft: "var(--warning-soft)",
  warningSoftBorder: "var(--warning-soft-border)",
};
