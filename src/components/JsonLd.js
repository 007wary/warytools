// Renders a schema.org object (or @graph) as a JSON-LD <script> tag.
// `data` must be a plain, pre-built object — see src/lib/jsonLd.js.

/**
 * Escapes the three sequences that can break out of a <script> element.
 *
 * `dangerouslySetInnerHTML` writes raw markup, so React's usual escaping does
 * NOT apply here — inside a <script> the HTML parser is looking for `</script`
 * and ends the element the moment it sees one, wherever it appears, including
 * in the middle of a JSON string value. A title of
 *
 *     </script><img src=x onerror=alert(1)>
 *
 * would therefore close this tag and inject live markup into the page. The
 * other two sequences (`<!--`, and `<script`) matter for the same reason: they
 * shift the parser into states where the closing tag is read differently.
 *
 * Every input reaching this component today is authored content — the tool
 * registry and blog frontmatter, both fixed at build time — so this is not a
 * live hole being closed. It is a guard on a sink one commit away from becoming
 * one: the moment any of this data derives from a URL, a search param, or a
 * user-supplied field, the escape is what stands between that and stored XSS.
 * Adding it costs one pass over a short string per page.
 *
 * The replacements stay valid JSON and valid JSON-LD. `<` is exactly `<`
 * to any JSON parser, so consumers — including Google's structured-data
 * tooling — read identical data to what went in.
 */
function safeJsonLd(data) {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

export default function JsonLd({ data }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLd(data) }}
    />
  );
}
