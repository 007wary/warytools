"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { events, trackEvent } from "@/lib/analytics";

function Tracker({ gaId }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window.gtag !== "function") return;
    const query = searchParams.toString();
    window.gtag("event", "page_view", {
      page_path: query ? `${pathname}?${query}` : pathname,
      page_location: window.location.href,
      page_title: document.title,
      send_to: gaId,
    });
  }, [gaId, pathname, searchParams]);

  return null;
}

/**
 * Tracks link clicks via a single delegated listener on the document.
 *
 * The alternative — an onClick on ToolCard/Navbar/Footer — would force those
 * server components to become client components, shipping JS for what is
 * otherwise static markup (ToolCard alone renders ~15 times on the
 * homepage). Delegation keeps them server-rendered at zero bundle cost.
 *
 * Internal navigations already produce a page_view, so this records the
 * *source* of a click (which surface sent someone to a tool) plus outbound
 * links, which produce no page_view of their own.
 */
function ClickTracker() {
  useEffect(() => {
    function onClick(e) {
      const link = e.target.closest?.("a[href]");
      if (!link) return;

      const href = link.getAttribute("href") || "";
      if (href.startsWith("#") || href.startsWith("mailto:")) return;

      // `nav`, `footer` and the tool grid are the three surfaces worth
      // telling apart; anything else is page body copy.
      const source = link.closest("nav")
        ? "navbar"
        : link.closest("footer")
          ? "footer"
          : link.classList.contains("tool-card")
            ? "tool_card"
            : "content";

      const isExternal = /^https?:\/\//i.test(href) && !href.includes(window.location.host);

      trackEvent(isExternal ? events.OUTBOUND_CLICK : events.NAV_CLICK, {
        link_source: source,
        link_target: href,
      });
    }

    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}

/**
 * Sends a GA4 page_view on every App Router navigation, including the first
 * one. Paired with `send_page_view: false` in the gtag config so the initial
 * load isn't counted twice.
 *
 * useSearchParams() opts a route into client-side rendering unless it sits
 * under a Suspense boundary — hence the wrapper, which keeps every page
 * statically prerenderable.
 */
export default function AnalyticsRouteTracker() {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  if (!gaId) return null;

  return (
    <>
      <Suspense fallback={null}>
        <Tracker gaId={gaId} />
      </Suspense>
      <ClickTracker />
    </>
  );
}
