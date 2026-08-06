import ToolCard from "@/components/ToolCard";
import HubHeader from "@/components/HubHeader";
import JsonLd from "@/components/JsonLd";
import { categories } from "@/lib/tools";
import { jsonLdGraph, collectionPageJsonLd, breadcrumbJsonLd } from "@/lib/jsonLd";
import { pageMetadata } from "@/lib/pageMetadata";

const title = "Free PDF Tools — Merge, Split, Compress";
const description =
  "Free online PDF tools to merge, split, compress, rotate, reorder, and convert PDF to Word. No sign-up, no watermarks, no file size games.";

export const metadata = pageMetadata({ title, description, path: "/pdf" });

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
        title="Free PDF Tools"
        description="Every PDF tool here runs in your browser, with two exceptions — PDF to Word and Word to PDF convert on our server, and both say so before you pick a file."
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
