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
  //
  // matchMedia rather than a `resize` listener reading innerWidth, and this is
  // a real cost rather than a tidy-up: the Navbar is in the root layout, so
  // this listener is attached on EVERY page of the site for the whole visit.
  // A resize handler fires continuously through a drag, and reading
  // window.innerWidth inside it forces the browser to flush pending style and
  // layout work to answer — so the one case this exists for (a desktop window
  // crossing 768px, which almost never happens) taxed every resize everywhere.
  //
  // It is worse on mobile, where the menu actually lives: iOS and Android fire
  // `resize` repeatedly as the URL bar collapses and expands during ordinary
  // scrolling, so scrolling with the menu open ran a forced layout read per
  // event on exactly the devices least able to absorb it.
  //
  // A media query list fires only when the breakpoint is genuinely crossed —
  // no events during a scroll, none while dragging within one side of it — and
  // `event.matches` is already computed, so nothing is read back off the DOM.
  useEffect(() => {
    // Guarded for older Safari, where matchMedia exists but addEventListener on
    // the result does not. Falling through to no listener is the right
    // degradation: the menu closes on navigation anyway, so the worst case is
    // one stuck panel after a deliberate desktop resize.
    const query = window.matchMedia?.("(min-width: 768px)");
    if (!query?.addEventListener) return undefined;

    function handleChange(event) {
      if (event.matches) setMobileOpen(false);
    }

    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
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

            // Single-tool categories (currently just the URL shortener) go
            // straight to their hub page instead of opening a one-item
            // dropdown — a menu with one entry is just an extra click.
            if (category.tools.length === 1) {
              return (
                <Link
                  key={category.slug}
                  href={category.hubHref}
                  className="hover-surface"
                  style={{
                    fontSize: "14px",
                    fontWeight: 500,
                    color: colors.textSecondary,
                    padding: "8px 12px",
                    borderRadius: "8px",
                    textDecoration: "none",
                  }}
                >
                  {category.label}
                </Link>
              );
            }

            // Only the very last item sits close enough to the viewport's
            // right edge to risk its dropdown overflowing — align just
            // that one's panel to its button's right edge instead of left.
            const alignRight = categoryIndex === categories.length - 1;

            // A single column of 19 PDF tools is ~700px tall, which runs off
            // the bottom of any laptop viewport and ends up behind the OS
            // taskbar. Long menus go two-up so the panel stays roughly the
            // height of the longest half; the maxHeight below is the backstop
            // for short viewports and for the list growing again later.
            const twoColumn = category.tools.length > 10;
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
                      minWidth: twoColumn ? "480px" : "240px",
                      padding: "6px",
                      // Never taller than the space under the header, so the
                      // last entries can't land under the taskbar. 24px keeps
                      // the panel's bottom edge off the viewport edge.
                      maxHeight: "calc(100vh - 64px - 24px)",
                      overflowY: "auto",
                      ...(twoColumn
                        ? { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 4px" }
                        : null),
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
          {/* Blog sits before About: it is content people come back for,
              whereas About is a destination someone visits once. */}
          <Link
            href="/blog"
            className="hover-surface"
            style={{
              fontSize: "14px",
              fontWeight: 500,
              color: colors.textSecondary,
              padding: "8px 12px",
              borderRadius: "8px",
              textDecoration: "none",
            }}
          >
            Blog
          </Link>
          <Link
            href="/about"
            className="hover-surface"
            style={{
              fontSize: "14px",
              fontWeight: 500,
              color: colors.textSecondary,
              padding: "8px 12px",
              borderRadius: "8px",
              textDecoration: "none",
            }}
          >
            About
          </Link>
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
            width: "44px",
            height: "44px",
            cursor: "pointer",
            color: colors.text,
          }}
        >
          {mobileOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {/* Mobile accordion menu — absolutely positioned so it overlays the
          page instead of pushing content down when it opens. */}
      {mobileOpen && (
        <div
          className="md:hidden"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            maxHeight: "calc(100vh - 64px)",
            overflowY: "auto",
            backgroundColor: colors.surface,
            borderTop: `1px solid ${colors.border}`,
            borderBottom: `1px solid ${colors.border}`,
            boxShadow: "var(--shadow-dropdown)",
            padding: "8px 20px 16px",
          }}
        >
          {categories.map((category) => {
            const accent = categoryColors[category.slug];
            const isExpanded = mobileExpanded === category.slug;

            if (category.tools.length === 1) {
              return (
                <Link
                  key={category.slug}
                  href={category.hubHref}
                  onClick={() => setMobileOpen(false)}
                  style={{
                    display: "block",
                    padding: "12px 4px",
                    fontSize: "15px",
                    fontWeight: 600,
                    color: colors.text,
                    textDecoration: "none",
                    borderBottom: `1px solid ${colors.borderMuted}`,
                  }}
                >
                  {category.label}
                </Link>
              );
            }

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
                          padding: "12px 4px 12px 8px",
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
          <Link
            href="/blog"
            onClick={() => setMobileOpen(false)}
            style={{
              display: "block",
              padding: "12px 4px",
              fontSize: "15px",
              fontWeight: 600,
              color: colors.text,
              textDecoration: "none",
            }}
          >
            Blog
          </Link>
          <Link
            href="/about"
            onClick={() => setMobileOpen(false)}
            style={{
              display: "block",
              padding: "12px 4px",
              fontSize: "15px",
              fontWeight: 600,
              color: colors.text,
              textDecoration: "none",
            }}
          >
            About
          </Link>
        </div>
      )}
    </header>
  );
}
