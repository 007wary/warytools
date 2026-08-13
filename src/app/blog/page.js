import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import PostCard from "@/components/blog/PostCard";
import { getAllPosts } from "@/lib/blogPosts";
import { isoDate } from "@/lib/blogPostList";
import { colors } from "@/lib/theme";
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
  const posts = getAllPosts();

  return (
    <>
      <JsonLd
        data={jsonLdGraph(
          blogJsonLd({
            name: "WaryTools Blog",
            description: blogDescription,
            href: "/blog",
            posts: posts.map((post) => ({
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

      <main style={{ maxWidth: "760px", margin: "0 auto", padding: "48px 20px 72px" }}>
        <h1
          style={{
            fontSize: "34px",
            fontWeight: 700,
            color: colors.text,
            margin: "0 0 12px",
            letterSpacing: "-0.02em",
          }}
        >
          Blog
        </h1>
        <p
          style={{
            fontSize: "16.5px",
            lineHeight: 1.7,
            color: colors.textMuted,
            margin: "0 0 40px",
            maxWidth: "620px",
          }}
        >
          Guides for getting a specific job done, explainers on how file formats actually
          work, and notes on what&rsquo;s changed here. Every tool mentioned is free and
          most run entirely in your browser.
        </p>

        {posts.length === 0 ? (
          // A real empty state rather than a blank page. This renders only
          // before the first post ships, but a bare heading with nothing under
          // it reads as a broken page rather than a new one.
          <p style={{ fontSize: "15px", color: colors.textMuted, lineHeight: 1.7 }}>
            No posts yet. In the meantime, the{" "}
            <Link href="/" style={{ color: colors.primary }}>
              tools themselves
            </Link>{" "}
            are all live and free to use.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {posts.map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
