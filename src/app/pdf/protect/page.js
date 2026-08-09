import ProtectPdfClient from "./ProtectPdfClient";
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

// 49 chars with the layout's " — WaryTools" suffix, inside the ~60 Google
// renders. The earlier "…— Add a Password to a PDF" ran to 61 and was cut
// mid-phrase, which spends the most valuable pixels in the result on an
// ellipsis. "Password Protect" is also the higher-volume head term than the
// verb "Protect" alone, so it earns the space the trimmed clause freed.
const title = "Password Protect PDF Online Free";
const description =
  "Add a password and encryption to a PDF, free and without sign-up. Runs entirely in your browser — the file and the password are never uploaded.";
const appName = "Protect PDF";
const href = "/pdf/protect";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

// Rendered by <HowToSteps /> AND emitted as HowTo structured data. Google
// requires the steps to be visible on the page, so these are one source for
// both rather than schema-only markup describing something nobody can see.
const howToName = "How to password protect a PDF";
const howToSteps = [
  { name: "Open your PDF", text: "Drag the file onto the drop zone, or click it to browse." },
  { name: "Set a password", text: "Enter the password needed to open the document, and optionally restrict printing, copying, or editing." },
  { name: "Encrypt and download", text: "Click Protect PDF and download the encrypted copy. Keep the original safe — a forgotten password cannot be recovered." },
];

const faqs = [
  {
    question: "What happens if I forget the password?",
    answer:
      "The document cannot be opened again. That is not a limitation of this tool — it is what encryption means. Nobody, including us, can recover it, so keep the original file somewhere safe before you protect a copy.",
  },
  {
    question: "What's the difference between a password and the restrictions?",
    answer:
      "A password encrypts the contents, so the document cannot be read without it. The restrictions — printing, copying, editing, comments — do not encrypt anything; they ask the PDF reader to disable those actions. Most readers honour them, but some ignore them, so treat restrictions as a deterrent rather than a guarantee. A password is the part with real strength behind it.",
  },
  {
    question: "Is my PDF or password uploaded anywhere?",
    answer:
      "No. Both stay on your device. The encryption runs in your browser, so neither the file nor the password you choose is ever sent to a server.",
  },
  {
    question: "Can I change the password on a PDF that already has one?",
    answer:
      "Yes. Choose the file, enter its current password when asked, then set the new one. The old password stops working on the copy you download.",
  },
  {
    question: "Will bookmarks, links, and form fields survive?",
    answer:
      "Yes. Applying protection rebuilds the document, so bookmarks, form fields, named destinations, and the accessibility structure are copied across deliberately rather than left behind.",
  },
  {
    question: "How strong is the encryption?",
    answer:
      "The PDF standard security handler is used, which is what every PDF reader supports natively — no special software is needed to open the result. As with any password-based encryption, the real strength comes from the password: a short one can be attacked offline no matter how good the cipher is, so a passphrase of several words is worth far more than a short complex one.",
  },
];

export default function ProtectPdfPage() {
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
        Protect PDF
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Add a password to a PDF so it can&apos;t be opened without one. Everything happens in your
        browser — the file and the password never leave your device.
      </p>
      <p
        style={{
          fontSize: "14px",
          color: colors.textSecondary,
          marginBottom: "32px",
          lineHeight: 1.6,
        }}
      >
        You can also restrict printing, copying, and editing. Those restrictions are a request to
        the PDF reader rather than something encryption enforces — a password is the part with real
        strength behind it.
      </p>

      <ProtectPdfClient />

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
