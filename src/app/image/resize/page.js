import ResizeImageClient from "./ResizeImageClient";
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
import PostDownloadPrompt from "@/components/PostDownloadPrompt";

// The long tail here is dominated by a target size — "resize image to 1920x1080",
// "resize to 500x500" — so the title names the pixel-dimensions capability
// rather than just the verb, which is what those queries are looking for.
const title = "Resize Image Online Free — Exact Pixels or %";
const description =
  "Resize JPG, PNG, WebP, and AVIF images to exact pixel dimensions or by percentage — free, no sign-up. Batch resize, aspect ratio locked. Nothing uploaded.";
const appName = "Resize Image";
const href = "/image/resize";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

const howToName = "How to resize an image";
const howToSteps = [
  {
    name: "Add your image",
    text: "Drag a JPG, PNG, WebP, or AVIF onto the drop zone, or click it to browse. Drop several to resize a whole batch at once.",
  },
  {
    name: "Choose a size",
    text: "For a single image, enter the exact width and height in pixels. For a batch, scale by a percentage or fit every image inside a maximum edge like 1920px — both stay relative to each picture, so a mixed set keeps its proportions. Leave the aspect-ratio lock on and nothing stretches.",
  },
  {
    name: "Resize and download",
    text: "Pick your output format, click Resize, and download the result — or the whole batch as a zip.",
  },
];

const faqs = [
  {
    question: "Can I resize to exact pixel dimensions?",
    answer:
      "Yes. Enter the exact width and height you need — 1920×1080, 500×500, or anything else — and the image is resized to precisely that. You can also scale by percentage, or fit images inside a maximum edge, which is the better choice for a batch of mixed sizes.",
  },
  {
    question: "Will resizing distort my image?",
    answer:
      "Not if you keep the aspect-ratio lock on: width and height scale together, so the image never stretches. Unlock it only when you deliberately want to force a shape, since that will squash the picture.",
  },
  {
    question: "Does resizing reduce image quality?",
    answer:
      "Scaling down is handled carefully here — the image is reduced through a series of halving steps rather than one big jump, which is what keeps fine detail smooth instead of jagged. Enlarging is different: no tool can add detail that was never captured, so an upscaled image always looks softer than the original.",
  },
  {
    question: "Can I resize several images at once?",
    answer:
      "Yes. Drop in a folder's worth and scale them by percentage or fit them within a maximum edge — both are relative to each image, so a mixed batch keeps its proportions instead of being forced to identical dimensions. Exact pixel sizes apply to a single image, for that same reason.",
  },
  {
    question: "How do I make an image smaller in file size, not dimensions?",
    answer:
      "Use Compress Image, which re-encodes at the same resolution with an adjustable quality setting. Resizing down reduces file size too — usually by a lot — so for a photo headed to a web page, doing both is the biggest saving available.",
  },
  {
    question: "Are my images uploaded anywhere to be resized?",
    answer:
      "No. Resizing runs entirely in your browser — nothing is uploaded to a server and there's no account to create. The only ceiling is a practical one: files up to 50 MB, and images up to about 16 megapixels, which is what a browser canvas can process reliably.",
  },
];

export default function ResizeImagePage() {
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
        Resize Image Online
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Resize JPG, PNG, WebP, and AVIF images to pixel-exact dimensions or by percentage, with the
        aspect ratio locked so nothing ever stretches. Everything happens in your browser — files
        are never uploaded anywhere.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Hit the exact size a website demands, shrink a photo before sending it, or scale a whole
        batch down to one consistent maximum edge. The quality is the part worth noticing:
        downscaling runs through a stepped halving schedule instead of one abrupt jump, so fine
        detail stays crisp and smooth where most online resizers leave it jagged.
      </p>

      <PostDownloadPrompt>
        <ResizeImageClient />
      </PostDownloadPrompt>

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
