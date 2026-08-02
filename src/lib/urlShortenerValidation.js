// Validation for the URL shortener's input, kept separate from the client
// component so it's testable without a DOM/window. `siteOrigin` is passed
// in explicitly (rather than read from window.location) for the same reason
// — it's the one piece of this check that depends on where the page is
// hosted, so the caller supplies it.

export const MAX_URL_LENGTH = 2048;

export function isValidUrl(value, siteOrigin) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_URL_LENGTH) {
    return false;
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  // Block shortening our own /s/ links — prevents redirect chains/loops
  // and stops the shortener being used to obscure other short links.
  if (url.origin === siteOrigin && url.pathname.startsWith("/s/")) {
    return false;
  }

  return true;
}
