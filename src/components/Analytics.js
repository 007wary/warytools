import Script from "next/script";

/**
 * Google Analytics 4. Renders nothing unless NEXT_PUBLIC_GA_ID is set, so
 * local dev and preview deploys stay out of the property by default.
 *
 * Next's App Router handles client-side navigation without a full page load,
 * but gtag's default `page_view` on config only fires once. Route changes are
 * tracked by AnalyticsRouteTracker below.
 *
 * `lazyOnload`, not `afterInteractive`, and the reason is measured rather than
 * stylistic: gtag.js is ~167 KB compressed — comparable to this entire site's
 * JavaScript — and `afterInteractive` both preloads it and executes it inside
 * the critical rendering window. Downloading and parsing that much third-party
 * script on a throttled mobile CPU lands directly in Total Blocking Time, which
 * is 30% of the Lighthouse performance score. Desktop hardware absorbs the same
 * work without noticing, which is exactly why the desktop score was 100 while
 * mobile sat at 77: the page was never the problem, the tag was.
 *
 * `lazyOnload` defers it until the browser is idle after load, so it no longer
 * competes with first paint or interactivity. The trade is that a visitor who
 * leaves within the first moment or two may not be counted — acceptable here,
 * and note the trending data this site actually ranks on does NOT come from
 * gtag at all: `recordToolUsage` writes to Supabase on a first-party call that
 * runs regardless of whether GA ever loads or is blocked (see lib/analytics.js,
 * where usage counting runs ahead of and independently of the GA hit). So
 * deferring the tag costs some pageview fidelity, not the usage numbers.
 *
 * Events fired before the tag loads are not lost: they queue on dataLayer and
 * gtag.js replays them (see pushHit in lib/analytics.js). That queue is what
 * makes deferring safe rather than a silent trade of data for score.
 */
export default function Analytics() {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  if (!gaId) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
        strategy="lazyOnload"
      />
      {/* Must share the loading strategy of the tag above. On a different
          strategy this inline config can run first and queue into a dataLayer
          that gtag.js has not yet replaced, or run after and re-initialise —
          either way the property silently under-reports. */}
      <Script id="ga-init" strategy="lazyOnload">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${gaId}', { send_page_view: false });
        `}
      </Script>
    </>
  );
}
