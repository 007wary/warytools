import SignPdfClient from "./SignPdfClient";
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

// 46 chars with the layout's " — WaryTools" suffix. The earlier
// "…— Draw or Type Your Signature" ran to 62 and was truncated; the dropped
// clause is recovered in the description, where there is room for it.
const title = "Sign PDF Online Free — eSign a PDF";
// Trimmed from 222 chars. Google renders roughly 155, so the old copy was cut
// at "…then drag it into" and lost the privacy claim entirely — which on a tool
// people use for contracts is the single most persuasive thing it had to say.
const description =
  "Sign a PDF online free — draw your signature, type it, or upload a photo, then drag it into place. Runs in your browser, so the document is never uploaded.";
const appName = "Sign PDF";
const href = "/pdf/sign";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

// Rendered by <HowToSteps /> AND emitted as HowTo structured data. Google
// requires the steps to be visible on the page, so these are one source for
// both rather than schema-only markup describing something nobody can see.
const howToName = "How to sign a PDF";
const howToSteps = [
  { name: "Open your PDF", text: "Drag the file onto the drop zone, or click it to browse." },
  { name: "Create your signature", text: "Draw it with a mouse or finger, type it and pick a style, or upload a photo of your signature." },
  { name: "Place it and download", text: "Drag the signature onto the page and resize it, then click Sign PDF and download the signed document." },
];

const faqs = [
  {
    question: "Is this a legally binding signature?",
    answer:
      "It can be, but that depends on your jurisdiction and the document — not on this tool. Most places (the US under the ESIGN Act, the EU under eIDAS, India under the IT Act) recognise a drawn or typed electronic signature for ordinary agreements, and a signature image on a PDF is the same thing you'd produce by printing, signing, and scanning. What it is NOT is a certificate-based digital signature: there is no cryptographic proof of who signed or that the file hasn't been altered since. Some documents — property deeds, wills, certain court filings — require a notary, a witness, or a qualified certificate, and no browser tool can provide those. If the document matters, check what it requires.",
  },
  {
    question: "Does my signature get uploaded anywhere?",
    answer:
      "No. Everything happens in your browser — the PDF, your drawn or typed signature, and any image you upload all stay on your device, and nothing is stored on our servers. Your signature is one of the more sensitive things you own, which is exactly why this tool does no round trip.",
  },
  {
    question: "Can I put my signature on more than one page?",
    answer:
      "Yes. Move to any page, position the signature, and add it again — an initial on every page plus a full signature on the last one is the usual pattern for a contract. The same signature is stored once inside the PDF no matter how many times it appears, so the file doesn't grow with each placement.",
  },
  {
    question: "How do I get the signature exactly where the line is?",
    answer:
      "Drag it. Once placed, drag the signature to move it and drag its bottom-right corner to resize — the height follows your signature's own proportions, so it never comes out stretched. You can also use the arrow keys to nudge it, hold Alt with the arrows to resize, and press Delete to remove it, which makes the whole thing usable without a mouse.",
  },
  {
    question: "Which should I use — draw, type, or upload?",
    answer:
      "Draw is the closest to a real signature, and works well with a finger or stylus on a phone or tablet. Upload is best if you already have a photo or scan of your signature — a PNG with a transparent background is ideal, since a photo on white paper will cover whatever it's placed over. Type is quickest, and honest about what it is: it's your name set in a font, which is fine for internal forms and routine acknowledgements.",
  },
  {
    question: "Can someone remove the signature afterwards?",
    answer:
      "It becomes part of the page's drawing instructions, so it can't be toggled off in a reader — but someone with the right tools can still edit it out, just as they could with any image on a page. This is worth knowing rather than assuming otherwise: the tool places a signature, it doesn't lock the document. Keep your own copy of what you signed.",
  },
  {
    question: "Can I ask someone else to sign a document?",
    answer:
      "Not with this tool, deliberately. Sending a document out for signature is a different product — it needs accounts, email delivery, identity checks, and an audit trail showing who opened and signed what and when, none of which can happen in a browser tab with no server. This tool does the half that genuinely can be done privately on your own device: signing a document yourself.",
  },
  {
    question: "Does it work on rotated or scanned pages?",
    answer:
      "Yes. The signature is drawn onto the page rather than into a text layer, so a scan is fine. Rotated pages are handled properly too — the signature lands where you dragged it and reads the right way up, rather than lying sideways along the page edge.",
  },
  {
    question: "Why can't I type my name in my own script?",
    answer:
      "The typed styles use the fonts built into every PDF reader, which cover Latin letters, digits, and standard punctuation but not Devanagari, CJK, or emoji. Embedding a font that did would add roughly a megabyte to every signed document. If your name isn't in that set, use the Draw tab and sign it in your own hand — which is a better signature anyway.",
  },
];

export default function SignPdfPage() {
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
        Sign a PDF
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Draw your signature with a mouse, finger, or stylus, type it, or upload a photo of it — then
        drag it exactly where it belongs. Everything happens in your browser, so neither the
        document nor your signature is ever uploaded.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Sign as many pages as you need — an initial on each page and a full signature at the end is
        a single pass. This places a signature on the page, the same as printing, signing, and
        scanning would; it is not a certificate-based digital signature, so it carries no
        cryptographic proof of who signed. For most everyday agreements that&rsquo;s exactly what is
        wanted, but it&rsquo;s worth knowing before you send something on.
      </p>

      <SignPdfClient />

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
