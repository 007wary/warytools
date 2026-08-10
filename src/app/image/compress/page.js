import CompressImageClient from "./CompressImageClient";
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

// "Compress image" is the head term, but the volume splits hard by format and
// by the goal ("reduce image file size", "compress image to 100kb"). The title
// keeps the head term first and spends its remaining characters on JPG/PNG,
// which are the two formats in almost every long-tail phrasing.
const title = "Compress Image Online Free — JPG, PNG & WebP";
const description =
  "Compress JPG, PNG, WebP, and AVIF images to reduce file size — free, no sign-up. Adjustable quality and batch compression in your browser. Nothing uploaded.";
const appName = "Compress Image";
const href = "/image/compress";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

// Rendered by <HowToSteps /> AND emitted as HowTo structured data. Google
// requires the steps to be visible on the page, so these are one source for
// both rather than schema-only markup describing something nobody can see.
const howToName = "How to compress an image";
const howToSteps = [
  {
    name: "Add your images",
    text: "Drag your JPG, PNG, WebP, or AVIF files onto the drop zone, or click it to browse. You can add as many as you like.",
  },
  {
    name: "Pick a format and quality",
    text: "Choose the output format, then drag the quality slider. Around 70-80% is the sweet spot for photos — smaller files with no visible difference.",
  },
  {
    name: "Compress and download",
    text: "Click Compress, check the before-and-after size on each file, then download the image or the whole batch as a zip.",
  },
];

const faqs = [
  {
    question: "How much can I shrink an image without losing quality?",
    answer:
      "Most photos hold up well down to around 70-80% quality. Use the slider and the before-and-after size shown against each file to find the smallest version that still looks right — a 4 MB photo often lands under 500 KB with no visible difference.",
  },
  {
    question: "What image formats can I compress?",
    answer:
      "JPG, PNG, WebP, AVIF, GIF, and BMP go in, and you can save as JPG, PNG, WebP, or AVIF. AVIF and WebP are only offered when your browser can actually encode them, so you never get a file whose contents don't match its extension.",
  },
  {
    question: "How do I compress an image to a specific file size?",
    answer:
      "Lower the quality slider and watch the size reported against each file after compressing — it updates every run, so you can close in on a target like 100 KB or 2 MB in a couple of tries. Switching from JPG to WebP or AVIF usually gets you 30-50% smaller at the same visible quality, which is often enough on its own.",
  },
  {
    question: "Does compressing an image reduce its dimensions?",
    answer:
      "No. This tool re-encodes at the original resolution, so the pixel dimensions are unchanged — only the file size drops. If you want fewer pixels as well, use Resize Image, which is usually the bigger saving for a photo headed to a web page.",
  },
  {
    question: "Why did my PNG get bigger instead of smaller?",
    answer:
      "PNG is lossless, so re-encoding a photo that started as JPG or WebP as PNG almost always produces a larger file — there's no way to discard detail. For photographs choose JPG, WebP, or AVIF. PNG is the right choice for logos, screenshots, and graphics with sharp edges or transparency.",
  },
  {
    question: "Can I compress several images at once?",
    answer:
      "Yes. Drop in a whole folder's worth, apply one quality setting to all of them, and download the results as a single zip. Files are processed one at a time in the background so a large batch doesn't freeze the page.",
  },
  {
    question: "Are my images uploaded to a server to be compressed?",
    answer:
      "No. Compression happens entirely in your browser — images never leave your device. There's no queue, no account, and no file-size limit beyond what your own device can handle.",
  },
];

export default function CompressImagePage() {
  const category = categories.find((c) => c.slug === "image");

  return (
    <section style={{ maxWidth: "800px", margin: "0 auto", padding: "48px 20px 80px" }}>
      <JsonLd
        data={jsonLdGraph(
          toolSoftwareAppJsonLd({ name: appName, description, href, categorySlug: "image" }),
          breadcrumbJsonLd([
            { name: "Home", href: "/" },
            { name: "Image Tools", href: "/image" },
            { name: appName, href },
          ]),
          howToJsonLd({ name: howToName, steps: howToSteps, href }),
          faqJsonLd(faqs)
        )}
      />
      <h1 style={{ fontSize: "28px", fontWeight: 700, color: colors.text, marginBottom: "12px" }}>
        Compress Image Online
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Reduce the file size of your JPG, PNG, WebP, and AVIF images with an adjustable quality
        slider. Everything happens in your browser — files are never uploaded anywhere.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Great for getting a photo under an email or upload limit, and for speeding up a page full
        of images. Compress a whole batch with one setting, compare the before-and-after size on
        every file, and download them together as a zip — no account, no watermark, no queue.
      </p>

      <CompressImageClient />

      <HowToSteps title={howToName} steps={howToSteps} />
      <FaqSection items={faqs} />
      <RelatedTools
        currentHref={href}
        categorySlug="image"
        categoryLabel="image tools"
        hubHref="/image"
        tools={category.tools}
      />
    </section>
  );
}
