import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { categories } from "@/lib/tools";
import { categoryColors, colors } from "@/lib/theme";
import ToolIcon from "./ToolIcon";

// Site footer listing every tool, grouped by category, for SEO and navigation.
export default function Footer() {
  return (
    <footer style={{ borderTop: `1px solid ${colors.border}`, backgroundColor: colors.surfaceMuted, marginTop: "auto" }}>
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "48px 20px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "32px",
        }}
      >
        {categories.map((category) => {
          const accent = categoryColors[category.slug];
          return (
            <div key={category.slug}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontWeight: 600,
                  fontSize: "14px",
                  color: colors.text,
                  marginBottom: "14px",
                }}
              >
                <span
                  style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "7px",
                    backgroundColor: accent.bg,
                    color: accent.text,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ToolIcon name={category.icon} size={13} />
                </span>
                {category.label}
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {category.tools.map((tool) => (
                  <li key={tool.slug} style={{ marginBottom: "8px" }}>
                    <Link
                      href={tool.href}
                      className="hover-primary-text"
                      style={{ fontSize: "13px", color: colors.textMuted, textDecoration: "none" }}
                    >
                      {tool.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <div
        style={{
          borderTop: `1px solid ${colors.border}`,
          padding: "18px 20px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px 20px",
        }}
      >
        <span
          style={{
            fontSize: "13px",
            color: colors.textFaint,
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <ShieldCheck size={14} />
          © {new Date().getFullYear()} WaryTools. All processing happens in your browser.
        </span>
        <nav style={{ display: "flex", gap: "16px" }}>
          <Link href="/about" className="hover-primary-text" style={{ fontSize: "13px", color: colors.textFaint, textDecoration: "none" }}>
            About
          </Link>
          <Link href="/privacy" className="hover-primary-text" style={{ fontSize: "13px", color: colors.textFaint, textDecoration: "none" }}>
            Privacy
          </Link>
          <Link href="/terms" className="hover-primary-text" style={{ fontSize: "13px", color: colors.textFaint, textDecoration: "none" }}>
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}
