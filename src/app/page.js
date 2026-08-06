import Link from "next/link";
import { categories, allTools } from "@/lib/tools";
import { colors, categoryColors } from "@/lib/theme";
import { ToolSearchProvider, ToolSearchBox, ToolSearchGrid } from "@/components/ToolSearch";
import JsonLd from "@/components/JsonLd";
import TrendingTools from "@/components/TrendingTools";
import { jsonLdGraph, collectionPageJsonLd, faqJsonLd } from "@/lib/jsonLd";
import { pageMetadata } from "@/lib/pageMetadata";
import { fetchToolUsageSnapshot } from "@/lib/toolUsage";
import { rankTools } from "@/lib/toolRanking";

const title = "Free Online PDF, Image & Calculator Tools";
const description =
  "Free PDF, image, calculator, and URL shortener tools. Almost everything runs in your browser — no sign-up, no ads, no watermarks.";

// Next normalizes the canonical and strips the trailing slash, so this emits
// "https://wary.tools" regardless of the form written here; the sitemap is the
// side that has to match it (see sitemapRoutes.js).
export const metadata = pageMetadata({
  title,
  description,
  path: "/",
  // The layout's title template does not apply to the root segment, so
  // without this the homepage is the only page whose <title> lacks the brand.
  absoluteTitle: true,
});

const faqs = [
  {
    question: "Are these tools really free?",
    answer:
      "Yes. Every tool on WaryTools is free to use with no sign-up, no account, no watermarks, and no usage limits.",
  },
  {
    question: "What free online PDF and image tools are available?",
    answer:
      "You can merge, split, compress, rotate, and reorder PDF files, and compress, resize, or convert images between PNG, JPG, and WebP. There are also calculators for age, percentage, GST, interest, unit conversion, and date differences, plus a free URL shortener.",
  },
  {
    question: "Are my files uploaded to a server?",
    answer:
      "Almost never. Every image tool and every PDF tool but two runs entirely in your browser using JavaScript, so your files never leave your device. The exceptions are the document converters, PDF to Word and Word to PDF: converting between those formats needs a layout engine a browser does not have, so those files are sent to our converter and deleted immediately afterwards. Both tools say so clearly before you choose a file.",
  },
  {
    question: "Do I need to install anything?",
    answer:
      "No installation is required. WaryTools runs in any modern browser on desktop, tablet, or phone — there is nothing to download.",
  },
  {
    question: "Is there a file size limit?",
    answer:
      "There is no server-imposed limit, since processing happens locally. The practical ceiling is your device's available memory, so very large PDFs or images may be slow on older hardware.",
  },
  {
    question: "Does the URL shortener require an account?",
    answer:
      "No. You can shorten a link instantly without signing up. Links you create are remembered in your browser so you do not lose them on refresh.",
  },
];

// Rebuild the ranking hourly. The homepage stays fully static between
// revalidations — no client-side fetch, no loading state, no layout shift
// under the search box — while still tracking real usage over a day or two.
// Matches the hourly granularity of the underlying usage buckets; anything
// shorter would re-render for data that cannot have changed.
export const revalidate = 3600;

// Curated order used until real usage clears the thresholds in toolRanking.
// Hand-picked rather than "first four in the registry": these are the four
// highest-intent entry points across three different categories, so the
// section still reads as a useful shortcut on day one.
const CURATED_FALLBACK = ["/pdf/merge", "/image/compress", "/pdf/split", "/calculators/percentage"]
  .map((href) => allTools.find((tool) => tool.href === href))
  .filter(Boolean);

