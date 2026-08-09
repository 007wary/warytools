import RotatePdfClient from "./RotatePdfClient";
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

const title = "Rotate PDF Pages Online Free";
const description =
  "Rotate individual pages or an entire PDF online, free and without sign-up. Runs in your browser, so your document is never uploaded anywhere.";
const appName = "Rotate PDF";
const href = "/pdf/rotate";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

// Rendered by <HowToSteps /> AND emitted as HowTo structured data. Google
// requires the steps to be visible on the page, so these are one source for
// both rather than schema-only markup describing something nobody can see.
const howToName = "How to rotate PDF pages";
const howToSteps = [
  { name: "Open your PDF", text: "Drag the file onto the drop zone, or click it to browse." },
  { name: "Turn the pages you need", text: "Rotate a single page with the buttons on its thumbnail, or rotate every page at once." },
  { name: "Save and download", text: "Click Rotate PDF and download the document with the new orientation applied." },
];

const faqs = [
  {
    question: "Can I rotate just one page instead of the whole document?",
    answer: "Yes. Select individual pages to rotate, or apply a rotation to every page in the document at once.",
  },
  {
    question: "What rotation angles are supported?",
    answer: "Pages rotate in 90° steps — 90°, 180°, or 270° — enough to fix any sideways or upside-down scan.",
  },
  {
    question: "Will rotating affect the PDF's quality?",
    answer: "No. Rotation only changes the page orientation metadata; the underlying content isn't re-rendered or compressed.",
  },
];

export default function RotatePdfPage() {
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
          faqJsonLd(faqs),
          howToJsonLd({ name: howToName, steps: howToSteps, href })
        )}
      />
      <h1 style={{ fontSize: "28px", fontWeight: 700, color: colors.text, marginBottom: "12px" }}>
        Rotate PDF Pages Online
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Rotate individual pages or the whole document in 90° steps. Everything happens in your
        browser — files are never uploaded anywhere.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Fixes the common case of a scanned document coming out sideways or upside-down. Pick a
        page (or all of them), rotate to the correct orientation, and download — no scanning
        app or desktop software required.
      </p>

      <RotatePdfClient />

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
