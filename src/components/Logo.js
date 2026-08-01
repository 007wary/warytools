import { colors, categoryColors } from "@/lib/theme";

// Minimal mark: a rounded badge with three converging bars, suggesting
// several distinct tools (varied lengths) resolving into one place.
// Pure SVG (no raster assets) so it stays crisp at any size and can pick
// up theme colors via the gradient stops below.
export default function Logo({ size = 28 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="logo-grad" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={colors.primary} />
          <stop offset="100%" stopColor={categoryColors.image.text} />
        </linearGradient>
      </defs>
      <rect width="28" height="28" rx="8" fill="url(#logo-grad)" />
      <rect x="7" y="8" width="4" height="12" rx="2" fill="white" fillOpacity="0.95" />
      <rect x="12" y="12" width="4" height="8" rx="2" fill="white" fillOpacity="0.8" />
      <rect x="17" y="15" width="4" height="5" rx="2" fill="white" fillOpacity="0.65" />
    </svg>
  );
}
