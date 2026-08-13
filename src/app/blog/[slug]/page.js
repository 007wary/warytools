import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import JsonLd from "@/components/JsonLd";
import CategoryBadge from "@/components/blog/CategoryBadge";
import CoverImage from "@/components/blog/CoverImage";
import PostBody from "@/components/blog/PostBody";
import RelatedPosts from "@/components/blog/RelatedPosts";
import { getAllPosts, getPostBySlug, getPostSlugs } from "@/lib/blogPosts";
import { displayDate, isoDate, relatedPosts } from "@/lib/blogPostList";
import { CATEGORIES } from "@/lib/blogFrontmatter";
import { coverImageUrl } from "@/lib/blogCover";
import { SITE_URL } from "@/lib/siteUrl";
import { colors } from "@/lib/theme";
import { blogPostingJsonLd, breadcrumbJsonLd, jsonLdGraph } from "@/lib/jsonLd";
import { pageMetadata } from "@/lib/pageMetadata";

// Every post is known at build time, so all of them prerender to static HTML.
export function generateStaticParams() {
  return getPostSlugs().map((slug) => ({ slug }));
}

// A slug outside generateStaticParams 404s rather than being rendered on
// demand. There is no source of posts other than the repo, so a request for
// an unknown slug is a dead link or a probe — never a post that exists.
export const dynamicParams = false;

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) return {};

  const base = pageMetadata({
    title: post.title,
    description: post.description,
    path: `/blog/${slug}`,
    // og:type=article is what makes a shared link render as an article card
    // with a published time rather than as a generic website.
    ogType: "article",
  });

  // A post with its own cover overrides the site-wide OG card, so it is
  // distinguishable in a feed. Posts without one keep the site card — a
  // shared link with no image at all is the worse outcome.
  // Declared dimensions come from the file itself, never from the recommended
  // target: a crawler that trusts these tags without fetching the image lays
  // the preview out to the declared box, so a wrong size renders letterboxed
  // or cropped with nothing in the page's HTML looking incorrect.
  const cover = post.cover
    ? [
        {
          url: post.cover,
          width: post.coverWidth,
          height: post.coverHeight,
          alt: post.coverAlt,
        },
      ]
    : base.openGraph.images;

  // The article-only OG fields are spread onto the result rather than added
  // to pageMetadata's signature: that helper is shared with ~30 tool and hub
  // pages, none of which should grow an article-shaped openGraph block. Note
  // the spread of `base.openGraph` is required — assigning a bare object here
  // would drop og:site_name and og:url, which is the exact failure
  // pageMetadata exists to prevent (see its header comment).
  return {
    ...base,
    openGraph: {
      ...base.openGraph,
      images: cover,
      publishedTime: isoDate(post.date),
      ...(post.updated ? { modifiedTime: isoDate(post.updated) } : {}),
      tags: post.tags,
    },
    twitter: {
      ...base.twitter,
      images: cover,
    },
  };
}

export default async function BlogPostPage({ params }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  // Unreachable with dynamicParams=false, but kept: it is the correct
  // behaviour if that flag is ever relaxed, and costs one branch.
  if (!post) notFound();

  const related = relatedPosts(post, getAllPosts());
  const category = CATEGORIES[post.category];

  return (
    <>
      <JsonLd
        data={jsonLdGraph(
          blogPostingJsonLd({
            title: post.title,
            description: post.description,
            href: `/blog/${slug}`,
            datePublished: isoDate(post.date),
            dateModified: post.updated ? isoDate(post.updated) : null,
            section: category.label,
            keywords: post.tags,
            // Absent for posts with no cover of their own. Pointing every
            // post at the shared site card would be the same picture on
            // every article, which Google's article guidance treats as worse
            // than declaring none.
            image: coverImageUrl(post, SITE_URL),
          }),
          breadcrumbJsonLd([
            { name: "Home", href: "/" },
            { name: "Blog", href: "/blog" },
            { name: post.title, href: `/blog/${slug}` },
          ]),
        )}
      />

      <main style={{ maxWidth: "720px", margin: "0 auto", padding: "40px 20px 72px" }}>
        <Link
          href="/blog"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "13.5px",
            color: colors.textMuted,
            textDecoration: "none",
            marginBottom: "28px",
          }}
        >
          <ArrowLeft size={15} aria-hidden="true" />
          All posts
        </Link>

        <article>
          <header style={{ marginBottom: "36px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "16px",
                flexWrap: "wrap",
              }}
            >
              <CategoryBadge category={post.category} />
              <time dateTime={isoDate(post.date)} style={{ fontSize: "13.5px", color: colors.textFaint }}>
                {displayDate(post.date)}
              </time>
              <span style={{ fontSize: "13.5px", color: colors.textFaint }} aria-hidden="true">
                ·
              </span>
              <span style={{ fontSize: "13.5px", color: colors.textFaint }}>
                {post.readingTime} min read
              </span>
            </div>

            <h1
              style={{
                fontSize: "34px",
                fontWeight: 700,
                color: colors.text,
                lineHeight: 1.25,
                letterSpacing: "-0.02em",
                margin: "0 0 14px",
              }}
            >
              {post.title}
            </h1>

            {/* The description doubles as the standfirst. It is written as the
                meta description, which is the same job a standfirst does —
                state what the piece delivers in one sentence — so writing a
                second one would only create two things to keep in sync. */}
            <p style={{ fontSize: "17.5px", lineHeight: 1.65, color: colors.textMuted, margin: 0 }}>
              {post.description}
            </p>

            {post.updated && (
              <p style={{ fontSize: "13px", color: colors.textFaint, margin: "16px 0 0" }}>
                Updated {displayDate(post.updated)}
              </p>
            )}
          </header>

          {/* Below the header, not above it. A hero pushed to the very top
              displaces the title and standfirst below the fold on a phone,
              so the reader's first screen is a picture and no indication of
              what they opened. `priority` because this is the post page's LCP
              element once a cover is present. */}
          <CoverImage post={post} variant="hero" priority />

          <PostBody slug={slug} />
        </article>

        <RelatedPosts posts={related} />
      </main>
    </>
  );
}
