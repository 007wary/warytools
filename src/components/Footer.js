import Link from "next/link";
import { categoryColors, colors } from "@/lib/theme";
import Logo from "./Logo";

// Utility footer: brand block plus Company/Legal links. Tool links live in
// the navbar (rendered in the DOM on every page, so crawlers already see
// them) — repeating them here would just be duplication.
export default function Footer() {
  return (
    <footer
      style={{
        borderTop: "2px solid transparent",
        borderImage: `linear-gradient(90deg, ${colors.primary}, ${categoryColors.image.text}) 1`,
        backgroundColor: colors.surfaceMuted,
        marginTop: "auto",
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "48px 20px 40px",
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "40px",
        }}
      >
        <div>
          <Link
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "9px",
              fontWeight: 700,
              fontSize: "19px",
              color: colors.text,
              textDecoration: "none",
              marginBottom: "14px",
            }}
          >
            <Logo size={28} />
            <span>
              Wary
              <span
                style={{
                  background: `linear-gradient(135deg, ${colors.primary}, ${categoryColors.image.text})`,
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                Tools
              </span>
            </span>
          </Link>
          <p style={{ fontSize: "13px", lineHeight: 1.65, color: colors.textMuted, margin: 0, maxWidth: "280px" }}>
            Free, browser-based PDF, image, and calculator tools. Nothing you upload ever leaves your device.
          </p>
        </div>

        <div style={{ display: "flex", gap: "64px", flexWrap: "wrap" }}>
          <div>
            <div
              style={{
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: colors.textFaint,
                marginBottom: "18px",
              }}
            >
              Company
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              <li style={{ marginBottom: "14px" }}>
                <Link
                  href="/about"
                  className="footer-link"
                  style={{ fontSize: "14px", color: colors.textMuted, textDecoration: "none" }}
                >
                  About
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <div
              style={{
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: colors.textFaint,
                marginBottom: "18px",
              }}
            >
              Legal
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              <li style={{ marginBottom: "14px" }}>
                <Link
                  href="/privacy"
                  className="footer-link"
                  style={{ fontSize: "14px", color: colors.textMuted, textDecoration: "none" }}
                >
                  Privacy Policy
                </Link>
              </li>
              <li style={{ marginBottom: "14px" }}>
                <Link
                  href="/terms"
                  className="footer-link"
                  style={{ fontSize: "14px", color: colors.textMuted, textDecoration: "none" }}
                >
                  Terms of Use
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div
        style={{
          borderTop: `1px solid ${colors.border}`,
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "18px 20px",
          fontSize: "12.5px",
          color: colors.textFaint,
        }}
      >
        © {new Date().getFullYear()} WaryTools. All rights reserved.
      </div>
    </footer>
  );
}
