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
  Sheet,
  Crop,
  Images,
  Hash,
  Droplets,
  PenLine,
  LockKeyholeOpen,
  LockKeyhole,
  FileMinus,
  FileStack,
  ShieldCheck,
  AppWindow,
  Server,
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
  // Excel to PDF, the fourth converter. A grid rather than another document
  // glyph: it is what distinguishes a spreadsheet from the three document
  // formats beside it in the same category.
  Sheet,
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
  // Unlock PDF and Protect PDF. The open/closed pair reads as one feature with
  // two directions at a glance, which is what they are.
  LockKeyholeOpen,
  LockKeyhole,
  // Delete Pages and Extract Pages. A subtraction and a stack: the pair reads
  // as "one page fewer" against "these pages, pulled out", which is the
  // distinction people get wrong between the two tools. Deliberately NOT
  // Scissors — that belongs to Split PDF, and three tools sharing one glyph in
  // the same category is how a grid stops being scannable.
  FileMinus,
  FileStack,
  // EXIF Stripper. A shield rather than an eraser or a scissors: what the tool
  // sells is the state you end up in, not the deletion itself — and it's the
  // only image tool whose output is about safety rather than appearance.
  ShieldCheck,
  // Favicon Generator. A browser window rather than an image or a star: what
  // the tool produces is the thing in the tab, and the window frame is the
  // only glyph here that says "browser" at a glance. Deliberately NOT Image —
  // that reads as another photo editor, which is what this isn't.
  AppWindow,
  // Not a tool icon: used by the homepage's featured cards to mark the four
  // document converters as server-side, opposite ShieldCheck on the tools that
  // stay local. Listed here because ToolIcon falls back to FileText for any
  // unmapped name, so an icon used anywhere on the site has to be registered
  // even when no tools.js entry names it.
  Server,
};

export default function ToolIcon({ name, size = 20, strokeWidth = 1.75, style, ...props }) {
  const Icon = iconMap[name] || FileText;
  return <Icon size={size} strokeWidth={strokeWidth} style={style} {...props} />;
}
