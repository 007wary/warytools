import Link from "next/link";
import { categories, allTools } from "@/lib/tools";
import { colors, categoryColors } from "@/lib/theme";
import ToolDirectory from "@/components/ToolDirectory";
import FeaturedTools from "@/components/FeaturedTools";
import JsonLd from "@/components/JsonLd";
import TrendingTools from "@/components/TrendingTools";
import { jsonLdGraph, collectionPageJsonLd, faqJsonLd } from "@/lib/jsonLd";
import { pageMetadata } from "@/lib/pageMetadata";
import { fetchToolUsageSnapshot } from "@/lib/toolUsage";
import { rankTools } from "@/lib/toolRanking";
import { resolveFeaturedTools } from "@/lib/featuredTools";

// The <title> leads with the verbs people actually type. The old one —
// "Free Online PDF, Image & Calculator Tools" — was a category claim: nobody
// searches "free online pdf image and calculator tools", they search "merge
// pdf", "compress pdf", "compress image". A generic category title competes
// head-on with iLovePDF and SmallPDF for a term this site cannot win, while
// matching none of the queries it genuinely answers. Naming the four highest
// -volume jobs puts the searched phrase in the most weighted element on the
// page, and still reads as a sentence rather than a keyword list.
// Kept short on purpose. pageMetadata's absoluteTitle appends " — WaryTools",
// so the rendered <title> is this plus 12 characters, and Google truncates
// around 60. The verbs have to survive that cut, so the category words that
// used to pad this line are gone — they are already carried by the H1, the
// hero paragraph and the section headings.
const title = "Merge, Split & Compress PDF Files Free";
// Says "no sign-up, no watermarks" and deliberately not "no ads": the site
// runs AdSense (see lib/adsense.js and the /privacy advertising section), so
// the old claim became false the moment the tag shipped. It mattered more
// here than anywhere else on the site — this is the meta description Google
// renders in the search snippet, so an ad-free promise would have been the
// first thing a visitor read and the first thing the page disproved.
//
// The two surviving claims are still true and are the ones people search on,
// so nothing of value was lost by dropping the third.
const description =
  "Free PDF, image, calculator, and URL shortener tools. Almost everything runs in your browser — no sign-up, no watermarks.";

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
      // "No watermarks" means we never stamp our own branding on your output —
      // the promise every other free tool breaks. Worded as "of our own" now
      // that a Watermark Image tool exists, so the two can't be read as
      // contradicting each other: one adds a mark you asked for, the other is
      // about a mark you didn't.
      "Yes. Every tool on WaryTools is free to use with no sign-up, no account, no watermarks of our own on your files, and no usage limits.",
  },
  {
    question: "What free online PDF and image tools are available?",
    answer:
      "You can merge, split, compress, rotate, and reorder PDF files, and compress, resize, convert, or watermark images between PNG, JPG, and WebP. There's also an EXIF stripper that removes GPS and camera metadata from photos. Plus calculators for age, percentage, GST, interest, unit conversion, and date differences, and a free URL shortener.",
  },
  {
    question: "Are my files uploaded to a server?",
    answer:
      "Almost never. Every image tool and every PDF tool but four runs entirely in your browser using JavaScript, so your files never leave your device. The exceptions are the document converters — PDF to Word, Word to PDF, PowerPoint to PDF, and Excel to PDF: converting between those formats needs a layout engine a browser does not have, so those files are sent to our converter and deleted immediately afterwards. All four say so clearly before you choose a file.",
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

  // Throws if a featured href has left the registry — see featuredTools.js.
  const featuredTools = resolveFeaturedTools(allTools);

  return (
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
            {/* Verb-led, because the H1 is the page's strongest on-page
                signal and it was previously spent on a category phrase
                ("Free Online PDF, Image & Calculator Tools — All in One
                Place") that nobody types into a search box. "All in One
                Place" in particular is a brand-awareness line, and it only
                means something to someone who already trusts the brand —
                exactly the visitor this page does not yet have.

                The verbs here are the four highest-intent jobs on the site
                and match the <title>. The trailing space before the <br> is
                still deliberate: without it the accessible name and the text
                crawlers extract run the two lines together as one word. */}
            Merge, split &amp; compress your files —{" "}
            <br />
            <span
              style={{
                background: `linear-gradient(135deg, ${colors.primary}, ${categoryColors.image.text})`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              free, and in your browser
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
            {/* "Almost everything" rather than a blanket "runs entirely in your
                browser. No uploads" — the old wording was false for five of the
                tools this very sentence names: the four document converters and
                the URL shortener. The FAQ below, /about, /privacy and the PDF
                hub were all already careful about this; the hero was the last
                blanket claim on the site, and the highest-traffic copy on it.
                The count is interpolated, never written as prose, so it cannot
                drift from the registry. */}
            Free PDF, image, calculator, and URL shortener tools — {allTools.length} of them, all
            genuinely free. Almost everything runs right in your browser, so your files never
            leave your device. No sign-up, no watermarks, no waiting.
          </p>

          <TrendingTools mode={trending.mode} tools={trendingTools} />
        </section>

        {/* The six promoted tools, above the full listing. This is the change
            that turns the page from a directory into a product: the grid used
            to give Merge PDF exactly the same visual weight as the Date
            Difference Calculator, so the page never answered "what is this
            for" in the second a visitor spends deciding. */}
        <FeaturedTools tools={featuredTools} />

        {/* Full listing, server-rendered, with category jump links. This
            replaced a client-side search island — see ToolDirectory.js for
            why a text filter over 33 items was not worth its cost. */}
        <ToolDirectory categories={categories} />

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
            nothing you type is sent anywhere. The exceptions are the four document converters —{" "}
            <Link href="/pdf/to-word" className="prose-link">PDF to Word</Link>,{" "}
            <Link href="/pdf/word-to-pdf" className="prose-link">Word to PDF</Link>,{" "}
            <Link href="/pdf/powerpoint-to-pdf" className="prose-link">PowerPoint to PDF</Link>, and{" "}
            <Link href="/pdf/excel-to-pdf" className="prose-link">Excel to PDF</Link> —
            which need a server to rebuild the document and say so up front.
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
          {/* This section closes the page again now that the newsletter card
              has moved to the tools (see PostDownloadPrompt.js), so the
              bottom padding is back to the 88px that separates a final
              section from the footer — the 56px it carried was sized to sit
              against the divider that used to follow it. */}
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

        {/* The newsletter card that used to close this page has moved to the
            tools themselves — see PostDownloadPrompt.js. The old placement
            followed a sound principle (ask only after delivering value) but
            applied it to the wrong page: on a directory, a visitor who has
            scrolled to the foot has still not *used* anything, so the ask
            landed on someone who had received nothing. It now appears under
            a finished download, which is the first moment the value is real.
            The signup remains reachable from the blog index and every post. */}

    </div>
  );
}
