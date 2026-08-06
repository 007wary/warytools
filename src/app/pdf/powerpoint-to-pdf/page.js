import PowerPointToPdfClient from "./PowerPointToPdfClient";
import JsonLd from "@/components/JsonLd";
import FaqSection from "@/components/FaqSection";
import RelatedTools from "@/components/RelatedTools";
import { categories } from "@/lib/tools";
import { jsonLdGraph, toolSoftwareAppJsonLd, breadcrumbJsonLd, faqJsonLd } from "@/lib/jsonLd";
import { colors } from "@/lib/theme";
import { pageMetadata } from "@/lib/pageMetadata";

const title = "PowerPoint to PDF Converter — Free, No Sign-Up";
// Like the two Word converters, this description cannot claim the file stays in
// the browser, so the privacy line is replaced with the honest one. Search
// intent is still served — "free", "no sign-up", "keeps formatting" are the
// terms people actually use for this conversion.
const description =
  "Convert PowerPoint to PDF online, free and without sign-up or watermarks. Keeps your slide layout, fonts, and images exactly as they are.";
const appName = "PowerPoint to PDF";
const href = "/pdf/powerpoint-to-pdf";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

const faqs = [
  {
    question: "Is my presentation uploaded to convert it?",
    answer:
      "Yes. This and the two Word converters are the only three tools on WaryTools that upload anything. Turning a deck into a PDF means running a presentation layout engine — resolving slide masters, theme fonts, placeholders, and embedded charts — which a browser cannot do. Your file is sent to our converter over an encrypted connection, converted, and deleted immediately. It is never stored, logged, or shared. If a deck is confidential, PowerPoint and LibreOffice both export PDFs locally.",
  },
  {
    question: "Will the PDF look exactly like my slides?",
    answer:
      "In almost all cases, yes. The converter runs LibreOffice Impress, which reads PowerPoint files natively and preserves slide layout, images, charts, tables, and colours. Two things don't carry over, because a PDF page is static: animations and slide transitions. The other thing that can shift is fonts — if your deck uses a font the converter doesn't have, it substitutes the closest match, which on a slide can make text sit slightly differently in its box. Standard fonts like Arial, Calibri, and Times New Roman are all handled.",
  },
  {
    question: "How many pages will the PDF have?",
    answer:
      "One page per slide, at your deck's own slide size — so a widescreen 16:9 presentation produces widescreen pages, not letter or A4 ones. Speaker notes are not included; this converts the slides as an audience sees them.",
  },
  {
    question: "Which file types can I convert?",
    answer:
      ".pptx, the format PowerPoint has used since 2007, plus older .ppt files, slideshow saves (.ppsx and .pps), and OpenDocument .odp files from LibreOffice or Google Slides. Legacy .ppt support is worth knowing about — it's exactly the format people still have archived and can no longer open.",
  },
  {
    question: "Does it add a watermark?",
    answer:
      "No. The PDF you download is your presentation and nothing else. There is no watermark, no footer, and no branding added anywhere.",
  },
  {
    question: "Are there any limits?",
    answer:
      "Presentations up to 20 MB, and a few conversions per person every ten minutes. The limits exist because conversion runs on a shared server rather than your own device. 20 MB goes less far here than for a Word file, because a deck is mostly images — if yours is over the limit, PowerPoint's File → Compress Pictures usually brings it well under.",
  },
  {
    question: "Can you convert a PDF back into PowerPoint?",
    answer:
      "Not at the moment, and deliberately so. A PDF page has no concept of a slide, a text placeholder, or a bullet list, so the honest options are to hand back slides that are just full-page images with no editable text, or a mess of overlapping text boxes. Neither is what someone asking for a PowerPoint file actually wants. We'd rather not ship it than ship something that technically produces a .pptx you can't use.",
  },
  {
    question: "Do I need to sign up or pay?",
    answer:
      "No. There is no account, no watermark on the output, and no charge.",
  },
];

export default function PowerPointToPdfPage() {
  const category = categories.find((c) => c.slug === "pdf");

  return (
    <section style={{ maxWidth: "800px", margin: "0 auto", padding: "48px 20px 80px" }}>
      <JsonLd
        data={jsonLdGraph(
          toolSoftwareAppJsonLd({ name: appName, description, href, categorySlug: "pdf" }),
          breadcrumbJsonLd([
            { name: "Home", href: "/" },
            { name: "PDF Tools", href: "/pdf" },
            { name: appName, href },
          ]),
          faqJsonLd(faqs)
        )}
      />
      <h1 style={{ fontSize: "28px", fontWeight: 700, color: colors.text, marginBottom: "12px" }}>
        PowerPoint to PDF Converter
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Turn a presentation into a PDF that opens and looks the same everywhere.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Useful when you need to hand a deck to someone who may not have PowerPoint, attach it to an
        application, or print it without fonts shifting on another machine. You get one page per
        slide, with layout, images, and colours preserved. Accepts .pptx, .ppt, .ppsx, and .odp.
        Like the Word converters, this tool sends your file to our server, because laying out a
        presentation is not something a browser can do; the file is deleted the moment it&apos;s
        converted.
      </p>

      <PowerPointToPdfClient />

      <FaqSection items={faqs} />
      <RelatedTools
        currentHref={href}
        categorySlug="pdf"
        categoryLabel="PDF tools"
        hubHref="/pdf"
        tools={category.tools}
      />
    </section>
  );
}
