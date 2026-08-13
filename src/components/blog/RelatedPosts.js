import Link from "next/link";
import { displayDate, isoDate } from "@/lib/blogPostList";
import { colors } from "@/lib/theme";
import CategoryBadge from "./CategoryBadge";

// "Keep reading" links at the foot of a post. The blog's counterpart to
// RelatedTools on a tool page, and there for the same reason: a real internal
// linking path between related pages rather than relying on the navbar.
//
// Renders nothing when there is no related post, rather than falling back to
// "latest posts". A related block padded with unrelated articles trains
// readers to ignore it, which costs more than the empty space saves.
export default function RelatedPosts({ posts }) {
  if (!posts || posts.length === 0) return null;

  return (
    <section
      style={{ marginTop: "56px", paddingTop: "32px", borderTop: `1px solid ${colors.border}` }}
    >
      <h2 style={{ fontSize: "17px", fontWeight: 600, color: colors.text, margin: "0 0 18px" }}>
        Keep reading
      </h2>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {posts.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            style={{
              display: "block",
              padding: "16px 18px",
              borderRadius: "12px",
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.surface,
              textDecoration: "none",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "9px",
                marginBottom: "7px",
                flexWrap: "wrap",
              }}
            >
              <CategoryBadge category={post.category} />
              <time dateTime={isoDate(post.date)} style={{ fontSize: "12.5px", color: colors.textFaint }}>
                {displayDate(post.date)}
              </time>
            </div>

            {/* h3, not h2: this sits under the section's own h2, so a h2 here
                would flatten the outline and make each related post read as a
                sibling of "Keep reading" rather than an item within it. */}
            <h3 style={{ fontSize: "16px", fontWeight: 600, color: colors.text, margin: "0 0 5px", lineHeight: 1.4 }}>
              {post.title}
            </h3>
            <p style={{ fontSize: "13.5px", color: colors.textMuted, lineHeight: 1.6, margin: 0 }}>
              {post.description}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
