// Renders a schema.org object (or @graph) as a JSON-LD <script> tag.
// `data` must be a plain, pre-built object — see src/lib/jsonLd.js.
export default function JsonLd({ data }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
