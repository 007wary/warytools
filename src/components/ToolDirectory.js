import Link from "next/link";
import ToolCard from "@/components/ToolCard";
import ToolIcon from "@/components/ToolIcon";
import { categoryColors, colors } from "@/lib/theme";

// The full tool listing, grouped by category with jump links.
//
// This replaces the client-side search island that used to own the homepage
// grid. The reasoning is a cost/benefit one rather than a dislike of search:
// a text filter over 33 hardcoded strings is a client component, which drags
// React state and an event handler onto the site's highest-traffic page to do
// something a page of anchors does server-side for nothing. Search earns that
// cost somewhere north of a couple of hundred items, where scanning genuinely
// fails. At 33, grouped into four labelled categories, scanning wins — and it
// wins hardest on a slow phone, where the old box was inert until hydration.
//
// The `?q=` SearchAction in the WebSite JSON-LD was removed alongside it (see
// src/lib/jsonLd.js): advertising a sitelinks search box that the page can no
// longer honour would send Google to a URL that silently ignores the query.
//
// Anchors, not a filter, also means every tool is in the server-rendered HTML
// unconditionally — the old grid emptied itself while a query was active,
// which is why the SEO prose had to live outside the island to survive.

export default function ToolDirectory({ categories }) {
  return (
    <section
      id="all-tools"
      aria-labelledby="all-tools-heading"
      // Top padding absorbs the space the (now hidden) heading block used to
      // occupy, so the chip row keeps its distance from the hero instead of
      // riding up against it.
      style={{ maxWidth: "1200px", margin: "0 auto", padding: "36px 20px 80px" }}
    >
      {/* Visually hidden, not deleted. The category chips and the four
          category headings below already make the section's purpose obvious
          on screen, so the visible "All tools" title and its subtitle were
          redundant furniture. The heading itself stays because the section's
          aria-labelledby points at it — removing the element would leave a
          dangling reference and an unlabelled region, which is the same
          silent-failure shape as an orphaned JSON-LD @id. */}
      <h2 id="all-tools-heading" className="sr-only">
        All tools
      </h2>

      {/* Category jump links. A <nav> rather than a plain row: these are the
          page's in-content navigation now that the search box is gone, and a
          screen reader user should be able to reach them as a landmark
          instead of scrolling the whole listing to discover the grouping. */}
      <nav
        aria-label="Tool categories"
        style={{
          display: "flex",
          flexWrap: "wrap",
          // Centred to match the hero and the trending chip row directly
          // above, which are both centre-aligned — left-aligning these put a
          // third alignment on one screen and made the row read as the start
          // of the listing rather than as navigation belonging to the hero.
          justifyContent: "center",
          gap: "8px",
          marginBottom: "36px",
        }}
      >
        {categories.map((category) => {
          const accent = categoryColors[category.slug] || categoryColors.pdf;
          return (
            <a
              key={category.slug}
              href={`#category-${category.slug}`}
              className="trending-chip"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                padding: "8px 14px",
                borderRadius: "999px",
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.surface,
                color: colors.textSecondary,
                fontSize: "13.5px",
                fontWeight: 500,
                textDecoration: "none",
                lineHeight: 1.2,
              }}
            >
              <span style={{ color: accent.text, display: "inline-flex" }}>
                <ToolIcon name={category.icon} size={15} aria-hidden="true" />
              </span>
              {category.label}
              <span style={{ color: colors.textFaint, fontWeight: 400 }}>
                {category.tools.length}
              </span>
            </a>
          );
        })}
      </nav>

      {categories.map((category) => (
        <div
          key={category.slug}
          id={`category-${category.slug}`}
          // Offsets the anchor from under the sticky navbar, so a jump link
          // lands on the heading rather than scrolling it out of sight.
          style={{ marginBottom: "48px", scrollMarginTop: "80px" }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: "12px",
              marginBottom: "16px",
            }}
          >
            <h3
              style={{
                fontSize: "19px",
                fontWeight: 600,
                color: colors.text,
                margin: 0,
              }}
            >
              {category.label}
            </h3>
            {/* The hub pages already exist and rank; linking them from here
                passes the homepage's authority to them rather than leaving
                them reachable only from the navbar.

                Suppressed for single-tool categories, which URL Shortener is:
                its hubHref and its only card's href are the same URL, so the
                link reads as "there is more through here" and delivers the
                page already sitting directly beneath it. The condition is on
                the tool count rather than the slug so a second shortener-ish
                tool restores the link automatically, and so any future
                one-tool category doesn't reintroduce the same dead end. */}
            {category.tools.length > 1 && (
              <Link
                href={category.hubHref}
                className="prose-link"
                style={{ fontSize: "13.5px", whiteSpace: "nowrap" }}
              >
                View all {category.label.toLowerCase()}
              </Link>
            )}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: "16px",
            }}
          >
            {category.tools.map((tool) => (
              <ToolCard
                key={tool.slug}
                title={tool.title}
                description={tool.description}
                href={tool.href}
                icon={tool.icon}
                category={category.slug}
                // h3 is taken by the category heading above, so cards drop a
                // level to keep the outline well-formed.
                headingLevel="h4"
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
