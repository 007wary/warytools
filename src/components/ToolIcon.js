import {
  FileText,
  Image as ImageIcon,
  Calculator,
  Link2,
  Combine,
  Scissors,
  Minimize2,
  RotateCw,
  ListOrdered,
  Expand,
  RefreshCw,
  Cake,
  Percent,
  Receipt,
  TrendingUp,
  Ruler,
  CalendarDays,
  Landmark,
  FileType2,
  FileOutput,
  Presentation,
  Crop,
  Images,
  Hash,
  Droplets,
  PenLine,
} from "lucide-react";

// Resolves the string icon names stored in tools.js to actual lucide
// components, so the registry itself can stay plain data.
const iconMap = {
  FileText,
  Image: ImageIcon,
  Calculator,
  Link2,
  Combine,
  Scissors,
  Minimize2,
  RotateCw,
  ListOrdered,
  Expand,
  RefreshCw,
  Cake,
  Percent,
  Receipt,
  TrendingUp,
  Ruler,
  CalendarDays,
  Landmark,
  // The three converter tools. The first two were previously missing from this
  // map while being named in tools.js, so they silently fell back to FileText
  // below and rendered the same glyph as the PDF category header — the failure
  // mode this lookup is designed to survive, and therefore the one that hides.
  FileType2,
  FileOutput,
  Presentation,
  // Crop PDF and PDF to JPG. JPG to PDF reuses FileText above, which is
  // correct rather than a fallback: a PDF is what it produces.
  Crop,
  Images,
  // Add Page Numbers. Wired in at the same time as the registry entry — a name
  // that isn't in this map renders FileText and looks plausible, which is how
  // three tools shipped with the wrong glyph.
  Hash,
  // Watermark PDF.
  Droplets,
  // Sign PDF.
  PenLine,
};

export default function ToolIcon({ name, size = 20, strokeWidth = 1.75, style, ...props }) {
  const Icon = iconMap[name] || FileText;
  return <Icon size={size} strokeWidth={strokeWidth} style={style} {...props} />;
}
