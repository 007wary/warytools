import Link from "next/link";
import { displayDate, isoDate } from "@/lib/blogPostList";
import { colors } from "@/lib/theme";
import CategoryBadge from "./CategoryBadge";

// One post in the /blog index list.
//
// The whole card is a single <Link> rather than a div with a link in the
// title: a card-shaped click target that only works on four words of text is
// the most common quiet usability failure in blog indexes. The heading stays
// an <h2> inside it so the page keeps a real document outline.
export default function PostCard({ post }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      style={{
        display: "block",
        padding: "22px 24px",
        borderRadius: "14px",
        border: `1px solid ${colors.border}`,
        backgroundColor: colors.surface,
        textDecoration: "none",
      }}
    >
      {/* No thumbnail here, deliberately. The index is a scanning surface —
          title and description are what someone reads to choose a post, and a
          1.91:1 image above each card pushes roughly one card per screen on a
          phone. The cover still does its work where it earns its place: the
          post page hero, og:image, and the BlogPosting JSON-LD.
          <CoverImage variant="thumbnail"> remains available if the index is
          ever reworked into a grid, where the ratio would cost far less. */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", flexWrap: "wrap" }}>
        <CategoryBadge category={post.category} />
        <time
          dateTime={isoDate(post.date)}
          style={{ fontSize: "13px", color: colors.textFaint }}
        >
          {displayDate(post.date)}
        </time>
        <span style={{ fontSize: "13px", color: colors.textFaint }} aria-hidden="true">
          ·
        </span>
        <span style={{ fontSize: "13px", color: colors.textFaint }}>
          {post.readingTime} min read
        </span>
        {post.draft && (
          // Only ever rendered in `next dev` — drafts are excluded from
          // production builds entirely (see blogPosts.js).
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: colors.warningText,
              border: `1px solid ${colors.warningSoftBorder}`,
              backgroundColor: colors.warningSoft,
              borderRadius: "999px",
              padding: "2px 8px",
            }}
          >
            Draft
          </span>
        )}
      </div>

      <h2
        style={{
          fontSize: "20px",
          fontWeight: 600,
          color: colors.text,
          lineHeight: 1.35,
          margin: "0 0 8px",
        }}
      >
        {post.title}
      </h2>

      {/* No supplementary sr-only label here: the badge, date, title and
          description are all real text inside the link, so a screen reader
          already announces the card in full. Adding "Read: <title>" would
          make it announce the title twice. */}
      <p style={{ fontSize: "14.5px", lineHeight: 1.65, color: colors.textMuted, margin: 0 }}>
        {post.description}
      </p>
    </Link>
  );
}
