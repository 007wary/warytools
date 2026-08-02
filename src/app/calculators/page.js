import ToolCard from "@/components/ToolCard";
import HubHeader from "@/components/HubHeader";
import JsonLd from "@/components/JsonLd";
import { categories } from "@/lib/tools";
import { jsonLdGraph, collectionPageJsonLd, breadcrumbJsonLd } from "@/lib/jsonLd";

const title = "Free Online Calculators";
const description =
  "Age, percentage, GST, interest, unit conversion, and date difference calculators. Fast, free, and instant results.";

export const metadata = {
  title,
  description,
  alternates: {
    canonical: "/calculators",
  },
  openGraph: { title: `${title} — WaryTools`, description },
  twitter: { title: `${title} — WaryTools`, description },
};

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
      <HubHeader
        categorySlug="calculators"
        icon={category.icon}
        title="Calculators"
        description="Quick, free calculators for everyday math — no ads, no clutter."
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
