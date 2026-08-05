"use client";

import { createContext, useContext, useMemo, useState, useSyncExternalStore } from "react";
import { Search } from "lucide-react";
import ToolCard from "@/components/ToolCard";
import { colors } from "@/lib/theme";
import { recordSearchClick } from "@/lib/toolUsage";

// Client island for the homepage search: SearchBox and Grid are placed in
// different spots in the server-rendered page.js layout (box inside the
// hero section, grid as a sibling below it), so they share filter state
// through context rather than both being one component instance.
const QueryContext = createContext(null);

function useQueryState() {
  const ctx = useContext(QueryContext);
  if (!ctx) {
    throw new Error("ToolSearch.SearchBox and ToolSearch.Grid must be used together");
  }
  return ctx;
}

// Honours the `?q=` SearchAction advertised in the WebSite JSON-LD
// (src/lib/jsonLd.js), so a sitelinks-searchbox hit like /?q=merge lands on an
// actually-filtered page instead of the plain homepage.
//
// Read from window rather than useSearchParams(): the latter opts the whole
// route out of static rendering unless wrapped in Suspense, and keeping the
// homepage static matters more than resolving the filter one render sooner.
//
// useSyncExternalStore rather than a setState-in-effect: the server snapshot is
// always "" (matching the static HTML, so hydration never mismatches) while the
// client snapshot reads the real URL, giving a single correct render instead of
// a cascading second one.
const EMPTY_SNAPSHOT = "";
const subscribeToNothing = () => () => {};
const getUrlQuery = () => new URLSearchParams(window.location.search).get("q") || "";
const getServerQuery = () => EMPTY_SNAPSHOT;

export function ToolSearchProvider({ children }) {
  const urlQuery = useSyncExternalStore(subscribeToNothing, getUrlQuery, getServerQuery);
  // null means "user hasn't typed yet", so the URL seed still applies. Once
  // they interact, their input wins and the URL is no longer consulted.
  const [typed, setTyped] = useState(null);

  const query = typed ?? urlQuery;
  const value = useMemo(() => ({ query, setQuery: setTyped }), [query]);

  return <QueryContext.Provider value={value}>{children}</QueryContext.Provider>;
}

export function ToolSearchBox() {
  const { query, setQuery } = useQueryState();

  return (
    <div
      role="search"
      style={{ maxWidth: "480px", margin: "0 auto", position: "relative" }}
    >
      <Search
        size={18}
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "16px",
          top: "50%",
          transform: "translateY(-50%)",
          color: colors.textFaint,
          pointerEvents: "none",
        }}
      />
      <label htmlFor="tool-search" className="sr-only">
        Search tools
      </label>
      <input
        id="tool-search"
        name="q"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search tools… e.g. merge, resize, GST"
        style={{
          width: "100%",
          padding: "13px 16px 13px 46px",
          fontSize: "15px",
          borderRadius: "12px",
          border: `1px solid ${colors.borderInput}`,
          outline: "none",
          boxShadow: "var(--shadow-subtle)",
        }}
      />
    </div>
  );
}

export function ToolSearchGrid({ categories }) {
  const { query } = useQueryState();

  // A click only counts as a *search* click when a query is actually
  // narrowing the grid. With an empty box this is the full tool listing and
  // clicking a card is plain browsing — counting that would make the search
  // signal a duplicate of homepage traffic.
  const isSearching = query.trim().length > 0;

  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;

    return categories
      .map((category) => ({
        ...category,
        tools: category.tools.filter(
          (tool) =>
            tool.title.toLowerCase().includes(q) ||
            tool.description.toLowerCase().includes(q)
        ),
      }))
      .filter((category) => category.tools.length > 0);
  }, [query, categories]);

  return (
    <section
      style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "20px 20px 80px",
      }}
    >
      {filteredCategories.length === 0 && (
        <p style={{ textAlign: "center", color: colors.textMuted, padding: "40px 0" }}>
          No tools match &ldquo;{query}&rdquo;.
        </p>
      )}

      {filteredCategories.map((category) => (
        <div key={category.slug} style={{ marginBottom: "48px" }}>
          <h2
            style={{
              fontSize: "19px",
              fontWeight: 600,
              color: colors.text,
              marginBottom: "16px",
            }}
          >
            {category.label}
          </h2>
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
                onClick={isSearching ? () => recordSearchClick(tool.href) : undefined}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

