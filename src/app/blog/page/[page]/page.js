import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import BlogIndex from "@/components/blog/BlogIndex";
import { getAllPosts } from "@/lib/blogPosts";
import { isoDate } from "@/lib/blogPostList";
import { blogPagePath, paginatePosts, paginationParams, parsePageParam } from "@/lib/blogPagination";
import { blogJsonLd, breadcrumbJsonLd, jsonLdGraph } from "@/lib/jsonLd";
import { pageMetadata } from "@/lib/pageMetadata";

// Pages 2..N of the blog index. Page 1 is /blog and has no twin here — see
// blogPagination.js for why that asymmetry is load-bearing rather than untidy.
//
// This route sits at /blog/page/[page], which shares its parent segment with
// /blog/[slug]. Next resolves the literal "page" segment ahead of the dynamic
// one, so the two coexist — but that also means a post slugged "page" would be
// permanently unreachable, shadowed with nothing throwing and nothing in the
// build output saying so. blogFrontmatter.js refuses that slug for exactly
// this reason; don't remove one guard without the other.

const blogDescription =
  "Guides, explainers, and release notes from WaryTools — how to get things done with PDFs and images, and what's new on the site.";

// Every page number is known at build time, so all of them prerender.
export function generateStaticParams() {
  return paginationParams(getAllPosts().length).map((page) => ({ page }));
}

// A page number outside generateStaticParams 404s rather than rendering on
// demand. Posts only come from the repo, so the page count is fully known at
// build time and any other number is a dead link or a probe — never a page
// that exists. Without this, /blog/page/99 would be rendered on request and
// (because the route itself resolves) could return a 200 shell.
export const dynamicParams = false;

export async function generateMetadata({ params }) {
  const page = parsePageParam((await params).page);
  if (page === null) return {};

  const pagination = paginatePosts(getAllPosts(), page);
  if (!pagination) return {};

  return pageMetadata({
    // The page number is in the title deliberately. Without it every index
    // page shares one <title>, which reads as duplicate content to a crawler
    // and gives a reader with several tabs open no way to tell them apart.
    title: `Blog — Page ${page}`,
    description: `${blogDescription} Page ${page} of ${pagination.totalPages}.`,
    // Self-canonical, NOT canonical to /blog. Pointing every page at /blog
    // looks like tidy consolidation and is actively harmful: it tells Google
    // the posts listed only on page 3 belong to a URL that does not list
    // them, so those posts lose the one internal link pointing at them.
    path: blogPagePath(page),
  });
}

export default async function BlogPaginatedPage({ params }) {
  const page = parsePageParam((await params).page);

  // Covers "1" (which belongs at /blog) and every malformed form the regex
  // rejects. dynamicParams already 404s unknown params at the routing layer;
  // this is the guard for the values that ARE built but must not render.
  if (page === null) notFound();

  const pagination = paginatePosts(getAllPosts(), page);

  // Out of range. Deliberately a 404 rather than an empty list: an index page
  // rendering "no posts" at a 200 response is a soft 404 — indexable, and
  // saying nothing.
  if (!pagination) notFound();

  return (
    <>
      <JsonLd
        data={jsonLdGraph(
          blogJsonLd({
            name: "WaryTools Blog",
            description: blogDescription,
            href: blogPagePath(page),
            // This page's posts only — see the note on the /blog index.
            posts: pagination.posts.map((post) => ({
              title: post.title,
              href: `/blog/${post.slug}`,
              datePublished: isoDate(post.date),
            })),
          }),
          breadcrumbJsonLd([
            { name: "Home", href: "/" },
            // The trail goes Home → Blog → this page rather than inventing a
            // "Page" level for the /blog/page segment, which is a routing
            // artefact and not a page anyone can visit.
            { name: "Blog", href: "/blog" },
            { name: `Page ${page}`, href: blogPagePath(page) },
          ]),
        )}
      />

      <BlogIndex pagination={pagination} />
    </>
  );
}
