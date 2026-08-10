import CompressPdfClient from "./CompressPdfClient";
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

const title = "Compress PDF Online Free";
// Deliberately promises a *lossless* rebuild rather than a size percentage.
// This tool does structural optimisation only (pdf-lib cannot re-encode
// embedded images), so "reduce file size" has to be paired with the thing that
// is actually remarkable about it: nothing is degraded to get there.
const description =
  "Shrink a PDF without touching a single pixel — free, no sign-up, no watermarks. Lossless compression runs in your browser, so your file is never uploaded.";
const appName = "Compress PDF";
const href = "/pdf/compress";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

// Rendered by <HowToSteps /> AND emitted as HowTo structured data. Google
// requires the steps to be visible on the page, so these are one source for
// both rather than schema-only markup describing something nobody can see.
const howToName = "How to compress a PDF";
const howToSteps = [
  { name: "Open your PDF", text: "Drag the file onto the drop zone, or click it to browse." },
  { name: "Compress it", text: "Click Compress PDF. The document is rebuilt to drop redundant objects and pack its cross-reference data." },
  { name: "Check the saving and download", text: "The new size is shown next to the original, so you know exactly what you saved before you download anything." },
];

// These three answers are the honest version, and they replace copy that
// claimed images were "re-encoded at a lower quality/resolution". That was
// never true — the worker calls pdf.save({ useObjectStreams: true }) and
// pdf-lib cannot recompress an embedded image at all. The client's own
// WarningBanner already said so, so the page was contradicting the tool
// standing directly beneath it. Overpromising here is worse than in most copy:
// someone compressing a 40 MB scan would have been told to expect the biggest
// saving of anyone, and is precisely the person who gets almost none.
const faqs = [
  {
    question: "How much smaller will my PDF get?",
    answer:
      "It depends entirely on what's inside. Text and vector-heavy PDFs — reports, invoices, exports from Word or LaTeX — often shed a satisfying chunk, because those are the files that accumulate the most redundant structure. Scanned and photo-heavy PDFs barely move, since almost all of their bulk is already-compressed image data. The tool shows you the before and after side by side, so you never have to guess.",
  },
  {
    question: "Does compressing reduce quality?",
    answer:
      "Not in the slightest, and that's the whole point of this one. Nothing is re-rendered, re-sampled, or re-encoded — every image, glyph, and vector comes through bit-for-bit identical. The saving comes purely from rebuilding the file's internal structure: dropping objects nothing references any more and packing the cross-reference tables. Your PDF gets smaller; your pixels are never touched.",
  },
  {
    question: "Why don't my scanned PDFs shrink much?",
    answer:
      "Because their weight is embedded JPEG data, and shrinking that means re-encoding it at a lower quality — visibly degrading your document. A browser can't do that well, and we'd rather hand you a file that's honestly the same size than one that's quietly blurrier than the one you started with. If you need a scan dramatically smaller, reducing its resolution in a dedicated image tool is the route that actually works.",
  },
  {
    question: "Is my PDF uploaded to compress it?",
    answer: "Never. Compression runs entirely in your browser — the file never leaves your device, so even a confidential document is safe to drop in.",
  },
];

export default function CompressPdfPage() {
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
        Compress PDF Online
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Shrink your PDF without losing a single pixel of quality. Everything happens in your
        browser — files are never uploaded anywhere.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Perfect for slipping a document under an email attachment limit or a stubborn form upload
        cap. The rebuild is completely lossless — redundant objects are stripped and the
        cross-reference data is packed tight, while every image and glyph comes through untouched.
        Text and vector-heavy PDFs shrink the most; scans, already compressed, move very little.
        No account, no watermark, no server round-trip.
      </p>

      <CompressPdfClient />

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
