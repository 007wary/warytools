"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { events, trackEvent, pushHit } from "@/lib/analytics";

function Tracker({ gaId }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams.toString();
    const path = query ? `${pathname}?${query}` : pathname;

    // Captured now, not when the tag finally loads. A deferred send that read
    // document.title later would attribute the hit to whatever page the user
    // had navigated to by then.
    const payload = {
      page_path: path,
      page_location: window.location.href,
      page_title: document.title,
      send_to: gaId,
    };

    // Queued via the shared helper rather than calling window.gtag directly.
    // gtag.js loads with `lazyOnload`, so on a first visit it is normally NOT
    // ready when this effect runs, and the previous `typeof window.gtag !==
    // "function"` bail dropped the initial page_view outright — the one hit
    // every session has — silently. See pushHit for why the queue is safe.
    pushHit("page_view", payload);
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
