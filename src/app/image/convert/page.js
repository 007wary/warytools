import ConvertImageClient from "./ConvertImageClient";
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

// Searches here are overwhelmingly for the specific pair ("png to jpg",
// "webp to png") rather than the generic verb, so the title and description
// spell the formats out instead of saying "convert between formats".
//
// "WebP to JPG" earns its place in the title over the generic phrasing: WebP is
// what the web now serves and what people find in their downloads folder unable
// to open, which makes converting *out* of it the highest-intent query of the set.
const title = "Convert Image — PNG to JPG, WebP to JPG & More";
const description =
  "Convert images between PNG, JPG, WebP, and AVIF free — PNG to JPG, WebP to JPG, JPG to WebP and more. Batch convert in your browser, nothing uploaded.";
const appName = "Convert Image";
const href = "/image/convert";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

const howToName = "How to convert an image to another format";
const howToSteps = [
  {
    name: "Add your images",
    text: "Drag your files onto the drop zone, or click it to browse. PNG, JPG, WebP, AVIF, GIF, and BMP are all accepted, and you can convert a whole batch at once.",
  },
  {
    name: "Choose the output format",
    text: "Pick JPG, PNG, WebP, or AVIF. A sensible target is suggested from what you dropped in, and only formats your browser can genuinely encode are offered.",
  },
  {
    name: "Convert and download",
    text: "Click Convert and download the converted image, or the whole batch as a single zip.",
  },
];

const faqs = [
  {
    question: "Which image formats can I convert between?",
    answer:
      "PNG, JPG, WebP, AVIF, GIF, and BMP can all go in. You can save as JPG, PNG, WebP, or AVIF. WebP and AVIF appear as options only when your browser can actually encode them — otherwise you'd get a file whose contents don't match its extension.",
  },
  {
    question: "How do I convert a WebP to JPG or PNG?",
    answer:
      "Drop the WebP in and choose JPG or PNG as the output. This is the most common conversion people need, because sites increasingly serve WebP and some older software still refuses to open it. Choose PNG if the image has a transparent background you want to keep, JPG if it's a photo and you want the smaller file.",
  },
  {
    question: "Why convert a PNG to JPG or WebP?",
    answer:
      "JPG and WebP produce far smaller files than PNG for photographs, which helps with page speed and upload limits. WebP is typically 25-35% smaller than JPG at the same visible quality, and AVIF smaller still. PNG remains the right choice for logos, screenshots, and anything needing transparency or crisp edges.",
  },
  {
    question: "Does converting to JPG lose transparency?",
    answer:
      "Yes. JPG has no transparency channel, so transparent areas are filled with solid white when converting from PNG, WebP, or AVIF. The tool warns you before it happens. Choose PNG, WebP, or AVIF to keep transparency intact.",
  },
  {
    question: "Does converting reduce image quality?",
    answer:
      "Converting to PNG is lossless. Converting to JPG, WebP, or AVIF re-encodes the picture, which is lossy — this tool uses a high quality setting so the difference is invisible in normal viewing. Converting a JPG to PNG will not restore detail already lost; it just stops any further loss.",
  },
  {
    question: "Can I convert HEIC photos from my iPhone?",
    answer:
      "No — no browser can decode HEIC, so no tool that runs on your device can open it. The simplest fix is on the phone: set Camera → Formats to \"Most Compatible\" to shoot JPG, or just share the photo, which makes iOS convert it to JPG automatically.",
  },
  {
    question: "Are my images uploaded to convert them?",
    answer:
      "No. Conversion happens entirely in your browser — the files never leave your device, and there's no sign-up, watermark, or daily limit.",
  },
];

export default function ConvertImagePage() {
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
        Convert Image Online
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Convert PNG to JPG, WebP to JPG, JPG to WebP, WebP to PNG, and every other combination of
        PNG, JPG, WebP, and AVIF. This free online image converter runs entirely in your browser —
        files are never uploaded anywhere, and conversion is effectively instant.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Pick the format your project actually needs — WebP or AVIF for dramatically smaller, faster
        web pages, JPG for universal compatibility, or PNG when transparency matters — and get the
        converted file straight away, with no software to install. GIF and BMP go in too, and a
        whole batch converts in a single pass. Only formats your browser can genuinely encode are
        ever offered, so what you download always matches its extension.
      </p>

      <ConvertImageClient />

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
