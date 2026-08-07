// Central registry of every tool on the site.
// Adding a tool here automatically makes it show up in the navbar,
// the homepage grid, the relevant hub page, and the footer.
//
// `icon` names map to lucide-react components via ToolIcon (see
// src/components/ToolIcon.js) — kept as strings so this file stays
// plain data, importable from server components without pulling in JSX.
//
// `description` is user-facing copy AND indexable text: it renders in every
// ToolCard (homepage grid + hub pages) and feeds the CollectionPage ItemList
// JSON-LD, so it is the bulk of the homepage's crawlable prose. Keep them
// ~70-95 chars — long enough to carry the intent keywords people search with
// ("free", "online", the file formats), short enough to stay scannable at the
// 13.5px card size. Per-page <title>/description live in each page.js and are
// tuned separately for SERP truncation limits.

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
        description: "Combine multiple PDF files into one document online, free and private.",
        href: "/pdf/merge",
        icon: "Combine",
      },
      {
        slug: "split",
        title: "Split PDF",
        description: "Split a PDF into separate files or extract a page range — free, no upload.",
        href: "/pdf/split",
        icon: "Scissors",
      },
      {
        slug: "compress",
        title: "Compress PDF",
        description: "Reduce PDF file size online for free, without watermarks or sign-up.",
        href: "/pdf/compress",
        icon: "Minimize2",
      },
      {
        slug: "rotate",
        title: "Rotate PDF",
        description: "Rotate individual pages or an entire PDF online, free and in your browser.",
        href: "/pdf/rotate",
        icon: "RotateCw",
      },
      {
        slug: "reorder",
        title: "Reorder PDF Pages",
        description: "Rearrange or delete PDF pages by drag and drop — free, nothing uploaded.",
        href: "/pdf/reorder",
        icon: "ListOrdered",
      },
      {
        slug: "crop",
        title: "Crop PDF",
        description: "Crop PDF margins and borders by dragging a region — free, nothing uploaded.",
        href: "/pdf/crop",
        icon: "Crop",
      },
      {
        slug: "page-numbers",
        title: "Add Page Numbers",
        description: "Add page numbers to a PDF — pick position, format, and start page. Free.",
        href: "/pdf/page-numbers",
        icon: "Hash",
      },
      {
        slug: "watermark",
        title: "Watermark PDF",
        description: "Add a text or image watermark to a PDF — tiled or single, free and private.",
        href: "/pdf/watermark",
        icon: "Droplets",
      },
      {
        slug: "sign",
        title: "Sign PDF",
        description: "Draw, type, or upload your signature and place it on a PDF — free, private.",
        href: "/pdf/sign",
        icon: "PenLine",
      },
      {
        // Deliberately worded as "remove a password you have" rather than
        // "unlock". Every competitor's copy here implies recovery, and someone
        // arriving with a PDF they're locked out of should learn in the
        // description that this isn't that tool — not after uploading it.
        slug: "unlock",
        title: "Unlock PDF",
        description: "Remove a password you know from a PDF — free, nothing uploaded.",
        href: "/pdf/unlock",
        icon: "LockKeyholeOpen",
      },
      {
        slug: "protect",
        title: "Protect PDF",
        description: "Password-protect a PDF with AES encryption — free, nothing uploaded.",
        href: "/pdf/protect",
        icon: "LockKeyhole",
      },
      {
        slug: "to-jpg",
        title: "PDF to JPG",
        description: "Convert PDF pages to JPG or PNG images at 72, 150, or 300 DPI — free.",
        href: "/pdf/to-jpg",
        icon: "Images",
      },
      {
        // Sits next to its counterpart PDF to JPG rather than under Image
        // Tools: the output is a PDF, and someone hunting for it is thinking
        // about the document they want, not the files they happen to hold.
        // The href follows the same <source>-to-pdf shape as word-to-pdf and
        // powerpoint-to-pdf.
        slug: "jpg-to-pdf",
        title: "JPG to PDF",
        description: "Convert JPG, PNG, and WebP images into one PDF — free, nothing uploaded.",
        href: "/pdf/jpg-to-pdf",
        icon: "FileText",
      },
      {
        slug: "to-word",
        // The only tool description here that can't say "nothing uploaded" —
        // this one converts on a server, because rebuilding a .docx from a
        // PDF's positioned text isn't something a browser can do. The card
        // copy stays honest about that rather than inheriting the site's
        // usual privacy claim.
        title: "PDF to Word",
        description: "Convert PDF to an editable Word .docx online, free with no sign-up.",
        href: "/pdf/to-word",
        icon: "FileType2",
      },
      {
        slug: "word-to-pdf",
        // The second tool here that can't say "nothing uploaded", for the
        // mirror-image reason: laying out a Word document needs a Word layout
        // engine, which a browser doesn't have. Same honesty rule as above.
        title: "Word to PDF",
        description: "Convert Word to PDF online, free — keeps your layout, fonts, and page breaks.",
        href: "/pdf/word-to-pdf",
        icon: "FileOutput",
      },
      {
        slug: "powerpoint-to-pdf",
        // The third tool here that can't say "nothing uploaded", for the same
        // reason as Word to PDF: laying out a presentation needs a presentation
        // layout engine, which a browser doesn't have. Same honesty rule.
        title: "PowerPoint to PDF",
        description: "Convert PowerPoint to PDF online, free — one page per slide, layout intact.",
        href: "/pdf/powerpoint-to-pdf",
        icon: "Presentation",
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
        description: "Compress JPG, PNG, and WebP images free with a live quality slider.",
        href: "/image/compress",
        icon: "Minimize2",
      },
      {
        slug: "resize",
        title: "Resize Image",
        description: "Resize images online by exact pixel dimensions or percentage, for free.",
        href: "/image/resize",
        icon: "Expand",
      },
      {
        slug: "convert",
        title: "Convert Image",
        description: "Convert images free — PNG to JPG, JPG to WebP, WebP to PNG, and more.",
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
        description: "Calculate exact age from a date of birth in years, months, and days.",
        href: "/calculators/age",
        icon: "Cake",
      },
      {
        slug: "percentage",
        title: "Percentage Calculator",
        description: "Free percentage calculator: percent of a number, increase, and decrease.",
        href: "/calculators/percentage",
        icon: "Percent",
      },
      {
        slug: "gst",
        title: "GST Calculator",
        description: "Add or remove GST free using Indian slabs — 5%, 12%, 18%, and 28%.",
        href: "/calculators/gst",
        icon: "Receipt",
      },
      {
        slug: "interest",
        title: "Interest Calculator",
        description: "Free simple and compound interest calculator with interest and totals.",
        href: "/calculators/interest",
        icon: "TrendingUp",
      },
      {
        slug: "emi",
        title: "EMI Calculator",
        description: "Free home, car, and personal loan EMI calculator with full interest breakdown.",
        href: "/calculators/emi",
        icon: "Landmark",
      },
      {
        slug: "unit-converter",
        title: "Unit Converter",
        description: "Convert length, weight, and temperature — cm to inches, kg to lb, °C to °F.",
        href: "/calculators/unit-converter",
        icon: "Ruler",
      },
      {
        slug: "date-difference",
        title: "Date Difference Calculator",
        description: "Count the days, months, and years between two dates, leap years included.",
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
        description: "Shorten long URLs into free short links and track clicks — no account.",
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
