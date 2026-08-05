import ResizeImageClient from "./ResizeImageClient";
import JsonLd from "@/components/JsonLd";
import FaqSection from "@/components/FaqSection";
import RelatedTools from "@/components/RelatedTools";
import { categories } from "@/lib/tools";
import { jsonLdGraph, toolSoftwareAppJsonLd, breadcrumbJsonLd, faqJsonLd } from "@/lib/jsonLd";
import { colors } from "@/lib/theme";
import { pageMetadata } from "@/lib/pageMetadata";

const title = "Resize Image Online Free";
const description =
  "Resize JPG, PNG, and WebP images by exact pixel dimensions or percentage — free, no sign-up. Runs in your browser, so nothing is uploaded.";
const appName = "Resize Image";
const href = "/image/resize";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

const faqs = [
  {
    question: "Can I resize by exact pixel dimensions?",
    answer: "Yes. Enter exact width and height in pixels, or resize by percentage of the original size instead.",
  },
  {
    question: "Will resizing distort my image?",
    answer:
      "Not if you keep the aspect-ratio lock on — width and height scale together so the image doesn't stretch. You can also unlock it to set a custom width/height.",
  },
  {
    question: "Are my images uploaded anywhere to be resized?",
    answer: "No. Resizing runs locally in your browser using canvas — nothing is uploaded to a server.",
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
          faqJsonLd(faqs)
        )}
      />
      <h1 style={{ fontSize: "28px", fontWeight: 700, color: colors.text, marginBottom: "12px" }}>
        Resize Image Online
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Resize by exact dimensions or by percentage. Everything happens in your browser — files
        are never uploaded anywhere.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Useful for fitting an image to a website&apos;s required dimensions, shrinking a photo before
        sharing it, or scaling a batch of graphics down to a consistent size — all done locally
        with instant preview.
      </p>

      <ResizeImageClient />

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
