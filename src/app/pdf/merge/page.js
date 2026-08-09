import MergePdfClient from "./MergePdfClient";
import JsonLd from "@/components/JsonLd";
import FaqSection from "@/components/FaqSection";
import HowToSteps from "@/components/HowToSteps";
import RelatedTools from "@/components/RelatedTools";
import { categories } from "@/lib/tools";
import {
  jsonLdGraph,
  toolSoftwareAppJsonLd,
  breadcrumbJsonLd,
  faqJsonLd,
  howToJsonLd,
} from "@/lib/jsonLd";
import { colors } from "@/lib/theme";
import { pageMetadata } from "@/lib/pageMetadata";

// Title carries the modifiers people actually search with ("free", "online")
// alongside the head term, and the layout template appends " — WaryTools".
// Descriptions aim for ~120-155 chars so the SERP snippet isn't padded by
// Google from body copy, and lead with the action rather than the brand.
const title = "Merge PDF Files Online Free";
const description =
  "Combine multiple PDF files into one document online, free and without sign-up. Merging runs in your browser — your files are never uploaded.";
const appName = "Merge PDF";
const href = "/pdf/merge";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

// Rendered by <HowToSteps /> AND emitted as HowTo structured data. Google
// requires the steps to be visible on the page, so these are one source for
// both rather than schema-only markup describing something nobody can see.
const howToName = "How to merge PDF files";
const howToSteps = [
  { name: "Add your PDFs", text: "Drag the files onto the drop zone, or click it to browse. You can add as many as you need." },
  { name: "Put them in order", text: "Drag the files into the order you want them combined, or use the arrow buttons." },
  { name: "Merge and download", text: "Click Merge PDFs and download the single combined document." },
];

const faqs = [
  {
    question: "Is it safe to merge PDFs with sensitive information here?",
    answer:
      "Yes. Merging happens entirely in your browser using pdf-lib — your files are never uploaded to a server, so nothing leaves your device.",
  },
  {
    question: "Can I choose the order the PDFs are combined in?",
    answer: "Yes. Drag and drop the files into the order you want before merging; the output follows that order.",
  },
  {
    question: "Is there a limit on file size or number of PDFs?",
    answer:
      "There's no hard limit enforced by the tool, but very large files or a large number of PDFs are limited by your device's memory since everything runs client-side.",
  },
];

export default function MergePdfPage() {
  const category = categories.find((c) => c.slug === "pdf");

  return (
    <section style={{ maxWidth: "800px", margin: "0 auto", padding: "48px 20px 80px" }}>
      <JsonLd
        data={jsonLdGraph(
          // `name` stays the plain product name ("Merge PDF"), not the
          // keyword-bearing <title> — SoftwareApplication.name and the
          // breadcrumb leaf should read as labels, not search snippets.
          toolSoftwareAppJsonLd({ name: appName, description, href, categorySlug: "pdf" }),
          breadcrumbJsonLd([
            { name: "Home", href: "/" },
            { name: "PDF Tools", href: "/pdf" },
            { name: appName, href },
          ]),
          faqJsonLd(faqs),
          howToJsonLd({ name: howToName, steps: howToSteps, href })
        )}
      />
      <h1 style={{ fontSize: "28px", fontWeight: 700, color: colors.text, marginBottom: "12px" }}>
        Merge PDF Files Online
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Combine multiple PDF files into a single document — free, with no sign-up and no
        watermark. Reorder them however you like before merging. Everything happens in your
        browser, so files are never uploaded anywhere.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Drop in as many PDFs as you need, drag them into the order you want, and download a
        single combined file. Because merging runs locally using pdf-lib, it works offline once
        the page has loaded and nothing about your documents is ever sent anywhere.
      </p>

      <MergePdfClient />

      <HowToSteps title={howToName} steps={howToSteps} />

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
