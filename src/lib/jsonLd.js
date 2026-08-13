// Structured-data (JSON-LD) builders shared across pages. Each function
// returns a plain schema.org object; render it via <JsonLd data={...} />
// (src/components/JsonLd.js). Keeping these as pure builders (no JSX) means
// they can run in server components without pulling in a client bundle.

import { SITE_URL, absoluteUrl } from "./siteUrl";

export { absoluteUrl };

export function organizationJsonLd() {
  return {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: "WaryTools",
    url: SITE_URL,
    // Raster, not the SVG: Google's logo structured-data field only accepts
    // formats it can crawl as an image (PNG/JPG/GIF), and ignores SVG.
    logo: `${SITE_URL}/icon-512.png`,
    description:
      "Free online tools for PDF editing, image processing, calculators, and URL shortening — all running client-side in the browser.",
  };
}

export function websiteJsonLd() {
  return {
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: SITE_URL,
    name: "WaryTools",
    publisher: { "@id": `${SITE_URL}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function breadcrumbJsonLd(items) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.href),
    })),
  };
}

// A single free, browser-based tool page (e.g. /pdf/merge).
export function toolSoftwareAppJsonLd({ name, description, href, categorySlug }) {
  const applicationCategory =
    {
      pdf: "Productivity",
      image: "MultimediaApplication",
      calculators: "UtilitiesApplication",
      "url-shortener": "UtilitiesApplication",
    }[categorySlug] || "UtilitiesApplication";

  return {
    "@type": "SoftwareApplication",
    "@id": `${absoluteUrl(href)}#software`,
    name,
    description,
    url: absoluteUrl(href),
    applicationCategory,
    operatingSystem: "Any (runs in browser)",
    // Ties each tool back to the Organization and WebSite nodes the root
    // layout emits. Without these the SoftwareApplication is an orphan in the
    // graph — valid, but nothing tells a crawler the tool and the publisher
    // are the same entity.
    publisher: { "@id": `${SITE_URL}/#organization` },
    isPartOf: { "@id": `${SITE_URL}/#website` },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
  };
}

// A hub/category page (e.g. /pdf) listing several tools.
export function collectionPageJsonLd({ name, description, href, tools }) {
  return {
    "@type": "CollectionPage",
    "@id": `${absoluteUrl(href)}#collection`,
    name,
    description,
    url: absoluteUrl(href),
    isPartOf: { "@id": `${SITE_URL}/#website` },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: tools.length,
      itemListElement: tools.map((tool, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: tool.title,
        url: absoluteUrl(tool.href),
      })),
    },
  };
}

// A static informational page (e.g. /about). `type` takes the specific
// schema.org subtype where one fits — AboutPage, ContactPage — falling back to
// plain WebPage. Without a node like this a static page contributes only a
// BreadcrumbList, which describes the page's *position* but never the page
// itself, leaving it an orphan with no link back to the publisher.
export function webPageJsonLd({ name, description, href, type = "WebPage" }) {
  return {
    "@type": type,
    "@id": `${absoluteUrl(href)}#webpage`,
    name,
    description,
    url: absoluteUrl(href),
    isPartOf: { "@id": `${SITE_URL}/#website` },
    about: { "@id": `${SITE_URL}/#organization` },
  };
}

/**
 * The steps for completing one task, e.g. "How to merge PDF files".
 *
 * Every tool page here is a step-based task page, which is exactly what
 * schema.org/HowTo describes — and none of them declared it, so the only
 * structured data explaining what the page *does* was a one-line
 * SoftwareApplication description. HowTo gives a crawler the actual procedure,
 * which is what "how to merge PDF files" queries are asking for and what the
 * incumbents ranking for them already publish.
 *
 * Deliberately minimal: `name`, `step`, and nothing else. `totalTime`,
 * `estimatedCost`, `supply` and `tool` are all valid HowTo properties, but
 * inventing a "PT2M" for something bounded by the user's file size and device
 * would be a fabricated claim in structured data — which is the category of
 * thing that earns a manual action, not a rich result. Cost is genuinely zero,
 * but `estimatedCost: 0` on a HowTo reads as a purchase price and the free
 * claim already lives in the SoftwareApplication `offers`.
 *
 * Steps must match what the page visibly says. Google requires HowTo content to
 * be present on the page for the user, not only in the markup, so these are
 * rendered by <HowToSteps /> rather than being schema-only.
 *
 * @param {object} args
 * @param {string} args.name  The task, phrased as a user would search it.
 * @param {{name: string, text: string}[]} args.steps
 * @param {string} args.href  The tool's root-relative path, for the @id.
 */
