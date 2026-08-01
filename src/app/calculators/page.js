import ToolCard from "@/components/ToolCard";
import HubHeader from "@/components/HubHeader";
import { categories } from "@/lib/tools";

export const metadata = {
  title: "Free Online Calculators — WaryTools",
  description:
    "Age, percentage, GST, interest, unit conversion, and date difference calculators. Fast, free, and instant results.",
};

export default function CalculatorsHubPage() {
  const category = categories.find((c) => c.slug === "calculators");

  return (
    <section style={{ maxWidth: "1200px", margin: "0 auto", padding: "48px 20px 80px" }}>
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
          />
        ))}
      </div>
    </section>
  );
}
