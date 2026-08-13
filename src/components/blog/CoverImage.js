import Image from "next/image";
import { COVER_HEIGHT, COVER_WIDTH } from "@/lib/blogCover";
import { colors } from "@/lib/theme";

// A post's cover image, used both as the hero on a post page and as the
// thumbnail on an index card.
//
// next/image rather than a bare <img>, and this is the first place on the
// site that uses it. The reason is specific rather than habitual: these are
// the only images here whose intrinsic size (1200x630) is far larger than
// their rendered size, so the automatic srcset is a real bandwidth saving on
// the index, and the enforced width/height reserve the box before the file
// arrives. Without that reservation the index's text jumps down as each
// thumbnail loads, which is the classic layout-shift failure and is measured
// directly by Core Web Vitals. (PdfPageThumbnail deliberately does NOT use
// next/image — those are runtime-generated blob URLs of unknown size, which
// is the opposite situation.)
//
// `variant` selects the two shapes rather than exposing raw styling, so the
// aspect ratio and rounding stay consistent between the two call sites.
export default function CoverImage({ post, variant = "hero", priority = false }) {
  if (!post.cover) return null;

  const isHero = variant === "hero";

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        // Fixed aspect ratio, not a fixed height: the box scales with the
        // column while still reserving space, so nothing shifts on any
        // viewport. 1200/630 matches the source, so `cover` never crops a
        // correctly-sized image.
        aspectRatio: `${COVER_WIDTH} / ${COVER_HEIGHT}`,
        borderRadius: isHero ? "14px" : "10px",
        overflow: "hidden",
        border: `1px solid ${colors.border}`,
        backgroundColor: colors.surfaceMuted,
        marginBottom: isHero ? "32px" : "14px",
      }}
    >
      <Image
        src={post.cover}
        alt={post.coverAlt}
        fill
        // Tells next/image how wide the rendered image actually is, so it can
        // pick a sensible srcset entry. Getting this wrong is the most common
        // next/image mistake: the default assumes 100vw and ships a
        // full-width file for a card thumbnail.
        sizes={isHero ? "(max-width: 760px) 100vw, 720px" : "(max-width: 760px) 100vw, 712px"}
        // Only the post-page hero is eligible: it is the LCP element there.
        // Marking index thumbnails priority would preload every one of them
        // and compete with the page's own critical resources.
        priority={priority}
        style={{ objectFit: "cover" }}
      />
    </div>
  );
}