export function howToJsonLd({ name, steps, href }) {
  return {
    "@type": "HowTo",
    "@id": `${absoluteUrl(href)}#howto`,
    name,
    step: steps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.name,
      text: step.text,
      // Anchors the step to the section rendered on the page, so the markup and
      // the visible content are demonstrably the same thing.
      url: `${absoluteUrl(href)}#how-to`,
    })),
  };
}

/**
 * A blog post.
 *
 * `BlogPosting` rather than plain `Article`: it is the specific subtype, and
 * Google's article rich-result docs treat the three (Article, NewsArticle,
 * BlogPosting) identically, so the more precise type costs nothing.
 *
 * `image` is emitted only when a post declares its own cover, and is omitted
 * entirely otherwise. Falling back to the site-wide OG card would put the same
 * picture on every article, which Google's article guidance treats as worse
 * than declaring none — so the absence is deliberate, not an oversight.
 *
 * `author` is the Organization rather than a Person: the posts are written
 * under the site's name, and inventing a bylined human would be a fabricated
 * claim in structured data.
 *
 * `dateModified` falls back to `datePublished`. Emitting a modified date that
 * silently tracks the build time — the tempting default — tells Google every
 * post changed on every deploy, which is exactly the signal that gets lastmod
 * and dateModified distrusted wholesale (same reasoning as sitemapRoutes.js).
 */
export function blogPostingJsonLd({
  title,
  description,
  href,
  datePublished,
  dateModified,
  section,
  keywords,
  image,
}) {
  return {
    "@type": "BlogPosting",
    "@id": `${absoluteUrl(href)}#post`,
    headline: title,
    description,
    url: absoluteUrl(href),
    ...(image ? { image } : {}),
    datePublished,
    dateModified: dateModified || datePublished,
    author: { "@id": `${SITE_URL}/#organization` },
    publisher: { "@id": `${SITE_URL}/#organization` },
    isPartOf: { "@id": `${SITE_URL}/#blog` },
    // Tells a crawler which URL the article "is" when it appears at several
    // (e.g. reached via a tag filter query string on the index).
    mainEntityOfPage: { "@type": "WebPage", "@id": absoluteUrl(href) },
    ...(section ? { articleSection: section } : {}),
    ...(keywords && keywords.length > 0 ? { keywords: keywords.join(", ") } : {}),
  };
}

/**
 * The blog index itself, as a Blog node with its posts listed.
 *
 * The `@id` here (`#blog`) is what every BlogPosting's `isPartOf` points at,
 * so the posts and the index form one connected graph rather than a set of
 * orphaned articles — the same reason toolSoftwareAppJsonLd ties back to the
 * WebSite node.
 */
export function blogJsonLd({ name, description, href, posts }) {
  return {
    "@type": "Blog",
    "@id": `${SITE_URL}/#blog`,
    name,
    description,
    url: absoluteUrl(href),
    publisher: { "@id": `${SITE_URL}/#organization` },
    isPartOf: { "@id": `${SITE_URL}/#website` },
    blogPost: posts.map((post) => ({
      "@type": "BlogPosting",
      "@id": `${absoluteUrl(post.href)}#post`,
      headline: post.title,
      url: absoluteUrl(post.href),
      datePublished: post.datePublished,
    })),
  };
}

export function faqJsonLd(qa) {
  return {
    "@type": "FAQPage",
    mainEntity: qa.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: {
        "@type": "Answer",
        text: answer,
      },
    })),
  };
}

// Wraps one or more schema.org nodes in a @graph so a single <script> tag
// can carry multiple related entities (e.g. SoftwareApplication + Breadcrumb + FAQ).
export function jsonLdGraph(...nodes) {
  return {
    "@context": "https://schema.org",
    "@graph": nodes.filter(Boolean),
  };
}
