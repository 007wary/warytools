import ReorderPdfClient from "./ReorderPdfClient";
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

// "Rearrange" and "delete pages" are the phrasings people actually search for
// more often than "reorder", so both appear in the description and body copy.
const title = "Reorder & Delete PDF Pages Online Free";
const description =
  "Rearrange, reorder, or delete pages in a PDF by drag and drop — free, no sign-up. Runs in your browser, so your file is never uploaded.";
const appName = "Reorder PDF Pages";
const href = "/pdf/reorder";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

// Rendered by <HowToSteps /> AND emitted as HowTo structured data. Google
// requires the steps to be visible on the page, so these are one source for
// both rather than schema-only markup describing something nobody can see.
const howToName = "How to reorder PDF pages";
const howToSteps = [
  { name: "Open your PDF", text: "Drag the file onto the drop zone, or click it to browse." },
  { name: "Rearrange the pages", text: "Drag a page thumbnail to its new position, or grab it with the keyboard using space and the arrow keys." },
  { name: "Save and download", text: "Click Save PDF and download the document in its new page order." },
];

const faqs = [
  {
    question: "How do I reorder pages?",
    answer:
      "Drag a page thumbnail to its new position and the rest shift to make room. What you see on screen is exactly what downloads — no preview to second-guess, no surprises in the saved file.",
  },
  {
    question: "Can I delete pages while reordering?",
    answer:
      "Yes, in the same pass. Remove any page you don't need while dragging the rest into a new order, then save once. If deleting is all you're after, the dedicated Delete Pages tool is quicker.",
  },
  {
    question: "Can I reorder pages without a mouse?",
    answer:
      "Yes, and it's a first-class path rather than an afterthought. Focus a page, press Space to grab it, move it with the arrow keys, and press Space again to drop it — or Escape to cancel and put it back where it was. Drag-and-drop alone would leave the tool unusable with a keyboard or a screen reader.",
  },
  {
    question: "Will bookmarks and form fields survive the reshuffle?",
    answer:
      "Yes. Reordering rebuilds the document, so bookmarks, form fields, named destinations, and the accessibility structure screen readers navigate by are copied across deliberately rather than quietly left behind — which is what makes a reordered file still feel like the original document.",
  },
  {
    question: "Does reordering reduce quality?",
    answer:
      "No. Pages are copied wholesale into their new positions, never re-rendered or re-compressed, so every page comes out pixel-for-pixel identical to the one that went in.",
  },
  {
    question: "Is there a page limit?",
    answer:
      "No hard limit is enforced. Because everything runs in your browser, the practical ceiling is your own device's memory — thumbnails are rendered lazily as you scroll, so even a long document stays responsive.",
  },
];

export default function ReorderPdfPage() {
  const category = categories.find((c) => c.slug === "pdf");

  return (
    <section style={{ maxWidth: "900px", margin: "0 auto", padding: "48px 20px 80px" }}>
      <JsonLd
        data={jsonLdGraph(
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
        Reorder &amp; Delete PDF Pages Online
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Drag and drop to rearrange pages, or delete the ones you don&apos;t need. This free online
        tool reorders PDF pages entirely in your browser — files are never uploaded anywhere.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        See every page as a live thumbnail, drag them into exactly the order you want, and drop
        anything that doesn&apos;t belong — perfect for tidying a scanned document or reassembling
        a report before you send it on. Your bookmarks, form fields, and accessibility structure
        are carried across deliberately, so a reshuffled document arrives whole rather than
        stripped. Prefer the keyboard? Space grabs a page and the arrow keys move it.
      </p>

      <ReorderPdfClient />

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
