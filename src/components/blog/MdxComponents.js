import Link from "next/link";
import { colors } from "@/lib/theme";

// The element map MDX bodies render through.
//
// This exists because the site has no CSS framework and no global element
// styles — everything is inline `style` objects on components (see
// CLAUDE.md). A raw MDX body would therefore render as unstyled browser
// defaults: Times New Roman headings, no spacing rhythm, links in default
// blue. Mapping every element here keeps post bodies visually part of the
// site without introducing a stylesheet that would then apply site-wide.
//
// Deliberately a plain object of server components — no "use client". MDX
// content is static, so nothing here needs interactivity, and marking it
// client would drag every post body into the JS bundle for no benefit.

// Turns a heading's text into a stable id for deep-linking (#how-it-works).
//
// Derived from the text rather than from a counter: an id like `heading-3`
// breaks the moment a section is inserted above it, silently invalidating
// every link anyone has shared to that section.
function headingId(children) {
  const text = extractText(children);
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

// MDX children arrive as strings, arrays, or React elements (a heading with
// inline `code` or a link inside it). Walking the tree is the only way to get
// the text; String(children) on an element yields "[object Object]", which
// would produce an id of "object-object" for every such heading — all
// identical, so every deep link would land on the first one.
function extractText(node) {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (node.props?.children) return extractText(node.props.children);
  return "";
}

const paragraph = {
  fontSize: "16.5px",
  lineHeight: 1.75,
  color: colors.textSecondary,
  margin: "0 0 20px",
};

function Heading({ level, children }) {
  const Tag = `h${level}`;
  const id = headingId(children);

  const sizes = { 2: "24px", 3: "19px", 4: "16.5px" };

  return (
    <Tag
      id={id}
      style={{
        fontSize: sizes[level] || "16.5px",
        fontWeight: 600,
        color: colors.text,
        lineHeight: 1.3,
        // Generous top margin, tight bottom: a heading should sit closer to
        // the text it introduces than to the section it follows, or the page
        // reads as evenly-spaced blocks with no hierarchy.
        margin: level === 2 ? "44px 0 14px" : "32px 0 12px",
        scrollMarginTop: "80px", // clears the sticky navbar on anchor jumps
      }}
    >
      {children}
    </Tag>
  );
}

export const mdxComponents = {
  h1: ({ children }) => <Heading level={2}>{children}</Heading>,
  h2: ({ children }) => <Heading level={2}>{children}</Heading>,
  h3: ({ children }) => <Heading level={3}>{children}</Heading>,
  h4: ({ children }) => <Heading level={4}>{children}</Heading>,

  p: ({ children }) => <p style={paragraph}>{children}</p>,

  // Internal links go through next/link for client-side navigation;
  // external ones get rel="noopener" and open in place (no target="_blank" —
  // hijacking the reader's tab decision is a small rudeness that adds up).
  a: ({ href = "", children }) => {
    const style = {
      color: colors.primary,
      textDecoration: "underline",
      textUnderlineOffset: "2px",
    };

    const isInternal = href.startsWith("/") || href.startsWith("#");

    if (isInternal) {
      return (
        <Link href={href} style={style}>
          {children}
        </Link>
      );
    }

    return (
      <a href={href} style={style} rel="noopener noreferrer">
        {children}
      </a>
    );
  },

  ul: ({ children }) => (
    <ul style={{ ...paragraph, paddingLeft: "22px", margin: "0 0 20px" }}>{children}</ul>
  ),
  ol: ({ children }) => (
    <ol style={{ ...paragraph, paddingLeft: "22px", margin: "0 0 20px" }}>{children}</ol>
  ),
  li: ({ children }) => <li style={{ marginBottom: "8px" }}>{children}</li>,

  strong: ({ children }) => (
    <strong style={{ fontWeight: 600, color: colors.text }}>{children}</strong>
  ),

  blockquote: ({ children }) => (
    <blockquote
      style={{
        borderLeft: `3px solid ${colors.primarySoftBorder}`,
        backgroundColor: colors.primarySoft,
        padding: "14px 18px",
        margin: "0 0 20px",
        borderRadius: "0 8px 8px 0",
      }}
    >
      {children}
    </blockquote>
  ),

  // Inline code. `pre` below handles blocks and resets this, since a `code`
  // inside a `pre` would otherwise get the pill background twice.
  code: ({ children }) => (
    <code
      style={{
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: "0.9em",
        backgroundColor: colors.surfaceMuted,
        border: `1px solid ${colors.borderMuted}`,
        borderRadius: "4px",
        padding: "1.5px 5px",
      }}
    >
      {children}
    </code>
  ),

  pre: ({ children }) => (
    <pre
      style={{
        backgroundColor: colors.surfaceMuted,
        border: `1px solid ${colors.border}`,
        borderRadius: "10px",
        padding: "16px 18px",
        // Code must scroll inside its own box. Without this a long line makes
        // the whole page scroll horizontally on mobile, which breaks every
        // other element's layout to accommodate one block.
        overflowX: "auto",
        fontSize: "13.5px",
        lineHeight: 1.6,
        margin: "0 0 20px",
      }}
    >
      {children}
    </pre>
  ),

  hr: () => (
    <hr style={{ border: "none", borderTop: `1px solid ${colors.border}`, margin: "36px 0" }} />
  ),

  // Tables come from remark-gfm (CommonMark has none) and scroll in their own
  // container for the same reason `pre` does. `minWidth` is what makes that
  // scroll actually happen: without it the table compresses to the viewport
  // and columns wrap to one word per line on a phone, which is unreadable in
  // a different way than overflowing would be.
  table: ({ children }) => (
    <div style={{ overflowX: "auto", margin: "0 0 20px" }}>
      <table
        style={{
          borderCollapse: "collapse",
          width: "100%",
          minWidth: "440px",
          fontSize: "14.5px",
        }}
      >
        {children}
      </table>
    </div>
  ),
  th: ({ children }) => (
    <th
      style={{
        textAlign: "left",
        padding: "9px 12px",
        borderBottom: `2px solid ${colors.border}`,
        color: colors.text,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td
      style={{
        padding: "9px 12px",
        borderBottom: `1px solid ${colors.borderMuted}`,
        color: colors.textSecondary,
      }}
    >
      {children}
    </td>
  ),
};
