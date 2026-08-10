import UnlockPdfClient from "./UnlockPdfClient";
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
import { UNLOCK_SCOPE_NOTE } from "@/lib/pdfEncryption";

const title = "Unlock PDF Online Free — Remove a PDF Password";
const description =
  "Remove a password from a PDF you can already open, free and without sign-up. Runs entirely in your browser — the file and the password are never uploaded.";
const appName = "Unlock PDF";
const href = "/pdf/unlock";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

// The first FAQ is the scope question, deliberately. It is the single thing
// someone arriving from a search for "unlock PDF" most needs answered, and
// burying it below the fold would be a way of not quite saying it.
// Rendered by <HowToSteps /> AND emitted as HowTo structured data. Google
// requires the steps to be visible on the page, so these are one source for
// both rather than schema-only markup describing something nobody can see.
const howToName = "How to remove a password from a PDF";
const howToSteps = [
  { name: "Open your PDF", text: "Drag the file onto the drop zone, or click it to browse." },
  { name: "Enter the password", text: "Type the password you already use to open the document. If the file only carries printing or copying restrictions, no password is needed." },
  { name: "Remove and download", text: "Click Remove password and download the copy that opens without one." },
];

const faqs = [
  {
    question: "Can this open a PDF if I don't know the password?",
    answer:
      "No. This removes encryption from a PDF you can already open, which means you need the password. It cannot recover, guess, or crack a password — a tool that could would defeat the point of PDF encryption entirely. If you've lost the password, the only real options are to ask whoever sent the file or to go back to the original document.",
  },
  {
    question: "My PDF opens fine but won't let me print or copy. Can this help?",
    answer:
      "Yes, and it needs no password. That kind of file carries an owner password, which only asks readers to restrict printing, copying, or editing — the contents were never encrypted against being read, which is why it opens without prompting. Those restrictions can be removed directly.",
  },
  {
    question: "Is my PDF or password uploaded anywhere?",
    answer:
      "No. Both stay on your device. The decryption runs in your browser, so the file and the password you type are never sent to a server.",
  },
  {
    question: "Will bookmarks, links, and form fields survive?",
    answer:
      "Yes. Removing encryption means rebuilding the document, so bookmarks, form fields, named destinations, and the accessibility structure are copied across deliberately rather than left behind.",
  },
  {
    question: "Is it legal to remove a PDF password?",
    answer:
      "That depends on the document and where you are. Removing protection from your own files, or files you have permission to change, is normally fine. Doing it to someone else's document may breach the terms it was shared under or local law. Only use this on documents you have the right to modify.",
  },
];

export default function UnlockPdfPage() {
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
        Unlock PDF
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Strip the password from a PDF you own, so it opens freely every time. Everything happens
        in your browser — the file and the password never leave your device.
      </p>
      {/* The scope note is shared with the client rather than written twice, so
          the promise on the page and the promise beside the button cannot
          drift apart. */}
      <p
        style={{
          fontSize: "14px",
          color: colors.textSecondary,
          marginBottom: "32px",
          lineHeight: 1.6,
        }}
      >
        {UNLOCK_SCOPE_NOTE} If your PDF opens but blocks printing or copying, those restrictions
        can be lifted without a password at all.
      </p>

      <UnlockPdfClient />

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
