// Single source of truth for the site's base URL.
//
// Six call sites (sitemap, robots, llms.txt, layout metadataBase, jsonLd, the
// shorten API) previously each inlined
//   process.env.NEXT_PUBLIC_SITE_URL || "https://wary.tools"
// which meant a trailing slash in the env var — the natural way to type a
// base URL — silently produced "https://wary.tools//sitemap.xml" and a double
// slash in all 23 sitemap URLs and every JSON-LD @id. Normalizing once here
// makes that unrepresentable.

const DEFAULT_SITE_URL = "https://wary.tools";

// Strips trailing slashes so callers can always concatenate a leading-slash
// path. Falls back to the default for unset/blank/malformed values rather
// than emitting a broken absolute URL into a sitemap or canonical tag.
export function normalizeSiteUrl(value) {
  if (typeof value !== "string" || value.trim() === "") return DEFAULT_SITE_URL;

  const trimmed = value.trim().replace(/\/+$/, "");

  try {
    // Rejects things like "wary.tools" (no scheme) that would otherwise be
    // concatenated into a relative-looking, unusable URL.
    new URL(trimmed);
  } catch {
    return DEFAULT_SITE_URL;
  }

  return trimmed;
}

export const SITE_URL = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

// Builds an absolute URL from a root-relative path ("/pdf/merge").
export function absoluteUrl(pathname = "/") {
  return `${SITE_URL}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}
