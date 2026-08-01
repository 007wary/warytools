import Link from "next/link";
import { ShieldCheck, Zap, EyeOff, Heart } from "lucide-react";
import Logo from "@/components/Logo";
import ToolIcon from "@/components/ToolIcon";
import { categories, allTools } from "@/lib/tools";
import { colors, categoryColors } from "@/lib/theme";

export const metadata = {
  title: "About — WaryTools",
  description:
    "WaryTools is a free collection of PDF, image, calculator, and URL tools that run entirely in your browser. No uploads, no accounts, no ads slowing you down.",
};

const principles = [
  {
    icon: EyeOff,
    title: "Private by default",
    body:
      "PDF and image tools process files with pdf-lib and canvas, right in your browser tab. Nothing you drop into a tool is uploaded anywhere — close the tab and it's gone.",
    accent: categoryColors.image,
  },
  {
    icon: Zap,
    title: "Fast, no waiting",
    body:
      "No server round-trip means no upload queue, no processing spinner tied to someone else's server load. Most tools finish before you'd have finished uploading elsewhere.",
    accent: categoryColors.calculators,
  },
  {
    icon: ShieldCheck,
    title: "No account required",
    body:
      "Every tool works the moment you land on it. No sign-up wall, no email capture, no \"create a free account to continue.\" Free means free.",
    accent: categoryColors.pdf,
  },
  {
    icon: Heart,
    title: "Built to be useful",
    body:
      "Each tool exists because a specific task was annoying to do elsewhere — too many steps, too many ads, or paywalled for no reason. WaryTools exists to fix that, one tool at a time.",
    accent: categoryColors["url-shortener"],
  },
];

export default function AboutPage() {
  return (
    <div>
      {/* Hero */}
      <section
        style={{
          textAlign: "center",
          padding: "72px 20px 56px",
          background: `radial-gradient(circle at 15% 10%, ${categoryColors.pdf.bg} 0%, transparent 45%), radial-gradient(circle at 85% 0%, ${categoryColors.image.bg} 0%, transparent 45%), radial-gradient(circle at 50% 100%, ${categoryColors.calculators.bg} 0%, transparent 50%), ${colors.surface}`,
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "24px" }}>
          <Logo size={52} />
        </div>

        <h1
          style={{
            fontSize: "clamp(28px, 5vw, 44px)",
            fontWeight: 700,
            color: colors.text,
            marginBottom: "16px",
            lineHeight: 1.15,
          }}
        >
          Tools that respect
          <br />
          <span
            style={{
              background: `linear-gradient(135deg, ${categoryColors.pdf.text}, ${colors.primary}, ${categoryColors.image.text})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            your time and your files
          </span>
        </h1>

        <p
          style={{
            fontSize: "16px",
            color: colors.textMuted,
            maxWidth: "580px",
            margin: "0 auto",
            lineHeight: 1.6,
          }}
        >
          WaryTools is a small, focused set of PDF, image, calculator, and URL tools —{" "}
          {allTools.length}{" "}
          of them and counting — built to just work, without the sign-ups, uploads, or ads that
          usually come with &ldquo;free online tools.&rdquo;
        </p>
      </section>

      {/* Story */}
      <section style={{ maxWidth: "720px", margin: "0 auto", padding: "64px 20px" }}>
        <h2 style={{ fontSize: "22px", fontWeight: 700, color: colors.text, marginBottom: "16px" }}>
          Why this exists
        </h2>
        <p style={{ fontSize: "15px", color: colors.textSecondary, lineHeight: 1.75, marginBottom: "16px" }}>
          Most &ldquo;free&rdquo; online tools make you pay in other ways: an account you didn&rsquo;t want, a file
          uploaded to a server you don&rsquo;t control, or a page so loaded with ads that finding the
          actual tool becomes the hard part. WaryTools started as a reaction to that — a place to
          merge a PDF or resize an image without any of it.
        </p>
        <p style={{ fontSize: "15px", color: colors.textSecondary, lineHeight: 1.75 }}>
          Wherever the browser can do the job — reading a PDF, drawing to a canvas, doing the
          math — it does. The URL shortener is the one exception, since a short link only works
          if something remembers where it points; that piece runs on Supabase and nothing else,
          detailed on the <Link href="/privacy" style={{ color: colors.primary, textDecoration: "underline" }}>privacy page</Link>.
        </p>
      </section>

      {/* Principles grid */}
      <section style={{ maxWidth: "1000px", margin: "0 auto", padding: "0 20px 72px" }}>
        <h2
          style={{
            fontSize: "22px",
            fontWeight: 700,
            color: colors.text,
            marginBottom: "28px",
            textAlign: "center",
          }}
        >
          What that means in practice
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "20px",
          }}
        >
          {principles.map(({ icon: Icon, title, body, accent }) => (
            <div
              key={title}
              style={{
                border: `1px solid ${colors.border}`,
                borderRadius: "16px",
                padding: "24px",
                backgroundColor: colors.surface,
              }}
            >
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "12px",
                  backgroundColor: accent.bg,
                  color: accent.text,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "16px",
                }}
              >
                <Icon size={22} />
              </div>
              <div style={{ fontWeight: 600, fontSize: "15.5px", color: colors.text, marginBottom: "8px" }}>
                {title}
              </div>
              <div style={{ fontSize: "13.5px", color: colors.textMuted, lineHeight: 1.6 }}>{body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Category showcase */}
      <section
        style={{
          borderTop: `1px solid ${colors.border}`,
          backgroundColor: colors.surfaceMuted,
          padding: "64px 20px",
        }}
      >
        <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
          <h2
            style={{
              fontSize: "22px",
              fontWeight: 700,
              color: colors.text,
              marginBottom: "28px",
              textAlign: "center",
            }}
          >
            Everything on offer today
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "16px",
            }}
          >
            {categories.map((category) => {
              const accent = categoryColors[category.slug];
              return (
                <Link
                  key={category.slug}
                  href={category.hubHref}
                  className="tool-card"
                  style={{
                    display: "block",
                    border: `1px solid ${accent.border}`,
                    borderRadius: "14px",
                    padding: "20px",
                    backgroundColor: colors.surface,
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "10px",
                      backgroundColor: accent.bg,
                      color: accent.text,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: "14px",
                    }}
                  >
                    <ToolIcon name={category.icon} size={18} />
                  </div>
                  <div style={{ fontWeight: 600, fontSize: "15px", color: colors.text, marginBottom: "6px" }}>
                    {category.label}
                  </div>
                  <div style={{ fontSize: "13px", color: colors.textMuted }}>
                    {category.tools.length} tool{category.tools.length === 1 ? "" : "s"}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ textAlign: "center", padding: "64px 20px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 700, color: colors.text, marginBottom: "12px" }}>
          Have a tool you wish existed?
        </h2>
        <p style={{ fontSize: "14.5px", color: colors.textMuted, marginBottom: "24px" }}>
          WaryTools keeps growing based on what&rsquo;s genuinely useful to build next.
        </p>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "12px 24px",
            borderRadius: "10px",
            backgroundColor: colors.primary,
            color: colors.primaryContrast,
            fontWeight: 600,
            fontSize: "14.5px",
            textDecoration: "none",
          }}
        >
          Explore all tools
        </Link>
      </section>
    </div>
  );
}
