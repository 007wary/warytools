import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { colors } from "@/lib/theme";

// The outcome card shared by /newsletter/confirm and /newsletter/unsubscribe.
//
// Both pages are the last step of a journey that started in an email client,
// so each does exactly one thing: say plainly whether it worked, and offer the
// one next step that makes sense. No navigation maze, no "while you're here"
// — someone who just unsubscribed is not a lead to be recaptured, and treating
// them as one is how a clean exit turns into a spam report.
//
// A server component: the work happened in the page's own server code before
// this renders, so there is nothing interactive here.

export default function NewsletterResult({ ok, title, body, action }) {
  const Icon = ok ? CheckCircle2 : XCircle;
  const accent = ok ? colors.success : colors.danger;

  return (
    <div
      style={{
        maxWidth: "520px",
        margin: "0 auto",
        padding: "64px 20px 80px",
        textAlign: "center",
      }}
    >
      <div
        // Announced as well as displayed. The state of this page IS the
        // content — a screen reader user who only hears the heading gets no
        // signal that anything succeeded or failed.
        role="status"
        style={{
          border: `1px solid ${colors.border}`,
          borderRadius: "16px",
          padding: "40px 28px",
          backgroundColor: colors.surface,
        }}
      >
        <Icon
          size={44}
          strokeWidth={1.6}
          color={accent}
          // Decorative: the heading immediately below says the same thing in
          // words, so announcing the icon too would just repeat it.
          aria-hidden="true"
          style={{ marginBottom: "16px" }}
        />

        <h1
          style={{
            margin: "0 0 10px",
            fontSize: "22px",
            fontWeight: 700,
            color: colors.text,
            lineHeight: 1.3,
          }}
        >
          {title}
        </h1>

        <p
          style={{
            margin: 0,
            fontSize: "15px",
            lineHeight: 1.65,
            color: colors.textSecondary,
          }}
        >
          {body}
        </p>

        {action ? (
          <Link
            href={action.href}
            style={{
              display: "inline-block",
              marginTop: "24px",
              padding: "12px 22px",
              borderRadius: "10px",
              backgroundColor: colors.primary,
              color: colors.primaryContrast,
              fontSize: "15px",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            {action.label}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
