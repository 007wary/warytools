import AddPageNumbersClient from "./AddPageNumbersClient";
import JsonLd from "@/components/JsonLd";
import FaqSection from "@/components/FaqSection";
import RelatedTools from "@/components/RelatedTools";
import { categories } from "@/lib/tools";
import { jsonLdGraph, toolSoftwareAppJsonLd, breadcrumbJsonLd, faqJsonLd } from "@/lib/jsonLd";
import { colors } from "@/lib/theme";
import { pageMetadata } from "@/lib/pageMetadata";

const title = "Add Page Numbers to PDF Online Free";
const description =
  "Add page numbers to a PDF online, free and without sign-up. Choose the position, format, and starting page. Runs in your browser, so your file is never uploaded.";
const appName = "Add Page Numbers";
const href = "/pdf/page-numbers";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

const faqs = [
  {
    question: "Can I start numbering on a later page?",
    answer:
      "Yes, and it's two separate settings because they answer different questions. \"Start on page\" is which page gets the first number — set it to 3 to leave a cover and contents page unstamped. \"First number\" is what that page is called, so you can skip two sheets and still have the third one read \"1\".",
  },
  {
    question: "Where can the page number go?",
    answer:
      "Bottom or top, aligned left, centre, or right — six positions in all. You can also pick the margin and text size, and the preview shows exactly where the number lands before you run it.",
  },
  {
    question: "What number formats are available?",
    answer:
      "A plain number (1), \"Page 1\", \"1 / 12\", or \"Page 1 of 12\". The total counts the pages that actually get numbered, so if you start on page 3 of a 20-page file the first stamped page reads \"1 of 18\".",
  },
  {
    question: "Will this work on a scanned or rotated PDF?",
    answer:
      "Yes. The number is drawn onto the page rather than into the text layer, so a scan is fine. Rotated pages are handled too — the number is placed against the page as you see it and turned to match, so it reads the right way up instead of sideways.",
  },
  {
    question: "Does the PDF get uploaded anywhere?",
    answer:
      "No. Page numbers are added entirely in your browser — the file never leaves your device, and nothing is stored on our servers.",
  },
  {
    question: "Can I remove the numbers afterwards?",
    answer:
      "Not with this tool. The numbers become part of each page's content, so keep your original file if you might need an unnumbered copy.",
  },
];

export default function AddPageNumbersPage() {
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
        Add Page Numbers to a PDF
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Stamp page numbers onto any PDF — pick the position, format, and where the count starts.
        Everything happens in your browser, so the file is never uploaded anywhere.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Useful for reports, contracts, and anything printed double-sided, where an unnumbered stack
        of pages is easy to get out of order. Leave a cover page unstamped, start the count wherever
        you need, and see exactly where each number lands before you download.
      </p>

      <AddPageNumbersClient />

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
