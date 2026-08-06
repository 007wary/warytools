import WatermarkPdfClient from "./WatermarkPdfClient";
import JsonLd from "@/components/JsonLd";
import FaqSection from "@/components/FaqSection";
import RelatedTools from "@/components/RelatedTools";
import { categories } from "@/lib/tools";
import { jsonLdGraph, toolSoftwareAppJsonLd, breadcrumbJsonLd, faqJsonLd } from "@/lib/jsonLd";
import { colors } from "@/lib/theme";
import { pageMetadata } from "@/lib/pageMetadata";

const title = "Watermark PDF Online Free — Text or Image";
const description =
  "Add a text or image watermark to a PDF online, free and without sign-up. Tile it across every page or place a single mark, and set the angle, colour, and opacity. Runs in your browser, so your file is never uploaded.";
const appName = "Watermark PDF";
const href = "/pdf/watermark";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

const faqs = [
  {
    question: "Can I use my own logo as the watermark?",
    answer:
      "Yes. Switch to Image mode and drop in a PNG, JPG, WebP, AVIF, GIF, or BMP. A PNG with a transparent background works best, since the transparency is kept — PDF can only store JPG and PNG internally, so anything else is re-encoded on the way in, choosing PNG wherever transparency could be lost.",
  },
  {
    question: "What's the difference between tiled and single?",
    answer:
      "Tiled repeats the mark across the whole page, which is what you want for a DRAFT or CONFIDENTIAL stamp that should be hard to crop out. Single places one mark in a position you pick — better for a logo in a corner or a signature. Tiled is the default.",
  },
  {
    question: "Why is the watermark diagonal by default?",
    answer:
      "Because nothing in a real document is set at an angle, so a diagonal mark reads unmistakably as an overlay rather than as part of the content. A horizontal watermark is easy to mistake for body text. You can switch to horizontal, vertical, or reverse diagonal.",
  },
  {
    question: "Can I watermark only some of the pages?",
    answer:
      "Yes. Leave the Pages box empty to mark every page, or type a selection like 1-3, 7, 12-15 — the same syntax your print dialog uses. Pages outside the selection are left completely untouched.",
  },
  {
    question: "Can the watermark be removed afterwards?",
    answer:
      "Not easily, but be aware it isn't security. The mark becomes part of each page's drawing instructions, so it can't be toggled off in a reader — but someone determined, with the right tools, can still strip it. It marks a document as confidential or draft; it doesn't protect it. Keep your original if you might need a clean copy.",
  },
  {
    question: "Does it work on rotated or scanned pages?",
    answer:
      "Yes. The mark is drawn onto the page rather than into the text layer, so a scan is fine. Rotated pages are handled properly too — the watermark is placed and turned against the page as you actually see it, so it reads at the same angle throughout the document instead of lying sideways on the rotated pages.",
  },
  {
    question: "Which characters can I use in the text?",
    answer:
      "Latin letters, digits, and standard punctuation, including accented characters and the curly quotes and dashes word processors produce. The built-in watermark font can't draw Devanagari, CJK, or emoji — the tool tells you which character is the problem rather than failing partway through.",
  },
  {
    question: "Does the PDF get uploaded anywhere?",
    answer:
      "No. The watermark is added entirely in your browser — neither the PDF nor your logo image leaves your device, and nothing is stored on our servers.",
  },
];

export default function WatermarkPdfPage() {
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
        Watermark a PDF
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Stamp text or your own logo across a PDF — tiled over every page or placed as a single
        mark. Everything happens in your browser, so neither the document nor your logo is ever
        uploaded.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Useful for marking drafts, labelling confidential documents, and branding anything you send
        on. Pick the angle, colour, opacity, and how densely the mark repeats, choose which pages
        get it, and see the result on the page before you download.
      </p>

      <WatermarkPdfClient />

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
