import WatermarkImageClient from "./WatermarkImageClient";
import JsonLd from "@/components/JsonLd";
import FaqSection from "@/components/FaqSection";
import RelatedTools from "@/components/RelatedTools";
import { categories } from "@/lib/tools";
import HowToSteps from "@/components/HowToSteps";
import {
  jsonLdGraph,
  toolSoftwareAppJsonLd,
  breadcrumbJsonLd,
  faqJsonLd,
  howToJsonLd,
} from "@/lib/jsonLd";
import { colors } from "@/lib/theme";
import { pageMetadata } from "@/lib/pageMetadata";

// "Add watermark to photo" outranks "watermark images" as a phrasing, and the
// batch capability is the differentiator against the many single-file tools, so
// both go in the title rather than being left to the description.
const title = "Add Watermark to Photos Online Free — Batch";
const description =
  "Add a text or logo watermark to your photos — free, no sign-up. Batch watermark JPG, PNG, WebP, and AVIF with tiling and opacity control. Nothing uploaded.";
const appName = "Watermark Image";
const href = "/image/watermark";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

const howToName = "How to add a watermark to a photo";
const howToSteps = [
  {
    name: "Add your photos",
    text: "Drag your images onto the drop zone, or click it to browse. Drop a whole folder to watermark every photo in one run.",
  },
  {
    name: "Choose text or a logo",
    text: "Type the text you want stamped — a name, a copyright line, or DRAFT — or switch to Logo and drop in a PNG. A transparent PNG works best.",
  },
  {
    name: "Set placement and opacity",
    text: "Pick a single mark in any of nine positions or tile it across the whole image, then set the size, angle, colour, and opacity. The preview updates as you go.",
  },
  {
    name: "Apply and download",
    text: "Click Watermark, then download the finished image or the whole batch as a zip.",
  },
];

const faqs = [
  {
    question: "Are my images uploaded to a server?",
    answer:
      "No. Watermarking happens entirely in your browser — your photos and your logo never leave your device. That also means there's no queue and no file-size limit beyond what your device can handle.",
  },
  {
    question: "Can I watermark several images at once?",
    answer:
      "Yes. Drop in as many as you like and one set of settings is applied to all of them, then you can download the whole batch as a zip. Because sizes are set as a proportion of each image rather than in fixed pixels, a 600px thumbnail and a 6000px photo both get a proportionally identical mark.",
  },
  {
    question: "Will the watermark stop people stealing my photos?",
    answer:
      "It deters casual reuse and makes the source obvious wherever the image is shared, which is what most people actually want. But a visible watermark can be cropped or edited out, so it is not copyright protection or invisible forensic marking. For work that genuinely matters, keep your originals and register the copyright.",
  },
  {
    question: "Why is there an outline around the watermark text?",
    answer:
      "So it stays readable over a real photograph. Plain white text disappears over a bright sky and plain black text disappears in shadow, which means a watermark that looks fine in the preview can vanish on half your images. Every colour is drawn with a contrasting outline, the same technique used for subtitles and photo credits.",
  },
  {
    question: "Can I use my own logo instead of text?",
    answer:
      "Yes — switch to Logo and drop in a PNG, JPG, or WebP. A PNG with a transparent background works best, because transparency is preserved rather than being flattened onto a white box.",
  },
  {
    question: "Can I tile the watermark across the whole image?",
    answer:
      "Yes. Switch the layout to Tiled and the mark repeats across the entire photo at your chosen density, which is much harder to crop out than a single corner mark. For a single mark you get a full nine-position grid — the corners, the edges, and the centre.",
  },
  {
    question: "How do I make the watermark less obtrusive?",
    answer:
      "Lower the opacity. Faint or Light keeps the credit legible without competing with the photo, which is what most people want for an attribution line. Strong and Solid suit a DRAFT or PROOF stamp that's meant to be impossible to ignore.",
  },
  {
    question: "Does watermarking reduce my image quality?",
    answer:
      "The mark is drawn at full resolution, so the image itself isn't resized or resampled. If you export as JPG or WebP the file is re-encoded, which is lossy — use the quality slider to control that, or choose PNG for a lossless result.",
  },
];

export default function WatermarkImagePage() {
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
        Add a Watermark to Your Photos
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Stamp your name, a copyright line, or your logo across your photos — a single mark in any
        of nine positions, or tiled edge to edge at any angle you like. Everything happens in your
        browser, so your images and your logo are never uploaded.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Watermark a whole folder in one run and every image gets a perfectly consistent mark, sized
        as a proportion of its own dimensions rather than a fixed pixel size — so a 600px thumbnail
        and a 6000px photo come out looking identical. Every text mark carries a contrasting
        outline, the same trick subtitles use, so your credit stays legible over bright skies and
        deep shadow alike instead of vanishing on half the batch.
      </p>

      <WatermarkImageClient />

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
