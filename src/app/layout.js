import { Geist } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import JsonLd from "@/components/JsonLd";
import Analytics from "@/components/Analytics";
import AnalyticsRouteTracker from "@/components/AnalyticsRouteTracker";
import AdSense from "@/components/AdSense";
import { jsonLdGraph, organizationJsonLd, websiteJsonLd } from "@/lib/jsonLd";
import { SITE_URL } from "@/lib/siteUrl";
import { ADSENSE_CLIENT_ID, adsEnabled } from "@/lib/adsense";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const title = "WaryTools — Free Online PDF, Image & Calculator Tools";
const description =
  "Free online tools for PDF editing, image processing, calculators, and URL shortening. All PDF and image tools run 100% in your browser — no uploads.";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    template: "%s — WaryTools",
    default: title,
  },
  description,
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
    },
  },
  // Site-ownership verification for AdSense. Google accepts either this meta
  // tag or finding the adsbygoogle.js snippet in the page source; the tag is
  // the more robust of the two here because it is plain server-rendered HTML
  // in <head>, whereas next/script injects the snippet after hydration and a
  // crawler that does not execute JavaScript would not see it. Both are
  // present, so verification does not depend on which method the reviewer's
  // fetch happens to use.
  //
  // Gated with the tag itself so a preview deploy never claims ownership of
  // the domain on a host Google has not approved.
  ...(adsEnabled()
    ? { other: { "google-adsense-account": ADSENSE_CLIENT_ID } }
    : {}),
  openGraph: {
    title,
    description,
    siteName: "WaryTools",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "WaryTools — free PDF, image and calculator tools that run in your browser",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [
      {
        url: "/opengraph-image",
        alt: "WaryTools — free PDF, image and calculator tools that run in your browser",
      },
    ],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2563eb",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <JsonLd data={jsonLdGraph(organizationJsonLd(), websiteJsonLd())} />
        <Analytics />
        <AnalyticsRouteTracker />
        <AdSense />
        <Navbar />
        <main style={{ flex: 1 }}>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
