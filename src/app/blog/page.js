import JsonLd from "@/components/JsonLd";
import BlogIndex from "@/components/blog/BlogIndex";
import { getAllPosts } from "@/lib/blogPosts";
import { isoDate } from "@/lib/blogPostList";
import { paginatePosts } from "@/lib/blogPagination";
import { blogJsonLd, breadcrumbJsonLd, jsonLdGraph } from "@/lib/jsonLd";
import { pageMetadata } from "@/lib/pageMetadata";

const blogTitle = "Blog";
const blogDescription =
  "Guides, explainers, and release notes from WaryTools — how to get things done with PDFs and images, and what's new on the site.";

const base = pageMetadata({
  title: blogTitle,
  description: blogDescription,
  path: "/blog",
});

export const metadata = {
  ...base,
  alternates: {
    ...base.alternates,
    // Without this <link rel="alternate">, the RSS feed exists but nothing
    // discovers it: reader extensions and aggregators look for the tag rather
    // than guessing /feed.xml, so an undeclared feed is one only people told
    // its URL can subscribe to.
    types: { "application/rss+xml": [{ url: "/blog/feed.xml", title: "WaryTools Blog" }] },
  },
};

export default function BlogIndexPage() {
  // Page 1. Later pages are served by /blog/page/[page] — page 1 deliberately
  // has no /blog/page/1 twin, since two crawlable URLs holding the same ten
  // posts compete with each other for the same query.
  //
  // Non-null by construction: page 1 is always in range, including on an empty
  // blog (totalPages has a floor of 1), which is what lets the empty state
  // render here rather than 404ing the only page that can explain it.
  const pagination = paginatePosts(getAllPosts(), 1);

  return (
    <>
      <JsonLd
        data={jsonLdGraph(
          blogJsonLd({
            name: "WaryTools Blog",
            description: blogDescription,
            href: "/blog",
            // Only the posts this page actually lists. Declaring the whole
            // archive on every index page tells a crawler each page contains
            // posts it cannot find in the markup, which is the same kind of
            // misstatement as declaring og:image dimensions that don't match
            // the file.
            posts: pagination.posts.map((post) => ({
              title: post.title,
              href: `/blog/${post.slug}`,
              datePublished: isoDate(post.date),
            })),
          }),
          breadcrumbJsonLd([
            { name: "Home", href: "/" },
            { name: "Blog", href: "/blog" },
          ]),
        )}
      />

      <BlogIndex pagination={pagination} />
    </>
  );
}
