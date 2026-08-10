import ExifStripperClient from "./ExifStripperClient";
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

// The searches here split three ways — "remove exif data", "remove gps from
// photo", "image metadata remover" — and they are not synonyms to the people
// typing them. The title leads with the format-agnostic verb and the
// description carries the GPS phrasing, which is the highest-intent of the
// three: someone searching it has already decided they have a problem.
const title = "EXIF Stripper — Remove Photo Metadata & GPS";
const description =
  "Remove EXIF, GPS location, and camera metadata from JPG and PNG photos free. See exactly what your image contains first. No quality loss, nothing uploaded.";
const appName = "EXIF Stripper";
const href = "/image/exif";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

const howToName = "How to remove EXIF data from a photo";
const howToSteps = [
  {
    name: "Add your photos",
    text: "Drag your JPG or PNG files onto the drop zone, or click it to browse. Each one is scanned the moment it lands — there's no separate scan step.",
  },
  {
    name: "See what's inside",
    text: "Every file lists the metadata it carries and how much space it takes, with GPS coordinates flagged separately because that's the one that reveals where you were.",
  },
  {
    name: "Remove it and download",
    text: "Choose whether to keep the colour profile, click Remove metadata, and download the cleaned photo — or the whole batch as a zip.",
  },
];

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
    question: "How do I remove GPS location from a photo?",
    answer:
      "Drop the photo in and the tool tells you straight away whether it carries GPS coordinates, then removes them along with the rest of the metadata. On a phone you can also stop it being recorded in the first place — iPhone: Settings → Privacy & Security → Location Services → Camera → Never. Android: the Camera app's settings, usually under \"Location tags\".",
  },
  {
    question: "How can I check what metadata a photo contains?",
    answer:
      "Just drop it in. The report appears immediately, before you remove anything: every metadata block is listed by type and size, with GPS called out separately. You can look and then walk away without changing the file — seeing what's there is half the point of the tool.",
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
          howToJsonLd({ name: howToName, steps: howToSteps, href }),
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
        This tool deletes the metadata without ever re-compressing the image, so the picture comes
        out byte-for-byte identical to the original — zero quality loss, where most strippers
        quietly re-save the file and degrade it a little every time. Works on JPG and PNG.
      </p>

      <ExifStripperClient />

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
