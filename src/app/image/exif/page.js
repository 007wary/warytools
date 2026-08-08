import ExifStripperClient from "./ExifStripperClient";
import JsonLd from "@/components/JsonLd";
import FaqSection from "@/components/FaqSection";
import RelatedTools from "@/components/RelatedTools";
import { categories } from "@/lib/tools";
import { jsonLdGraph, toolSoftwareAppJsonLd, breadcrumbJsonLd, faqJsonLd } from "@/lib/jsonLd";
import { colors } from "@/lib/theme";
import { pageMetadata } from "@/lib/pageMetadata";

// The searches here split three ways — "remove exif data", "remove gps from
// photo", "image metadata remover" — and they are not synonyms to the people
// typing them. The title leads with the format-agnostic verb and the
// description carries the GPS phrasing, which is the highest-intent of the
// three: someone searching it has already decided they have a problem.
const title = "EXIF Stripper — Remove Photo Metadata & GPS";
const description =
  "Remove EXIF, GPS location, and camera metadata from JPG and PNG photos online for free. See exactly what's in your image first. No quality loss, nothing uploaded.";
const appName = "EXIF Stripper";
const href = "/image/exif";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

const faqs = [
  {
    question: "What is EXIF data, and why would I remove it?",
    answer:
      "EXIF is information your camera or phone writes into the image file alongside the picture: the date and time, the camera and lens, the settings used, and — on most phones — the exact GPS coordinates where the photo was taken. That last one is the reason most people strip it. A photo posted from home carries your home address, and nothing on screen shows it.",
  },
  {
    question: "Does removing metadata reduce image quality?",
    answer:
      "No. This tool edits the file's structure directly and deletes only the metadata sections, copying the compressed image data through untouched. The picture is byte-for-byte identical to the original. Most tools that strip metadata do it by re-saving the image, which re-compresses it and loses a little quality every time — this one doesn't.",
  },
  {
    question: "Do social media sites remove EXIF data already?",
    answer:
      "Most large platforms strip it on upload, but you can't rely on that. It doesn't apply to photos sent by email, messaging apps, cloud storage links, or files uploaded to smaller sites and forums — and platform behaviour changes without notice. Removing it yourself before sharing is the only version you control.",
  },
  {
    question: "Which formats does this support?",
    answer:
      "JPG and PNG, which is where metadata almost always lives. Both can be edited without re-compressing them. For WebP, AVIF, GIF, or BMP, use Convert Image instead — re-encoding discards metadata as a side effect, though it does re-compress the picture.",
  },
  {
    question: "What is the colour profile option?",
    answer:
      "An ICC colour profile tells a display how to interpret the image's colours. It's technically metadata, but it holds nothing personal and removing it can visibly shift the colours of a wide-gamut photo — so it's kept by default. Uncheck the box if you want the smallest possible file and don't mind the risk.",
  },
  {
    question: "Are my photos uploaded anywhere?",
    answer:
      "No. Everything happens in your browser — the files never leave your device. That matters more here than on most tools: the whole point is that these images contain information you don't want shared, so uploading them to check would defeat the exercise.",
  },
];

export default function ExifStripperPage() {
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
        Remove EXIF Data From Photos
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Every photo your phone takes carries hidden data alongside the picture — the date, the
        camera, and usually the exact GPS coordinates of where you were standing. Drop an image
        below to see what yours contains, then remove it. Free, and nothing is uploaded.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        This tool deletes the metadata without re-compressing the image, so the picture itself
        comes out byte-for-byte identical — no quality loss, unlike tools that strip metadata by
        re-saving the file. Works on JPG and PNG.
      </p>

      <ExifStripperClient />

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
