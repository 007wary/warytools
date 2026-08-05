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
};

export default function ToolIcon({ name, size = 20, strokeWidth = 1.75, style, ...props }) {
  const Icon = iconMap[name] || FileText;
  return <Icon size={size} strokeWidth={strokeWidth} style={style} {...props} />;
}
