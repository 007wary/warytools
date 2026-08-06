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
  // The two converter tools. Both were previously missing from this map while
  // being named in tools.js, so they silently fell back to FileText below and
  // rendered the same glyph as the PDF category header — the failure mode this
  // lookup is designed to survive, and therefore the one that hides.
  FileType2,
  FileOutput,
};

export default function ToolIcon({ name, size = 20, strokeWidth = 1.75, style, ...props }) {
  const Icon = iconMap[name] || FileText;
  return <Icon size={size} strokeWidth={strokeWidth} style={style} {...props} />;
}
