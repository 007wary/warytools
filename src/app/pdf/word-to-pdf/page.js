import WordToPdfClient from "./WordToPdfClient";
import JsonLd from "@/components/JsonLd";
import FaqSection from "@/components/FaqSection";
import RelatedTools from "@/components/RelatedTools";
import { categories } from "@/lib/tools";
import { jsonLdGraph, toolSoftwareAppJsonLd, breadcrumbJsonLd, faqJsonLd } from "@/lib/jsonLd";
import { colors } from "@/lib/theme";
import { pageMetadata } from "@/lib/pageMetadata";

const title = "Word to PDF Converter — Free, No Sign-Up";
// Like PDF to Word, this description cannot claim the file stays in the
// browser, so the privacy line is replaced with the honest one. Search intent
// is still served — "free", "no sign-up", "keeps formatting" are the terms
// people actually use for this conversion.
const description =
  "Convert Word to PDF online, free and without sign-up or watermarks. Keeps your layout, fonts, and page breaks exactly as they are.";
const appName = "Word to PDF";
const href = "/pdf/word-to-pdf";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

const faqs = [
  {
    question: "Is my document uploaded to convert it?",
    answer:
      "Yes. This, PDF to Word, and PowerPoint to PDF are the only three tools on WaryTools that upload anything. Turning a Word file into a PDF means running a Word layout engine — resolving styles, flowing text, breaking tables across pages — which a browser cannot do. Your file is sent to our converter over an encrypted connection, converted, and deleted immediately. It is never stored, logged, or shared. If a document is confidential, Word and LibreOffice both export PDFs locally.",
  },
  {
    question: "Will the PDF look exactly like my document?",
    answer:
      "In almost all cases, yes. The converter runs LibreOffice, which reads Word documents natively and preserves layout, headings, tables, images, headers and footers, and page breaks. The one thing that can shift is fonts: if your document uses a font the converter doesn't have, it substitutes the closest match, which can change where lines break. Standard fonts like Arial, Times New Roman, and Calibri are all handled.",
  },
  {
    question: "Which file types can I convert?",
    answer:
      ".docx, the format Word has used since 2007, plus older .doc files, OpenDocument .odt files from LibreOffice or Google Docs, and .rtf. Legacy .doc support is worth knowing about — it's exactly the format people still have archived and can no longer open.",
  },
  {
    question: "Does it add a watermark?",
    answer:
      "No. The PDF you download is your document and nothing else. There is no watermark, no footer, and no branding added anywhere.",
  },
  {
    question: "Are there any limits?",
    answer:
      "Documents up to 20 MB, and a few conversions per person every ten minutes. The limits exist because conversion runs on a shared server rather than your own device. 20 MB is generous for this format — a Word file is compressed, so even a long report is small unless it's full of high-resolution images.",
  },
  {
    question: "Do I need to sign up or pay?",
    answer:
      "No. There is no account, no watermark on the output, and no charge.",
  },
];

export default function WordToPdfPage() {
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
        Word to PDF Converter
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Turn a Word document into a PDF that looks exactly the same everywhere.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Useful when you need to send something that must not reflow — a CV, an invoice, a signed
        form, a report going to someone who may not have Word. Layout, fonts, tables, and page
        breaks are preserved. Accepts .docx, .doc, .odt, and .rtf. Like PDF to Word, this tool
        sends your file to our converter, because laying out a Word document is not something a
        browser can do; the file is deleted the moment it&apos;s converted.
      </p>

      <WordToPdfClient />

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
