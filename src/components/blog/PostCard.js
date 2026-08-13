import Link from "next/link";
import { displayDate, isoDate } from "@/lib/blogPostList";
import { colors } from "@/lib/theme";
import CategoryBadge from "./CategoryBadge";
import CoverImage from "./CoverImage";

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
      {/* Above the metadata row, which is the one place it does not push the
          title off a phone screen: the card is already a self-contained unit,
          so the image reads as its lead rather than as an interruption.
          Renders nothing at all for a post without a cover, so a mixed index
          degrades to the text-only card rather than leaving a gap. */}
      <CoverImage post={post} variant="thumbnail" />

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
