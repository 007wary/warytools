import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  postSubject,
  renderConfirmEmailHtml,
  renderConfirmEmailText,
  renderPostEmailHtml,
  renderPostEmailText,
} from "./newsletterEmailTemplate";

const SITE = "https://wary.tools";
const CONFIRM = `${SITE}/newsletter/confirm?token=confirm.abc.123.sig`;
const UNSUB = `${SITE}/newsletter/unsubscribe?token=unsubscribe.abc.0.sig`;

const POST = {
  title: "How to delete pages from a PDF",
  description: "Remove pages from a PDF in your browser, with nothing uploaded.",
  slug: "how-to-delete-pages-from-a-pdf",
  cover: "/blog/delete-pages.jpg",
  coverAlt: "A PDF with one page lifted out of the stack",
  readingTime: 4,
  category: "Guide",
};

describe("escapeHtml", () => {
  it("escapes all five characters that break HTML or an attribute", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("escapes the ampersand first, so later replacements are not re-escaped", () => {
    expect(escapeHtml("<")).toBe("&lt;");
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });

  it("renders null and undefined as an empty string rather than the words", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
});

describe("renderConfirmEmailHtml", () => {
  const html = renderConfirmEmailHtml({ confirmUrl: CONFIRM, siteUrl: SITE });

  it("contains the confirm link in both the button and as pasteable text", () => {
    // Some clients strip or mangle buttons; a confirmation whose only action is
    // unreachable is a subscription that silently never completes.
    const occurrences = html.split(CONFIRM).length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it("declares a charset, twice, so an em-dash does not arrive as mojibake", () => {
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('http-equiv="Content-Type"');
  });

  it("carries a preheader so the inbox preview is not layout junk", () => {
    expect(html).toContain("Confirm your WaryTools newsletter subscription");
  });

  it("tells the recipient that ignoring it ends the matter", () => {
    // The entire point of double opt-in: the recipient may not be the person
    // who typed the address.
    // A literal in the template rather than interpolated data, so the
    // apostrophe is not escaped here.
    expect(html).toContain("Didn't sign up?");
  });

  it("carries no unsubscribe link, because there is nothing yet to leave", () => {
    expect(html).not.toContain("/newsletter/unsubscribe");
  });

  it("uses a table-celled button rather than a padded inline link", () => {
    // Outlook ignores padding on inline elements, collapsing a link-styled
    // button into bare underlined text.
    expect(html).toContain(`background-color:#2563eb;border-radius:10px;`);
  });

  it("uses no flexbox, grid, or <style> block", () => {
    expect(html).not.toMatch(/display:\s*flex/);
    expect(html).not.toMatch(/display:\s*grid/);
    expect(html).not.toMatch(/<style[\s>]/);
  });

  it("uses no CSS custom properties, which are unusable in mail", () => {
    expect(html).not.toContain("var(--");
  });

  it("balances its tags", () => {
    const opens = (html.match(/<table/g) || []).length;
    const closes = (html.match(/<\/table>/g) || []).length;
    expect(opens).toBe(closes);
  });
});

describe("renderConfirmEmailText", () => {
  it("contains the bare link, unwrapped by markup", () => {
    const text = renderConfirmEmailText({ confirmUrl: CONFIRM, siteUrl: SITE });
    expect(text).toContain(CONFIRM);
    expect(text).not.toContain("<");
  });
});

describe("renderPostEmailHtml", () => {
  const html = renderPostEmailHtml({ post: POST, siteUrl: SITE, unsubscribeUrl: UNSUB });

  it("links the post at its absolute URL", () => {
    expect(html).toContain(`${SITE}/blog/${POST.slug}`);
  });

  it("makes the cover absolute, since a mail client has no page to resolve against", () => {
    expect(html).toContain(`src="${SITE}${POST.cover}"`);
    expect(html).not.toContain(`src="${POST.cover}"`);
  });

  it("carries the cover's alt text", () => {
    expect(html).toContain(`alt="${POST.coverAlt}"`);
  });

  it("keeps the title and description outside the image, so a blocked image loses nothing", () => {
    const withoutImg = html.replace(/<img[^>]*>/g, "");
    expect(withoutImg).toContain(POST.title);
    expect(withoutImg).toContain(POST.description);
  });

  it("always carries a visible unsubscribe link", () => {
    // A subscriber who cannot find it marks the message as spam instead, and
    // enough of those take the sending domain down with them.
    expect(html).toContain(UNSUB);
    expect(html).toContain(">Unsubscribe<");
  });

  it("renders the meta line when category and reading time are present", () => {
    expect(html).toContain("Guide &middot; 4 min read");
  });

  it("omits the meta line rather than emitting a bare separator", () => {
    const bare = renderPostEmailHtml({
      post: { ...POST, category: null, readingTime: null },
      siteUrl: SITE,
      unsubscribeUrl: UNSUB,
    });

    expect(bare).not.toContain("&middot;");
  });

  it("omits the cover block entirely for a post without one", () => {
    const noCover = renderPostEmailHtml({
      post: { ...POST, cover: null, coverAlt: null },
      siteUrl: SITE,
      unsubscribeUrl: UNSUB,
    });

    expect(noCover).not.toContain("<img");
    expect(noCover).toContain(POST.title);
  });

  it("escapes a title containing an ampersand", () => {
    const html2 = renderPostEmailHtml({
      post: { ...POST, title: "Word & PDF: <the> \"best\" tools" },
      siteUrl: SITE,
      unsubscribeUrl: UNSUB,
    });

    expect(html2).toContain("Word &amp; PDF");
    expect(html2).not.toContain("<the>");
  });

  it("escapes a quote in the unsubscribe URL rather than breaking out of the href", () => {
    const html2 = renderPostEmailHtml({
      post: POST,
      siteUrl: SITE,
      unsubscribeUrl: `${UNSUB}"><script>alert(1)</script>`,
    });

    expect(html2).not.toContain("<script>");
  });

  it("uses no flexbox, grid, <style> block, or custom properties", () => {
    expect(html).not.toMatch(/display:\s*flex/);
    expect(html).not.toMatch(/display:\s*grid/);
    expect(html).not.toMatch(/<style[\s>]/);
    expect(html).not.toContain("var(--");
  });

  it("balances its tags", () => {
    expect((html.match(/<table/g) || []).length).toBe((html.match(/<\/table>/g) || []).length);
  });
});

describe("renderPostEmailText", () => {
  const text = renderPostEmailText({ post: POST, siteUrl: SITE, unsubscribeUrl: UNSUB });

  it("carries the post link and the unsubscribe link as bare URLs", () => {
    expect(text).toContain(`${SITE}/blog/${POST.slug}`);
    expect(text).toContain(UNSUB);
  });

  it("contains no markup", () => {
    expect(text).not.toContain("<");
  });
});

describe("postSubject", () => {
  it("is the post's own title, with no prefix eating the phone preview", () => {
    expect(postSubject(POST)).toBe(POST.title);
  });
});
