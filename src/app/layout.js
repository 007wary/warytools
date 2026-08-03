import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import JsonLd from "@/components/JsonLd";
import { jsonLdGraph, organizationJsonLd, websiteJsonLd } from "@/lib/jsonLd";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const title = "WaryTools — Free Online PDF, Image & Calculator Tools";
const description =
  "Free online tools for PDF editing, image processing, calculators, and URL shortening. All PDF and image tools run 100% in your browser — no uploads.";

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://wary.tools"),
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
  openGraph: {
    title,
    description,
    siteName: "WaryTools",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <JsonLd data={jsonLdGraph(organizationJsonLd(), websiteJsonLd())} />
        <Navbar />
        <main style={{ flex: 1 }}>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
