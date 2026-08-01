"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X, ChevronDown } from "lucide-react";
import { categories } from "@/lib/tools";
import { categoryColors, colors } from "@/lib/theme";
import ToolIcon from "./ToolIcon";
import Logo from "./Logo";

// Top navigation bar: hover dropdowns on desktop, a slide-down accordion
// menu on mobile (below md breakpoint).
export default function Navbar() {
  const [openSlug, setOpenSlug] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(null);

  // Close the mobile menu whenever the viewport grows past the breakpoint
  // where the full desktop nav takes over, so it can't get stuck open
  // behind a resized window. Must match the md: breakpoint used below.
  useEffect(() => {
    function handleResize() {
      if (window.innerWidth >= 768) setMobileOpen(false);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Desktop dropdowns open on hover, but also need click/keyboard support —
  // hover alone is unreachable by keyboard nav and unusable on touchscreens
  // at desktop widths (e.g. iPad landscape). Escape closes an open dropdown.
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") setOpenSlug(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <header
      style={{
        borderBottom: `1px solid ${colors.border}`,
        backgroundColor: "var(--header-bg)",
        backdropFilter: "blur(8px)",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "0 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: "64px",
        }}
      >
        <Link
          href="/"
          style={{
            fontWeight: 700,
            fontSize: "19px",
            color: colors.text,
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: "8px",
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

        {/* Desktop nav */}
        <nav style={{ gap: "4px" }} className="hidden md:flex">
          {categories.map((category, categoryIndex) => {
            const accent = categoryColors[category.slug];
            // Only the very last item sits close enough to the viewport's
            // right edge to risk its dropdown overflowing — align just
            // that one's panel to its button's right edge instead of left.
            const alignRight = categoryIndex === categories.length - 1;
            return (
              <div
                key={category.slug}
                style={{ position: "relative" }}
                onMouseEnter={() => setOpenSlug(category.slug)}
                onMouseLeave={() => setOpenSlug(null)}
              >
                <button
                  onClick={() => setOpenSlug(openSlug === category.slug ? null : category.slug)}
                  aria-expanded={openSlug === category.slug}
                  aria-haspopup="true"
                  className="hover-surface"
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: 500,
                    color: colors.textSecondary,
                    padding: "8px 12px",
                    borderRadius: "8px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  {category.label}
                  <ChevronDown size={14} strokeWidth={2} style={{ color: colors.textFaint }} />
                </button>

                {openSlug === category.slug && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: alignRight ? "auto" : 0,
                      right: alignRight ? 0 : "auto",
                      backgroundColor: colors.surface,
                      border: `1px solid ${colors.border}`,
                      borderRadius: "12px",
                      boxShadow: "var(--shadow-dropdown)",
                      minWidth: "240px",
                      padding: "6px",
                    }}
                  >
                    {category.tools.map((tool) => (
                      <Link
                        key={tool.slug}
                        href={tool.href}
                        className="hover-surface"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: "8px 10px",
                          borderRadius: "8px",
                          fontSize: "14px",
                          color: colors.textSecondary,
                          textDecoration: "none",
                        }}
                      >
                        <ToolIcon name={tool.icon} size={16} style={{ color: accent.text }} />
                        {tool.title}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Mobile menu toggle */}
        <button
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle menu"
          className="flex md:hidden items-center justify-center hover-surface"
          style={{
            background: "none",
            border: `1px solid ${colors.border}`,
            borderRadius: "8px",
            width: "38px",
            height: "38px",
            cursor: "pointer",
            color: colors.text,
          }}
        >
          {mobileOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {/* Mobile accordion menu */}
      {mobileOpen && (
        <div
          className="md:hidden"
          style={{ borderTop: `1px solid ${colors.border}`, padding: "8px 20px 16px" }}
        >
          {categories.map((category) => {
            const accent = categoryColors[category.slug];
            const isExpanded = mobileExpanded === category.slug;
            return (
              <div key={category.slug} style={{ borderBottom: `1px solid ${colors.borderMuted}` }}>
                <button
                  onClick={() => setMobileExpanded(isExpanded ? null : category.slug)}
                  style={{
                    width: "100%",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 4px",
                    fontSize: "15px",
                    fontWeight: 600,
                    color: colors.text,
                  }}
                >
                  {category.label}
                  <ChevronDown
                    size={16}
                    style={{
                      color: colors.textFaint,
                      transform: isExpanded ? "rotate(180deg)" : "none",
                      transition: "transform 0.15s ease",
                    }}
                  />
                </button>

                {isExpanded && (
                  <div style={{ paddingBottom: "8px" }}>
                    {category.tools.map((tool) => (
                      <Link
                        key={tool.slug}
                        href={tool.href}
                        onClick={() => setMobileOpen(false)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: "10px 4px 10px 8px",
                          fontSize: "14px",
                          color: colors.textSecondary,
                          textDecoration: "none",
                        }}
                      >
                        <ToolIcon name={tool.icon} size={16} style={{ color: accent.text }} />
                        {tool.title}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </header>
  );
}
