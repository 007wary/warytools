import { Mail, MessageSquareText, Bug } from "lucide-react";
import { colors, categoryColors } from "@/lib/theme";

const contactTitle = "Contact";
const contactDescription = "Get in touch with WaryTools — report a bug, suggest a tool, or ask a question.";

export const metadata = {
  title: contactTitle,
  description: contactDescription,
  alternates: { canonical: "/contact" },
  openGraph: { title: `${contactTitle} — WaryTools`, description: contactDescription },
  twitter: { title: `${contactTitle} — WaryTools`, description: contactDescription },
};

const CONTACT_EMAIL = "007mwnswrangwary@gmail.com";

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
          Bug reports, tool ideas, or anything else — send an email and it goes straight to a
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
              <div style={{ fontWeight: 600, fontSize: "14.5px", color: colors.text, marginBottom: "6px" }}>
                {title}
              </div>
              <div style={{ fontSize: "13px", color: colors.textMuted, lineHeight: 1.55 }}>{body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Email card */}
      <section style={{ maxWidth: "560px", margin: "0 auto", padding: "0 20px 80px" }}>
        <div
          style={{
            border: `1px solid ${colors.border}`,
            borderRadius: "16px",
            padding: "32px",
            backgroundColor: colors.surfaceMuted,
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              backgroundColor: colors.primarySoft,
              color: colors.primary,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
            }}
          >
            <Mail size={22} />
          </div>
          <p style={{ fontSize: "13.5px", color: colors.textMuted, marginBottom: "12px" }}>
            Email us directly at
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="footer-link"
            style={{
              display: "block",
              fontSize: "clamp(15px, 4.5vw, 18px)",
              fontWeight: 600,
              color: colors.text,
              textDecoration: "none",
              wordBreak: "break-word",
            }}
          >
            {CONTACT_EMAIL}
          </a>
          <p style={{ fontSize: "12.5px", color: colors.textFaint, marginTop: "16px" }}>
            We read every message and usually reply within a couple of days.
          </p>
        </div>
      </section>
    </div>
  );
}