export default async function HomePage() {
  const { usage, fetchedAt } = await fetchToolUsageSnapshot();
  const trending = rankTools({ usage, tools: allTools, now: fetchedAt });

  // On fallback, rankTools returns registry order; show the curated picks
  // instead. The mode still drives the heading, so the label stays honest.
  const trendingTools = trending.mode === "trending" ? trending.tools : CURATED_FALLBACK;

  return (
    <ToolSearchProvider>
      <div>
        <JsonLd
          data={jsonLdGraph(
            collectionPageJsonLd({
              // Describes the collection rather than just naming the site —
              // "WaryTools" alone duplicates the Organization node's name and
              // tells a crawler nothing about what this page lists.
              name: title,
              description,
              href: "/",
              tools: allTools,
            }),
            faqJsonLd(faqs)
          )}
        />
        {/* Hero */}
        <section
          style={{
            textAlign: "center",
            padding: "72px 20px 48px",
            background:
              `radial-gradient(circle at 20% 0%, ${colors.primarySoft} 0%, transparent 55%), radial-gradient(circle at 80% 10%, ${categoryColors.image.bg} 0%, transparent 55%), ${colors.surface}`,
          }}
        >
          <h1
            style={{
              fontSize: "clamp(28px, 5vw, 44px)",
              fontWeight: 700,
              color: colors.text,
              marginBottom: "16px",
              lineHeight: 1.15,
            }}
          >
            {/* Trailing space before the <br> is deliberate: without it the
                accessible name and the text crawlers extract run together as
                "Free Online Tools,All in One Place". The H1 names the actual
                categories rather than saying "tools" generically, so the
                page's most important heading targets something specific. */}
            Free Online PDF, Image &amp; Calculator Tools —{" "}
            <br />
            <span
              style={{
                background: `linear-gradient(135deg, ${colors.primary}, ${categoryColors.image.text})`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              All in One Place
            </span>
          </h1>

          <p
            style={{
              fontSize: "16px",
              color: colors.textMuted,
              maxWidth: "560px",
              margin: "0 auto 32px",
              lineHeight: 1.6,
            }}
          >
            Free PDF, image, calculator, and URL shortener tools that run entirely in your
            browser. No uploads, no sign-up, no waiting. {allTools.length} tools and counting.
          </p>

          <ToolSearchBox />

          <TrendingTools mode={trending.mode} tools={trendingTools} />
        </section>

        {/* Tool grid grouped by category, filtered by the search box above */}
        <ToolSearchGrid categories={categories} />

        {/* Static, server-rendered content below the grid. Deliberately outside
            the client search island: the grid's category headings and cards are
            the homepage's only other text, and they disappear while a search is
            active. These sections keep the page's indexable copy and its
            FAQPage structured data present in the HTML unconditionally. */}
        <section
          style={{
            maxWidth: "900px",
            margin: "0 auto",
            padding: "0 20px 72px",
          }}
        >
          <h2
            style={{
              fontSize: "22px",
              fontWeight: 700,
              color: colors.text,
              marginBottom: "14px",
            }}
          >
            Free online tools that run in your browser, not on a server
          </h2>
          <p
            style={{
              fontSize: "15px",
              color: colors.textSecondary,
              lineHeight: 1.7,
              marginBottom: "14px",
            }}
          >
            WaryTools is a collection of {allTools.length} everyday utilities for working with PDFs,
            images, numbers, and links. You can{" "}
            <Link href="/pdf/merge" className="prose-link">merge PDF files</Link>,{" "}
            <Link href="/pdf/split" className="prose-link">split a PDF</Link>,{" "}
            <Link href="/image/compress" className="prose-link">compress an image</Link>,{" "}
            <Link href="/image/convert" className="prose-link">
              convert between PNG, JPG, and WebP
            </Link>
            , work out a{" "}
            <Link href="/calculators/percentage" className="prose-link">percentage</Link> or{" "}
            <Link href="/calculators/gst" className="prose-link">GST amount</Link>, and{" "}
            <Link href="/url-shortener" className="prose-link">shorten a long URL</Link> — without
            creating an account or installing software.
          </p>
          <p
            style={{
              fontSize: "15px",
              color: colors.textSecondary,
              lineHeight: 1.7,
              margin: 0,
            }}
          >
            Nearly every <Link href="/pdf" className="prose-link">PDF tool</Link> and{" "}
            <Link href="/image" className="prose-link">image tool</Link> runs fully client-side: the
            file you pick is processed by your own browser and never uploaded, so documents stay
            private by construction rather than by policy. The{" "}
            <Link href="/calculators" className="prose-link">calculators</Link> work the same way —
            nothing you type is sent anywhere. The exceptions are the two document converters —{" "}
            <Link href="/pdf/to-word" className="prose-link">PDF to Word</Link> and{" "}
            <Link href="/pdf/word-to-pdf" className="prose-link">Word to PDF</Link> — which need a
            server to rebuild the document and say so up front.
          </p>
        </section>

        <section
          style={{
            maxWidth: "900px",
            margin: "0 auto",
            padding: "0 20px 88px",
          }}
        >
          <h2
            style={{
              fontSize: "22px",
              fontWeight: 700,
              color: colors.text,
              marginBottom: "20px",
            }}
          >
            Frequently asked questions
          </h2>
          <dl style={{ margin: 0 }}>
            {faqs.map((faq) => (
              <div
                key={faq.question}
                style={{
                  borderTop: `1px solid ${colors.border}`,
                  padding: "18px 0",
                }}
              >
                <dt
                  style={{
                    fontSize: "15px",
                    fontWeight: 600,
                    color: colors.text,
                    marginBottom: "6px",
                  }}
                >
                  {faq.question}
                </dt>
                <dd
                  style={{
                    fontSize: "14.5px",
                    color: colors.textMuted,
                    lineHeight: 1.65,
                    margin: 0,
                  }}
                >
                  {faq.answer}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </ToolSearchProvider>
  );
}
