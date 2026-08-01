// Central registry of every tool on the site.
// Adding a tool here automatically makes it show up in the navbar,
// the homepage grid, the relevant hub page, and the footer.
//
// `icon` names map to lucide-react components via ToolIcon (see
// src/components/ToolIcon.js) — kept as strings so this file stays
// plain data, importable from server components without pulling in JSX.

export const categories = [
  {
    slug: "pdf",
    label: "PDF Tools",
    hubHref: "/pdf",
    icon: "FileText",
    tools: [
      {
        slug: "merge",
        title: "Merge PDF",
        description: "Combine multiple PDFs into one file.",
        href: "/pdf/merge",
        icon: "Combine",
      },
      {
        slug: "split",
        title: "Split PDF",
        description: "Split a PDF into separate files or extract a page range.",
        href: "/pdf/split",
        icon: "Scissors",
      },
      {
        slug: "compress",
        title: "Compress PDF",
        description: "Reduce the file size of a PDF.",
        href: "/pdf/compress",
        icon: "Minimize2",
      },
      {
        slug: "rotate",
        title: "Rotate PDF",
        description: "Rotate specific pages or the entire document.",
        href: "/pdf/rotate",
        icon: "RotateCw",
      },
      {
        slug: "reorder",
        title: "Reorder PDF Pages",
        description: "Drag and drop to reorder or delete pages.",
        href: "/pdf/reorder",
        icon: "ListOrdered",
      },
    ],
  },
  {
    slug: "image",
    label: "Image Tools",
    hubHref: "/image",
    icon: "Image",
    tools: [
      {
        slug: "compress",
        title: "Compress Image",
        description: "Reduce image file size with a quality slider.",
        href: "/image/compress",
        icon: "Minimize2",
      },
      {
        slug: "resize",
        title: "Resize Image",
        description: "Resize by exact dimensions or percentage.",
        href: "/image/resize",
        icon: "Expand",
      },
      {
        slug: "convert",
        title: "Convert Image",
        description: "Convert between PNG, JPG, and WebP.",
        href: "/image/convert",
        icon: "RefreshCw",
      },
    ],
  },
  {
    slug: "calculators",
    label: "Calculators",
    hubHref: "/calculators",
    icon: "Calculator",
    tools: [
      {
        slug: "age",
        title: "Age Calculator",
        description: "Calculate exact age from a date of birth.",
        href: "/calculators/age",
        icon: "Cake",
      },
      {
        slug: "percentage",
        title: "Percentage Calculator",
        description: "Percentage of a number, percentage change, and more.",
        href: "/calculators/percentage",
        icon: "Percent",
      },
      {
        slug: "gst",
        title: "GST Calculator",
        description: "Add or remove GST using common Indian GST slabs.",
        href: "/calculators/gst",
        icon: "Receipt",
      },
      {
        slug: "interest",
        title: "Interest Calculator",
        description: "Simple interest or compound interest.",
        href: "/calculators/interest",
        icon: "TrendingUp",
      },
      {
        slug: "unit-converter",
        title: "Unit Converter",
        description: "Convert length, weight, and temperature units.",
        href: "/calculators/unit-converter",
        icon: "Ruler",
      },
      {
        slug: "date-difference",
        title: "Date Difference Calculator",
        description: "Days, months, and years between two dates.",
        href: "/calculators/date-difference",
        icon: "CalendarDays",
      },
    ],
  },
  {
    slug: "url-shortener",
    label: "URL Shortener",
    hubHref: "/url-shortener",
    icon: "Link2",
    tools: [
      {
        slug: "url-shortener",
        title: "URL Shortener",
        description: "Shorten a long URL and track clicks.",
        href: "/url-shortener",
        icon: "Link2",
      },
    ],
  },
];

// Flat list of every tool, useful for search/filter on the homepage.
export const allTools = categories.flatMap((category) =>
  category.tools.map((tool) => ({
    ...tool,
    category: category.slug,
    categoryLabel: category.label,
  }))
);
