import { categories, allTools } from "@/lib/tools";
import { colors, categoryColors } from "@/lib/theme";
import { ToolSearchProvider, ToolSearchBox, ToolSearchGrid } from "@/components/ToolSearch";
import JsonLd from "@/components/JsonLd";
import { jsonLdGraph, collectionPageJsonLd } from "@/lib/jsonLd";

const title = "Free Online PDF, Image & Calculator Tools";
const description =
  "Free PDF, image, calculator, and URL shortener tools that run entirely in your browser — no uploads, no sign-up, no ads.";

export const metadata = {
  title,
  description,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: `WaryTools — ${title}`,
    description,
  },
  twitter: {
    title: `WaryTools — ${title}`,
    description,
  },
};

export default function HomePage() {
  return (
    <ToolSearchProvider>
      <div>
        <JsonLd
          data={jsonLdGraph(
            collectionPageJsonLd({
              name: "WaryTools",
              description,
              href: "/",
              tools: allTools,
            })
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
            Free Online Tools,
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
            PDF, image, and calculator tools that run entirely in your browser. No uploads, no
            sign-up, no waiting. {allTools.length} tools and counting.
          </p>

          <ToolSearchBox />
        </section>

        {/* Tool grid grouped by category, filtered by the search box above */}
        <ToolSearchGrid categories={categories} />
      </div>
    </ToolSearchProvider>
  );
}
