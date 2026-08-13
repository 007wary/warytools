import { mdxComponents } from "./MdxComponents";
import Callout from "./Callout";
import ToolCallout from "./ToolCallout";

// Loads and renders one post's compiled MDX.
//
// The import specifier is a template literal with a leading `@/content/...`
// prefix, which webpack/Turbopack resolve into a *context module*: every .mdx
// file in that directory is compiled and code-split at build time, and the
// slug selects among them. A fully dynamic `import(slug)` with no static
// prefix would be unresolvable at build time and fail — the literal prefix and
// the `.mdx` suffix are what make this work, so keep both if this line is
// ever edited.
//
// Posts are prerendered (generateStaticParams + dynamicParams=false), so this
// runs at build time and no chunk is fetched at runtime.
export default async function PostBody({ slug }) {
  const { default: Content } = await import(`@/content/blog/${slug}.mdx`);

  return (
    <div>
      <Content
        components={{
          ...mdxComponents,
          // Components a post can use by name without importing them. Kept
          // deliberately short: a post is prose, and every component added
          // here is one more thing an author has to know exists. Anything
          // more specialised should be imported explicitly by the one post
          // that needs it.
          Callout,
          ToolCallout,
        }}
      />
    </div>
  );
}
