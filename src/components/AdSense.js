import Script from "next/script";
import { ADSENSE_CLIENT_ID, adsEnabled } from "@/lib/adsense";

/**
 * Google AdSense loader. Server component: `adsEnabled()` reads the bare
 * VERCEL_ENV, which does not exist in the browser bundle (see lib/adsense.js).
 *
 * `afterInteractive`, deliberately NOT the `lazyOnload` used for gtag.js next
 * door, and the asymmetry is the point. Deferring analytics costs a little
 * pageview fidelity from visitors who bounce immediately — a measurement
 * trade. Deferring the ad tag costs revenue on exactly the same visitors,
 * because an ad that renders after someone has scrolled past the slot was
 * never viewable and does not earn. Worse, `lazyOnload` waits for the window
 * load event, which on a tool page includes the pdf.js worker and any
 * thumbnail rendering, so slots would sit blank through the part of the visit
 * where the user is actually looking at the page.
 *
 * That does mean this lands in Total Blocking Time in a way the deferred gtag
 * no longer does — the mobile Lighthouse score will drop from where it sits
 * today. That is the accepted cost of running ads at all; it is not a
 * regression to go hunting for later. The script is `async` per Google's
 * snippet, so it does not block parsing, and Next emits it after hydration.
 *
 * The `crossOrigin="anonymous"` is from Google's own snippet and is
 * load-bearing rather than decorative: without it the request is made without
 * CORS mode and error reporting for the tag degrades, and Google's diagnostics
 * flag the installation as modified.
 */
export default function AdSense() {
  if (!adsEnabled()) return null;

  return (
    <Script
      id="adsense-init"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`}
      strategy="afterInteractive"
      crossOrigin="anonymous"
      async
    />
  );
}
