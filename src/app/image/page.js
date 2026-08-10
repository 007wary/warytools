import ToolCard from "@/components/ToolCard";
import HubHeader from "@/components/HubHeader";
import JsonLd from "@/components/JsonLd";
import { categories } from "@/lib/tools";
import { jsonLdGraph, collectionPageJsonLd, breadcrumbJsonLd } from "@/lib/jsonLd";
import { pageMetadata } from "@/lib/pageMetadata";

// Three of the six tools, not four. The layout appends " — WaryTools", and the
// previous four-verb title reached 65 characters with it — past the ~60 Google
// renders, so "Favicon" was being truncated mid-word and the title ended in an
// ellipsis. The three kept are the highest-volume searches of the set; the full
// list lives in the description and on the cards below, both of which have room.
const title = "Free Image Tools — Compress, Resize, Convert";
const description =
  "Free tools to compress, resize, convert, and watermark JPG, PNG, WebP, and AVIF images, generate favicons, and remove EXIF and GPS data. Nothing uploaded.";

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
      {/* The description previously said "using the Canvas API", which stopped
          being true when EXIF Stripper shipped — it edits the file container
          directly and never decodes to a canvas, which is the whole reason it
          can strip metadata without re-compressing the image. Naming the
          mechanism was never the point; "in your browser" is the claim that
          actually matters to a reader. */}
      <HubHeader
        categorySlug="image"
        icon={category.icon}
        title="Free Image Tools"
        description="All image tools run 100% in your browser. Files are never uploaded to a server."
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
