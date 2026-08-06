import { Mail, MessageSquareText, Bug } from "lucide-react";
import { colors, categoryColors } from "@/lib/theme";
import JsonLd from "@/components/JsonLd";
import { jsonLdGraph, breadcrumbJsonLd, webPageJsonLd } from "@/lib/jsonLd";
import { pageMetadata } from "@/lib/pageMetadata";
import ContactFormClient from "./ContactFormClient";

const contactTitle = "Contact";
const contactDescription = "Get in touch with WaryTools — report a bug, suggest a tool, or ask a question.";

export const metadata = pageMetadata({
  title: contactTitle,
  description: contactDescription,
  path: "/contact",
});

// No address is published here any more. A mailto: link hands a personal
// inbox to every scraper that reads the page, and it's a dead end for the many
// visitors browsing without a configured desktop mail client — the click
// simply does nothing. The form posts to /api/contact, which sends through
// Resend with the sender's address in Reply-To.

const reasons = [
  {
    icon: Bug,
    title: "Report a bug",
    body: "Something broke, produced a wrong result, or didn't work in your browser.",
    accent: categoryColors.pdf,
  },
  {
    icon: MessageSquareText,
    title: "Suggest a tool",
    body: "A specific task you wish had a free, no-account, browser-based tool.",
    accent: categoryColors.image,
  },
  {
    icon: Mail,
    title: "Anything else",
    body: "Questions about privacy, terms, or how a tool works under the hood.",
    accent: categoryColors.calculators,
  },
];

export default function ContactPage() {
  return (
    <div>
      <JsonLd
        data={jsonLdGraph(
          webPageJsonLd({
            name: `${contactTitle} — WaryTools`,
            description: contactDescription,
            href: "/contact",
            type: "ContactPage",
          }),
          breadcrumbJsonLd([
            { name: "Home", href: "/" },
            { name: "Contact", href: "/contact" },
          ])
        )}
      />
      {/* Hero */}
      <section
        style={{
          textAlign: "center",
          padding: "64px 20px 40px",
          background: `radial-gradient(circle at 20% 0%, ${colors.primarySoft} 0%, transparent 55%), ${colors.surface}`,
        }}
      >
        <h1
          style={{
            fontSize: "clamp(26px, 4.5vw, 38px)",
            fontWeight: 700,
            color: colors.text,
            marginBottom: "14px",
          }}
        >
          Get in touch
        </h1>
        <p style={{ fontSize: "15px", color: colors.textMuted, maxWidth: "540px", margin: "0 auto" }}>
          Bug reports, tool ideas, or anything else — send a message and it goes straight to a
          real inbox, not a ticket queue.
        </p>
      </section>

      {/* Reasons */}
      <section style={{ maxWidth: "1000px", margin: "0 auto", padding: "16px 20px 56px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))",
            gap: "24px",
          }}
        >
          {reasons.map(({ icon: Icon, title, body, accent }) => (
            <div
              key={title}
              style={{
                border: `1px solid ${colors.border}`,
                borderRadius: "14px",
                padding: "28px 20px 20px",
                backgroundColor: colors.surface,
              }}
            >
              <div
                style={{
                  width: "38px",
                  height: "38px",
                  borderRadius: "10px",
                  backgroundColor: accent.bg,
                  color: accent.text,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "18px",
                }}
              >
                <Icon size={19} />
              </div>
              {/* Real headings, not styled divs — as divs these card titles
                  never appeared in a screen reader's heading list. */}
              <h2
                style={{
                  fontWeight: 600,
                  fontSize: "14.5px",
                  color: colors.text,
                  margin: "0 0 6px",
                }}
              >
                {title}
              </h2>
              <p style={{ fontSize: "13px", color: colors.textMuted, lineHeight: 1.55, margin: 0 }}>
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Form */}
      <section style={{ maxWidth: "560px", margin: "0 auto", padding: "0 20px 80px" }}>
        <h2
          style={{
            fontSize: "18px",
            fontWeight: 600,
            color: colors.text,
            margin: "0 0 6px",
          }}
        >
          Send a message
        </h2>
        <p
          style={{
            fontSize: "13.5px",
            color: colors.textMuted,
            margin: "0 0 20px",
            lineHeight: 1.6,
          }}
        >
          We read every message and usually reply within a couple of days.
        </p>

        <ContactFormClient />

        {/* The site's other tools promise that nothing is uploaded, so a form
            that does send data to a server states plainly what it sends and
            what happens to it — the same standard /pdf/to-word is held to. */}
        <p
          style={{
            fontSize: "12.5px",
            color: colors.textFaint,
            marginTop: "16px",
            lineHeight: 1.6,
          }}
        >
          Your name, email, and message are sent to our server and delivered to our inbox by
          email. They aren&rsquo;t stored in a database, used for marketing, or shared with
          anyone. See the{" "}
          <a href="/privacy" className="footer-link" style={{ color: colors.textMuted }}>
            privacy policy
          </a>
          .
        </p>
      </section>
    </div>
  );
}
