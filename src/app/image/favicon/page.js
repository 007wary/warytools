import FaviconGeneratorClient from "./FaviconGeneratorClient";
import JsonLd from "@/components/JsonLd";
import FaqSection from "@/components/FaqSection";
import RelatedTools from "@/components/RelatedTools";
import { categories } from "@/lib/tools";
import { jsonLdGraph, toolSoftwareAppJsonLd, breadcrumbJsonLd, faqJsonLd } from "@/lib/jsonLd";
import { colors } from "@/lib/theme";
import { pageMetadata } from "@/lib/pageMetadata";

// "Favicon generator" is the search, near-universally — people don't search
// "make a website icon". The title leads with it and the description carries
// the two things that differentiate this from the crowded field: the full set
// rather than a lone .ico, and the HTML snippet, which is the part people get
// wrong even when their files are right.
const title = "Favicon Generator — Free ICO & PNG Icon Set";
const description =
  "Generate a complete favicon set free: favicon.ico, PNGs for every size, an Apple touch icon, a web manifest, and the HTML to paste. From a logo or a letter. Nothing uploaded.";
const appName = "Favicon Generator";
const href = "/image/favicon";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

const faqs = [
  {
    question: "What files do I actually need for a favicon?",
    answer:
      "Fewer than most guides claim, but more than one. You need favicon.ico for older browsers and Windows, a couple of PNGs for modern browser tabs, apple-touch-icon.png at 180×180 for iOS home screens, and 192px plus 512px PNGs referenced from a web manifest for Android. This tool generates all of them plus the manifest, so you don't have to work out which of the twenty files older tutorials list are still relevant. Most aren't — the Windows 8 tile tags and the IE-era \"shortcut icon\" relation are both dead, and they're deliberately left out.",
  },
  {
    question: "Where do I put the files?",
    answer:
      "In the root directory of your site, so they sit at yoursite.com/favicon.ico rather than yoursite.com/images/favicon.ico. This trips people up constantly. iOS in particular looks for /apple-touch-icon.png by that exact name and path, so moving it into a subfolder breaks the home-screen icon even if your HTML points at the new location. The zip includes a README repeating this.",
  },
  {
    question: "I uploaded it and my old favicon is still showing.",
    answer:
      "Almost always browser caching, not a mistake in your files. Browsers cache favicons far more aggressively than other assets and will keep showing an old icon — or the blank default — long after the new one is live. Hard-refresh with Ctrl+F5 (Cmd+Shift+R on a Mac), or open the site in a private window, which is the quickest way to see what a first-time visitor actually gets.",
  },
  {
    question: "What size should my source image be?",
    answer:
      "At least 512×512, and square if you can manage it. Everything here is downscaled from your source, so a larger original gives sharper results at every size — and 512 is the largest icon in the set, so anything smaller means enlarging it. If your image isn't square you can choose between fitting the whole thing inside the icon with margin, or filling the square and cropping the overflow.",
  },
  {
    question: "Will my logo be readable at 16 pixels?",
    answer:
      "Often not, and that's why the preview shows a real 16-pixel render rather than a scaled-up one. A detailed logo or a full wordmark turns to mush at tab size. The usual fix is to use just the symbol from your logo, or a single initial — that's what the letter mode is for. Judge it at 16px in the preview above, because that's the size most people will ever see it at.",
  },
  {
    question: "Why does the .ico file contain several sizes?",
    answer:
      "Because Windows picks a different one depending on where the icon appears — 16px in a browser tab, 32px in the taskbar, 48px on the desktop. An .ico holding a single 32×32 image forces the system to scale it for the other two, which looks soft at 48 and muddy at 16. The one generated here contains all three at native resolution.",
  },
  {
    question: "Are my images uploaded anywhere?",
    answer:
      "No. Every icon is rendered in your browser and the zip is assembled on your device — the image never leaves your computer. That's worth knowing here because a logo is often unreleased when someone is building the site around it.",
  },
];

export default function FaviconGeneratorPage() {
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
        Favicon Generator
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Turn a logo — or a single letter — into every icon file a website needs. Drop an image
        below, check how it holds up at 16 pixels, and download the complete set. Free, and
        nothing is uploaded.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        You get favicon.ico with three sizes packed inside it, PNGs for browser tabs, an Apple
        touch icon for iOS home screens, the two Android icons Chrome needs before it will offer
        to install your site, a web manifest, and the HTML to paste into your head.
      </p>

      <FaviconGeneratorClient />

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
