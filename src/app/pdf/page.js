import ToolCard from "@/components/ToolCard";
import HubHeader from "@/components/HubHeader";
import { categories } from "@/lib/tools";

export const metadata = {
  title: "Free PDF Tools — WaryTools",
  description:
    "Merge, split, compress, rotate, and reorder PDF files for free. Everything runs in your browser — your files never leave your device.",
};

export default function PdfHubPage() {
  const category = categories.find((c) => c.slug === "pdf");

  return (
    <section style={{ maxWidth: "1200px", margin: "0 auto", padding: "48px 20px 80px" }}>
      <HubHeader
        categorySlug="pdf"
        icon={category.icon}
        title="PDF Tools"
        description="All PDF tools run 100% in your browser. Files are never uploaded to a server."
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
            category="pdf"
          />
        ))}
      </div>
    </section>
  );
}
