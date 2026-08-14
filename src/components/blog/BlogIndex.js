import Link from "next/link";
import PostCard from "./PostCard";
import Pagination from "@/components/Pagination";
import NewsletterSignup from "@/components/NewsletterSignup";
import { colors } from "@/lib/theme";

// The /blog index body, shared by /blog (page 1) and /blog/page/[page].
//
// Extracted rather than duplicated: two copies of a list page drift the moment
// one of them gains a filter, a heading change, or a newsletter tweak, and the
// divergence is invisible until someone lands on page 2 and finds a slightly
// different site. Same reasoning as imageWatermarkDraw.js being one function
// shared by the worker and the preview.
//
// The intro paragraph is deliberately page-1-only. It is orientation copy for
// someone arriving at the blog; repeating it above page 4 pushes the posts
// down for a reader who has already read it and is mid-scan.
export default function BlogIndex({ pagination }) {
  const { posts, page, totalPages, previousPath, nextPath, from, to, total } = pagination;
  const isFirstPage = page === 1;

  return (
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

      {isFirstPage ? (
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
      ) : (
        // Later pages get a short position line instead. It doubles as the
        // route back to page 1, which prev/next alone cannot offer from deep
        // in the archive without repeated clicks.
        <p
          style={{
            fontSize: "15px",
            lineHeight: 1.7,
            color: colors.textMuted,
            margin: "0 0 40px",
          }}
        >
          Page {page} of {totalPages}.{" "}
          <Link href="/blog" style={{ color: colors.primary }}>
            Back to the latest posts
          </Link>
          .
        </p>
      )}

      {posts.length === 0 ? (
        // A real empty state rather than a blank page. This renders only
        // before the first post ships, but a bare heading with nothing under
        // it reads as a broken page rather than a new one.
        //
        // Only reachable on page 1: an out-of-range page number 404s in the
        // route rather than rendering an empty list, since an empty index at a
        // 200 response is a soft 404 — indexable, and saying nothing.
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

      <Pagination
        page={page}
        totalPages={totalPages}
        previousPath={previousPath}
        nextPath={nextPath}
        from={from}
        to={to}
        total={total}
      />

      {/* Below the list, so it never displaces the posts someone came here
          to scan. Shown even in the empty state: before the first post
          ships, "tell me when there is one" is the only useful action the
          page can offer. Shown on every page rather than page 1 only —
          someone who has read to the bottom of page 3 is a more likely
          subscriber than someone who just arrived, not a less likely one.

          The rule above it is doing real work rather than decorating. The
          signup card and a PostCard share a border, radius and surface, so
          stacked with only a gap between them the newsletter reads as one
          more post in the list — the eye groups by repeated shape before it
          reads any text. The rule says "the list ended here", which is what
          lets the card below be understood as a different kind of thing. */}
      <div style={{ marginTop: "48px" }}>
        <div
          // Decorative, so it is a styled div rather than an <hr>: an <hr>
          // is a semantic thematic break that screen readers announce, and
          // the heading inside the card already conveys the section change.
          aria-hidden="true"
          style={{
            height: "1px",
            backgroundColor: colors.border,
            marginBottom: "48px",
          }}
        />
        <NewsletterSignup
          title="Get new posts by email"
          body="A short email whenever a new guide or tool goes live. Usually once or twice a month. Unsubscribe in one click."
        />
      </div>
    </main>
  );
}
