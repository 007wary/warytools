// Builds a complete Next.js `metadata` object for a page.
//
// Why this exists: setting `openGraph: { title, description }` in a page's
// metadata REPLACES the root layout's openGraph object rather than merging
// into it. Every page that did so silently dropped og:image, og:type,
// og:site_name and og:url, and Twitter fell back from summary_large_image to
// a small summary card — so every tool and hub page shared with no preview
// image at all. Routing every page through this helper makes the full set
// unrepresentable-to-forget.
//
// The layout still declares its own openGraph/twitter defaults for the
// homepage and for any route that renders without calling this.

const SITE_NAME = "WaryTools";

// Matches the og:image alt text to what src/app/opengraph-image.js actually
// renders, so the alt is descriptive rather than a generic brand string.
const OG_IMAGE_ALT =
  "WaryTools — free PDF, image and calculator tools that run in your browser";

/**
 * @param {object} args
 * @param {string} args.title    Page title WITHOUT the brand suffix; the root
 *                               layout's template appends " — WaryTools".
 * @param {string} args.description
 * @param {string} args.path     Root-relative canonical path ("/pdf/merge").
 * @param {"website"|"article"} [args.ogType]
 */
export function pageMetadata({ title, description, path, ogType = "website" }) {
  // og:title has no template applied to it, so the brand is added explicitly
  // here to match the rendered <title>. Doing it in one place stops pages
  // drifting into "Title — WaryTools — WaryTools" or omitting the brand.
  const socialTitle = `${title} — ${SITE_NAME}`;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: socialTitle,
      description,
      url: path,
      siteName: SITE_NAME,
      type: ogType,
      locale: "en_US",
      // Inherits the site-wide opengraph-image.js output via metadataBase.
      // Declared explicitly because replacing `openGraph` drops the inherited
      // image entirely.
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: OG_IMAGE_ALT }],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: [{ url: "/opengraph-image", alt: OG_IMAGE_ALT }],
    },
  };
}
