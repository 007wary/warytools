// Structured-data (JSON-LD) builders shared across pages. Each function
// returns a plain schema.org object; render it via <JsonLd data={...} />
// (src/components/JsonLd.js). Keeping these as pure builders (no JSX) means
// they can run in server components without pulling in a client bundle.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://warytools.com";

export function absoluteUrl(href) {
  return `${SITE_URL}${href}`;
}

export function organizationJsonLd() {
  return {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: "WaryTools",
    url: SITE_URL,
    logo: `${SITE_URL}/icon.svg`,
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
    name,
    description,
    url: absoluteUrl(href),
    applicationCategory,
    operatingSystem: "Any (runs in browser)",
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
    name,
    description,
    url: absoluteUrl(href),
    mainEntity: {
      "@type": "ItemList",
      itemListElement: tools.map((tool, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: tool.title,
        url: absoluteUrl(tool.href),
      })),
    },
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
