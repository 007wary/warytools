import { describe, expect, it } from "vitest";
import { nativeSharePayload, shareTargets } from "./shareLinks";

const POST = {
  url: "https://wary.tools/blog/how-to-delete-pages-from-a-pdf",
  title: "How to delete pages from a PDF without uploading it anywhere",
};

function target(id, post = POST) {
  return shareTargets(post).find((entry) => entry.id === id);
}

describe("shareTargets", () => {
  it("returns the four configured targets in order", () => {
    expect(shareTargets(POST).map((entry) => entry.id)).toEqual([
      "whatsapp",
      "x",
      "linkedin",
      "facebook",
    ]);
  });

  it("gives every target a label and an https href", () => {
    for (const entry of shareTargets(POST)) {
      expect(entry.label).toBeTruthy();
      expect(entry.href.startsWith("https://")).toBe(true);
    }
  });

  // WhatsApp previews whatever URL it finds inside the message text; there is
  // no separate link field, so the URL has to be part of the body.
  it("puts the URL inside WhatsApp's text parameter", () => {
    const text = new URL(target("whatsapp").href).searchParams.get("text");
    expect(text).toBe(`${POST.title} ${POST.url}`);
  });

  it("sends X a separate text and url", () => {
    const params = new URL(target("x").href).searchParams;
    expect(params.get("text")).toBe(POST.title);
    expect(params.get("url")).toBe(POST.url);
  });

  // Both platforms dropped their title/summary parameters and read OG tags
  // from the page instead, so sending anything else is dead weight.
  it("sends LinkedIn and Facebook only the URL", () => {
    expect([...new URL(target("linkedin").href).searchParams.keys()]).toEqual(["url"]);
    expect([...new URL(target("facebook").href).searchParams.keys()]).toEqual(["u"]);
    expect(new URL(target("facebook").href).searchParams.get("u")).toBe(POST.url);
  });

  describe("encoding", () => {
    // The failure this guards is silent truncation, not an error: an
    // unencoded `&` in a title ends the parameter, so the shared text is cut
    // off mid-sentence and everything after it is read as a new parameter.
    it("survives a title containing an ampersand", () => {
      const title = "Merge & split PDFs";
      const text = new URL(target("x", { ...POST, title }).href).searchParams.get("text");
      expect(text).toBe(title);
    });

    it("survives a title containing a hash", () => {
      const title = "PDF/A #1 explained";
      const text = new URL(target("x", { ...POST, title }).href).searchParams.get("text");
      expect(text).toBe(title);
    });

    // A hand-rolled encodeURIComponent leaves `+` alone, and most receivers
    // read a literal `+` in a query as a space.
    it("survives a title containing a plus sign", () => {
      const title = "Word + Excel to PDF";
      const text = new URL(target("x", { ...POST, title }).href).searchParams.get("text");
      expect(text).toBe(title);
    });

    it("survives apostrophes, em dashes and colons", () => {
      const title = "What's in a PDF — really: a field guide";
      const text = new URL(target("whatsapp", { ...POST, title }).href).searchParams.get("text");
      expect(text).toContain(title);
    });

    it("survives a URL containing a query string", () => {
      const url = "https://wary.tools/blog/a-post?ref=news&utm_source=x";
      expect(new URL(target("facebook", { ...POST, url }).href).searchParams.get("u")).toBe(url);
    });

    it("round-trips a non-ASCII title", () => {
      const title = "PDF संपादित करें";
      const text = new URL(target("x", { ...POST, title }).href).searchParams.get("text");
      expect(text).toBe(title);
    });
  });
});

describe("nativeSharePayload", () => {
  // title and text are deliberately different: receiving apps pick
  // inconsistently between the two, and setting both to the title makes those
  // that concatenate show it twice.
  it("carries the title and the description separately", () => {
    const payload = nativeSharePayload({
      url: POST.url,
      title: POST.title,
      description: "Remove unwanted pages in your browser.",
    });

    expect(payload).toEqual({
      title: POST.title,
      text: "Remove unwanted pages in your browser.",
      url: POST.url,
    });
    expect(payload.text).not.toBe(payload.title);
  });
});
