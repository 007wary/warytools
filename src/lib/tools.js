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
        slug: "delete-pages",
        title: "Delete PDF Pages",
        description: "Remove pages from a PDF by clicking them — free, private, no upload.",
        href: "/pdf/delete-pages",
        icon: "FileMinus",
      },
      {
        slug: "extract-pages",
        title: "Extract PDF Pages",
        description: "Pull selected pages out of a PDF into a new file — free, nothing uploaded.",
        href: "/pdf/extract-pages",
        icon: "FileStack",
      },
      {
        slug: "compress",
        title: "Compress PDF",
        description: "Shrink PDF file size losslessly — no quality lost, nothing uploaded.",
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
        // Deliberately does NOT name a cipher. @cantoo/pdf-lib picks the
        // encryption revision from the SOURCE document's header version, not
        // from an option we pass: a 1.4 file gets RC4-128, 1.6/1.7 gets AES-128
        // (AESV2), and only 1.7ext3 gets AES-256. The old copy said "AES
        // encryption" flatly, which is false for any older PDF someone drops in.
        description: "Password-protect a PDF with strong encryption — free, nothing uploaded.",
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
      {
        slug: "excel-to-pdf",
        // The fourth tool here that can't say "nothing uploaded", for the same
        // reason as the other two Office converters: laying out a spreadsheet
        // needs a spreadsheet layout engine, which a browser doesn't have.
        // Same honesty rule.
        //
        // The description leads with columns rather than with speed or
        // formatting, because "it cut off my columns" is how people actually
        // describe the problem this conversion has — see the tool page.
        title: "Excel to PDF",
        description: "Convert Excel to PDF online, free — fits every column on the page.",
        href: "/pdf/excel-to-pdf",
        icon: "Sheet",
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
      {
        // Shares the Droplets icon with Watermark PDF, deliberately: they are
        // the same action on two file types, and a reader scanning the grid
        // should recognise the pair. The icon was already in ToolIcon's map, so
        // unlike most new tools this one needed no fourth edit there.
        slug: "watermark",
        title: "Watermark Image",
        description: "Add a text or logo watermark to photos in bulk — free, nothing uploaded.",
        href: "/image/watermark",
        icon: "Droplets",
      },
      {
        // Under Image Tools because the input is an image and it reuses the
        // image pipeline's validation and decode. The output is arguably a
        // developer asset rather than an image, but a "developer tools"
        // category holding one item reads as unfinished — the same call made
        // for the EXIF Stripper below.
        //
        // The description says "set" and names .ico deliberately: the field is
        // full of generators that hand back a single file, and the whole scope
        // decision here is that a favicon is a set of files plus the markup
        // that wires them up.
        slug: "favicon",
        title: "Favicon Generator",
        description: "Generate a full favicon set — .ico, PNGs, and the HTML — from any image.",
        href: "/image/favicon",
        icon: "AppWindow",
      },
      {
        // Named "EXIF Stripper" rather than "Remove Image Metadata": EXIF is
        // the term people actually search, and the ones who don't know it are
        // served by the description, which leads with "GPS location" — the
        // concrete consequence rather than the format's name.
        //
        // Under Image Tools rather than a privacy category of its own. The
        // input and output are both images, it reuses the whole image
        // pipeline, and a one-tool hub reads as unfinished. Every tool here is
        // private already; making one *category* "privacy" would imply the
        // rest aren't.
        slug: "exif",
        title: "EXIF Stripper",
        description: "Remove GPS location and camera metadata from photos — no quality loss.",
        href: "/image/exif",
        icon: "ShieldCheck",
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
