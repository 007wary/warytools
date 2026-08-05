import PdfToWordClient from "./PdfToWordClient";
import JsonLd from "@/components/JsonLd";
import FaqSection from "@/components/FaqSection";
import RelatedTools from "@/components/RelatedTools";
import { categories } from "@/lib/tools";
import { jsonLdGraph, toolSoftwareAppJsonLd, breadcrumbJsonLd, faqJsonLd } from "@/lib/jsonLd";
import { colors } from "@/lib/theme";
import { pageMetadata } from "@/lib/pageMetadata";

const title = "PDF to Word Converter — Free, No Sign-Up";
// Note what this description does NOT claim. Every other tool's copy says the
// file never leaves the browser; here that would be false, so the privacy line
// is replaced with the honest one. Search intent is still served — "free",
// "no sign-up", "editable" are the terms people actually use.
const description =
  "Convert PDF to an editable Word document (.docx) online, free and without sign-up or watermarks. Keeps text, headings, and basic formatting.";
const appName = "PDF to Word";
const href = "/pdf/to-word";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

const faqs = [
  {
    question: "Is my PDF uploaded to convert it?",
    answer:
      "Yes — and this is the only tool on WaryTools that does. Converting to Word means rebuilding paragraphs, headings, and tables from a PDF's positioned text, which no browser can do. Your file is sent to our converter over an encrypted connection, converted, and deleted immediately. It is never stored, logged, or shared. If a document is confidential, use desktop software instead.",
  },
  {
    question: "Will the Word file look exactly like my PDF?",
    answer:
      "Text, headings, bold and italic, and simple tables come through well. Complex layouts — multi-column pages, intricate tables, precisely placed graphics — usually need some tidying up, because a PDF stores where each character sits rather than what it means. No converter, paid or free, avoids this entirely.",
  },
  {
    question: "Can I convert a scanned PDF?",
    answer:
      "No. A scanned PDF is a stack of page images with no text in it, so there is nothing to turn into editable words. The tool detects this and tells you rather than handing back an empty document. You would need OCR software to extract the text first.",
  },
  {
    question: "Are there any limits?",
    answer:
      "PDFs up to 20 MB and 200 pages, and a few conversions per person every ten minutes. The limits exist because conversion runs on a shared server rather than your own device — split a larger document and convert it in parts.",
  },
  {
    question: "Do I need to sign up or pay?",
    answer:
      "No. There is no account, no watermark on the output, and no charge.",
  },
];

export default function PdfToWordPage() {
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
        PDF to Word Converter
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Turn a PDF into an editable .docx you can open in Word, Google Docs, or LibreOffice.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Useful when you need to edit a document you only have as a PDF — a contract, a CV, a
        form. Text, headings, and basic formatting carry over. Unlike the other tools here, this
        one sends your file to our converter, because rebuilding a Word document from a PDF is
        not something a browser can do; the file is deleted the moment it&apos;s converted.
      </p>

      <PdfToWordClient />

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
