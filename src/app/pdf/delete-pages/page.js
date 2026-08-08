import DeletePagesClient from "./DeletePagesClient";
import JsonLd from "@/components/JsonLd";
import FaqSection from "@/components/FaqSection";
import RelatedTools from "@/components/RelatedTools";
import { categories } from "@/lib/tools";
import { jsonLdGraph, toolSoftwareAppJsonLd, breadcrumbJsonLd, faqJsonLd } from "@/lib/jsonLd";
import { colors } from "@/lib/theme";
import { pageMetadata } from "@/lib/pageMetadata";

const title = "Delete Pages from PDF Online Free";
const description =
  "Remove pages from a PDF online, free and without sign-up. Click the pages to delete and download the rest. Runs in your browser — nothing is uploaded.";
const appName = "Delete PDF Pages";
const href = "/pdf/delete-pages";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

const faqs = [
  {
    question: "How do I delete a page from a PDF?",
    answer:
      "Open your PDF, click the pages you want gone (or type their numbers, e.g. 2, 5-7), then download the result. The new PDF contains every page you didn't select, in the original order.",
  },
  {
    question: "Can I delete several pages at once?",
    answer:
      "Yes. Click each page, hold Shift and click to select a whole run, or type a mix of numbers and ranges like 2, 5-7, 12. There's no limit on how many you remove, as long as one page is left.",
  },
  {
    question: "Does this permanently remove the page content?",
    answer:
      "Yes. Unlike cropping — which only hides part of a page — deleting removes the page from the document entirely, so its content is not recoverable from the downloaded file.",
  },
  {
    question: "Can I delete every page?",
    answer:
      "No, and the tool will stop you. A PDF needs at least one page; a zero-page file is something most readers refuse to open, so you'd get a download that looks fine and isn't.",
  },
  {
    question: "Are my files uploaded anywhere?",
    answer:
      "No. Pages are removed entirely in your browser with pdf-lib — the PDF never leaves your device.",
  },
  {
    question: "What's the difference between this and Extract Pages?",
    answer:
      "They're two ends of the same job. Delete Pages keeps everything you don't select; Extract Pages keeps only what you do. Use whichever means fewer clicks for your document.",
  },
];

export default function DeletePagesPage() {
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
        Delete Pages from PDF
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Click the pages you want to remove and download the rest. Everything happens in your
        browser — files are never uploaded anywhere.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Useful for dropping a blank scan, cutting a cover sheet, removing an internal appendix
        before sending a report, or clearing the duplicate pages a scanner fed twice. Select pages
        visually or type their numbers — the pages you don&apos;t pick come back in their original
        order.
      </p>

      <DeletePagesClient />

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
