import ToolCard from "@/components/ToolCard";
import HubHeader from "@/components/HubHeader";
import JsonLd from "@/components/JsonLd";
import { categories } from "@/lib/tools";
import { jsonLdGraph, collectionPageJsonLd, breadcrumbJsonLd } from "@/lib/jsonLd";

const title = "Free PDF Tools";
const description =
  "Merge, split, compress, rotate, and reorder PDF files for free. Everything runs in your browser — your files never leave your device.";

export const metadata = {
  title,
  description,
  alternates: {
    canonical: "/pdf",
  },
  openGraph: { title: `${title} — WaryTools`, description },
  twitter: { title: `${title} — WaryTools`, description },
};

export default function PdfHubPage() {
  const category = categories.find((c) => c.slug === "pdf");

  return (
    <section style={{ maxWidth: "1200px", margin: "0 auto", padding: "48px 20px 80px" }}>
      <JsonLd
        data={jsonLdGraph(
          collectionPageJsonLd({ name: title, description, href: "/pdf", tools: category.tools }),
          breadcrumbJsonLd([
            { name: "Home", href: "/" },
            { name: "PDF Tools", href: "/pdf" },
          ])
        )}
      />
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
            headingLevel="h2"
          />
        ))}
      </div>
    </section>
  );
}
