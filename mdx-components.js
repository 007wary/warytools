import { mdxComponents } from "@/components/blog/MdxComponents";

// Next requires this file at the project root when @next/mdx is enabled — it
// is the global MDX component map, and the build errors without it.
//
// The per-post <Content components={...} /> prop in PostBody.js is what
// actually renders posts and takes precedence, so this is a safety net rather
// than the primary path: it keeps any MDX rendered outside PostBody looking
// like the site instead of like unstyled browser defaults.
export function useMDXComponents(components) {
  return { ...mdxComponents, ...components };
}
