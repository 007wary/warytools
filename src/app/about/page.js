import Link from "next/link";
import { ShieldCheck, Zap, EyeOff, Heart } from "lucide-react";
import Logo from "@/components/Logo";
import ToolIcon from "@/components/ToolIcon";
import JsonLd from "@/components/JsonLd";
import { categories, allTools } from "@/lib/tools";
import { colors, categoryColors } from "@/lib/theme";
import { jsonLdGraph, breadcrumbJsonLd } from "@/lib/jsonLd";
import { pageMetadata } from "@/lib/pageMetadata";

// The layout template appends " — WaryTools", so this must not repeat the
// brand or the rendered title reads "About WaryTools — … — WaryTools".
const aboutTitle = "About";
const aboutDescription =
  "WaryTools is a free collection of PDF, image, calculator, and URL tools that run entirely in your browser. No uploads, no accounts, no ads slowing you down.";

export const metadata = pageMetadata({
  title: aboutTitle,
  description: aboutDescription,
  path: "/about",
});

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
      <JsonLd
        data={jsonLdGraph(
          // No organizationJsonLd() here — the root layout already emits the
          // Organization node on every page, so repeating it produced two
          // nodes with the same @id in the graph.
          breadcrumbJsonLd([
            { name: "Home", href: "/" },
            { name: "About", href: "/about" },
          ])
        )}
      />
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
          WaryTools is a focused set of PDF, image, calculator, and URL tools —{" "}
          {allTools.length}{" "}
          and counting — that do the job in your browser tab and nothing more. No account to
          create, no file to upload, no ad to wait out. Just the tool.
        </p>
      </section>

      {/* Story */}
      <section style={{ maxWidth: "720px", margin: "0 auto", padding: "64px 20px" }}>
        <h2 style={{ fontSize: "22px", fontWeight: 700, color: colors.text, marginBottom: "16px" }}>
          Why this exists
        </h2>
        <p style={{ fontSize: "15px", color: colors.textSecondary, lineHeight: 1.75, marginBottom: "16px" }}>
          &ldquo;Free&rdquo; online tools rarely are. You pay with an account you never wanted, a file
          handed to a server you don&rsquo;t control, or a page so buried in ads that finding the tool
          becomes the actual task. WaryTools is the alternative: merge a PDF, resize an image, get
          the answer — none of the toll.
        </p>
        <p style={{ fontSize: "15px", color: colors.textSecondary, lineHeight: 1.75 }}>
          The rule is simple: if the browser can do it, the browser does it — reading a PDF,
          drawing to a canvas, running the math, all on your machine, none of it uploaded. The
          URL shortener breaks that rule by necessity, since a short link is useless unless
          something remembers where it points. That one piece runs on Supabase, nowhere else, and
          exactly what it stores is on the{" "}
          <Link href="/privacy" style={{ color: colors.primary, textDecoration: "underline" }}>
            privacy page
          </Link>
          .
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
