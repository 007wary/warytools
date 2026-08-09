import { ADSENSE_CLIENT_ID, adsEnabled } from "@/lib/adsense";

/**
 * Google AdSense loader. Server component: `adsEnabled()` reads the bare
 * VERCEL_ENV, which does not exist in the browser bundle (see lib/adsense.js).
 *
 * A plain <script>, NOT next/script, and that is a correction rather than a
 * style choice. next/script stamps a `data-nscript` attribute on the tag it
 * emits, and adsbygoogle.js inspects its own script element on load and
 * rejects it:
 *
 *   AdSense head tag doesn't support data-nscript attribute.
 *
 * The tag is unusual in caring what markup it was loaded from — most third
 * party scripts, gtag.js next door included, never look. So the Analytics.js
 * precedent genuinely does not transfer here, and next/script's advantages
 * (dedup, strategy scheduling) are worth nothing against a tag the vendor
 * refuses to run.
 *
 * React renders `async` on a plain script tag correctly, so the loading
 * behaviour is Google's own snippet verbatim: fetched off the parser, run
 * when it arrives. That is also the behaviour AdSense expects — it wants the
 * tag early enough to fill slots while the visitor is still looking at the
 * page, which is why deferring it (the `lazyOnload` used for analytics) would
 * be the wrong trade even if it were available. Ad revenue and viewability
 * both depend on rendering before the visitor scrolls past.
 *
 * It does land in Total Blocking Time, so the mobile Lighthouse score drops
 * from where it sat before ads. That is the accepted cost of running ads at
 * all, not a regression to hunt later.
 *
 * `crossOrigin="anonymous"` is from Google's snippet and is load-bearing:
 * without it the request is made without CORS mode, error reporting for the
 * tag degrades, and Google's diagnostics flag the installation as modified.
 */
export default function AdSense() {
  if (!adsEnabled()) return null;

  return (
    <script
      async
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`}
      crossOrigin="anonymous"
    />
  );
}
