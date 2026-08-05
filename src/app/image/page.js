import ToolCard from "@/components/ToolCard";
import HubHeader from "@/components/HubHeader";
import JsonLd from "@/components/JsonLd";
import { categories } from "@/lib/tools";
import { jsonLdGraph, collectionPageJsonLd, breadcrumbJsonLd } from "@/lib/jsonLd";
import { pageMetadata } from "@/lib/pageMetadata";

const title = "Free Image Tools — Compress, Resize, Convert";
const description =
  "Free online image tools to compress, resize, and convert JPG, PNG, and WebP files. No sign-up — everything runs in your browser, nothing uploaded.";

export const metadata = pageMetadata({ title, description, path: "/image" });

export default function ImageHubPage() {
  const category = categories.find((c) => c.slug === "image");

  return (
    <section style={{ maxWidth: "1200px", margin: "0 auto", padding: "48px 20px 80px" }}>
      <JsonLd
        data={jsonLdGraph(
          collectionPageJsonLd({ name: title, description, href: "/image", tools: category.tools }),
          breadcrumbJsonLd([
            { name: "Home", href: "/" },
            { name: "Image Tools", href: "/image" },
          ])
        )}
      />
      <HubHeader
        categorySlug="image"
        icon={category.icon}
        title="Free Image Tools"
        description="All image tools run 100% in your browser using the Canvas API. Files are never uploaded to a server."
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
            category="image"
            headingLevel="h2"
          />
        ))}
      </div>
    </section>
  );
}
