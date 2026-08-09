import ToolCard from "@/components/ToolCard";
import HubHeader from "@/components/HubHeader";
import JsonLd from "@/components/JsonLd";
import { categories } from "@/lib/tools";
import { jsonLdGraph, collectionPageJsonLd, breadcrumbJsonLd } from "@/lib/jsonLd";
import { pageMetadata } from "@/lib/pageMetadata";

const title = "Free Online Calculators — Age, Percentage, GST";
const description =
  "Free online calculators for age, percentage, GST, simple and compound interest, unit conversion, and date differences. Instant results, no sign-up.";

export const metadata = pageMetadata({ title, description, path: "/calculators" });

export default function CalculatorsHubPage() {
  const category = categories.find((c) => c.slug === "calculators");

  return (
    <section style={{ maxWidth: "1200px", margin: "0 auto", padding: "48px 20px 80px" }}>
      <JsonLd
        data={jsonLdGraph(
          collectionPageJsonLd({ name: title, description, href: "/calculators", tools: category.tools }),
          breadcrumbJsonLd([
            { name: "Home", href: "/" },
            { name: "Calculators", href: "/calculators" },
          ])
        )}
      />
      {/* The description says "no sign-up, no clutter" and deliberately not
          "no ads" — the site runs AdSense; see the homepage description and
          lib/adsense.js. "No clutter" remains honest: it describes the tools
          themselves, which carry no interstitials or upsells. */}
      <HubHeader
        categorySlug="calculators"
        icon={category.icon}
        title="Free Online Calculators"
        description="Quick, free calculators for everyday math — no sign-up, no clutter."
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: "16px",
        }}
      >
        {category.tools.map((tool) => (
          <ToolCard
            key={tool.slug}
            title={tool.title}
            description={tool.description}
            href={tool.href}
            icon={tool.icon}
            category="calculators"
            headingLevel="h2"
          />
        ))}
      </div>
    </section>
  );
}
