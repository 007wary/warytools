import { ADSENSE_PUBLISHER_ID } from "@/lib/adsense";

export const dynamic = "force-static";

// IAB Authorized Digital Sellers file, served at /ads.txt.
//
// It is a public declaration of who may sell this domain's ad inventory.
// Without it AdSense shows a persistent "earnings at risk" warning, and
// buyers that honour ads.txt — most programmatic demand does — treat
// unverified inventory as counterfeit and bid down or skip it. So a missing
// file is a slow revenue leak rather than an outage, which is precisely why
// it gets forgotten.
//
// A route rather than public/ads.txt so the publisher ID has one definition
// (lib/adsense.js) shared with the <script> tag. Two hand-maintained copies of
// the same ID is how they drift, and a drifted ads.txt fails silently: the
// file is present and well-formed, Google's crawler simply does not find its
// own ID in it, and the dashboard warning reads identically to having no file
// at all.
//
// Field order is fixed by the spec: domain of the seller, the publisher's ID
// with that seller, the relationship (DIRECT — we hold the AdSense account
// ourselves, as opposed to RESELLER), and the seller's Trust & Safety ID.
// f08c47fec0942fa0 is Google's, the same constant on every AdSense site.
//
// Note the *bare* pub-… form: ads.txt matches on the ID without the "ca-"
// prefix that the script tag's client parameter uses. Writing ca-pub-… here
// is a well-known way to end up with a file that looks right and verifies
// nothing.
const ADS_TXT = `google.com, ${ADSENSE_PUBLISHER_ID}, DIRECT, f08c47fec0942fa0\n`;

export async function GET() {
  return new Response(ADS_TXT, {
    headers: {
      // text/plain is required by the spec; crawlers may reject other types.
      "Content-Type": "text/plain; charset=utf-8",
      // Google re-crawls ads.txt roughly daily. A day of caching keeps it off
      // the origin without delaying a change to the file past that window.
      "Cache-Control": "public, max-age=86400",
    },
  });
}
