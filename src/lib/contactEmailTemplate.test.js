import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  renderContactEmailHtml,
  renderContactEmailText,
} from "./contactEmailTemplate";

const base = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  message: "The merge tool dropped the last page of a 12-page file.",
};

describe("renderContactEmailHtml", () => {
  it("includes the sender, address, and message", () => {
    const html = renderContactEmailHtml(base);
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("ada@example.com");
    expect(html).toContain("dropped the last page");
  });

  it("makes the address a mailto link, since replying is the only action", () => {
    expect(renderContactEmailHtml(base)).toContain('href="mailto:ada%40example.com"');
  });

  it("URL-encodes an address so a + or & doesn't truncate the mailto", () => {
    const html = renderContactEmailHtml({ ...base, email: "ada+bugs@example.com" });
    // Encoded in the href...
    expect(html).toContain("mailto:ada%2Bbugs%40example.com");
    // ...but still readable as the link text.
    expect(html).toContain(">ada+bugs@example.com<");
  });

  describe("escaping (untrusted text landing in our inbox)", () => {
    it("neutralizes markup in the message", () => {
      const html = renderContactEmailHtml({
        ...base,
        message: '<script>alert("xss")</script>',
      });
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    });

    it("neutralizes markup in the name", () => {
      const html = renderContactEmailHtml({ ...base, name: '<img src=x onerror=alert(1)>' });
      expect(html).not.toContain("<img src=x");
      expect(html).toContain("&lt;img");
    });

    it("neutralizes an attribute-breaking quote in the email", () => {
      // A raw quote here could otherwise close the href and inject an attribute.
      const html = renderContactEmailHtml({ ...base, email: 'a"onmouseover="x' });
      expect(html).not.toContain('"onmouseover="x');
    });

    it("escapes a link in the message rather than rendering it as an anchor", () => {
      const html = renderContactEmailHtml({
        ...base,
        message: '<a href="https://evil.example">Click here to verify</a>',
      });
      expect(html).not.toContain('<a href="https://evil.example"');
    });
  });

  describe("message shape", () => {
    it("preserves single newlines as line breaks", () => {
      const html = renderContactEmailHtml({ ...base, message: "Step one\nStep two" });
      expect(html).toContain("Step one<br>Step two");
    });

    it("splits blank-line-separated text into paragraphs", () => {
      const html = renderContactEmailHtml({
        ...base,
        message: "First para.\n\nSecond para.",
      });
      expect(html).toContain("First para.");
      expect(html).toContain("Second para.");
      // Two <p> elements, not one block with a stray <br>.
      expect(html.match(/<p style="margin:[^"]*font-size:15px/g)?.length).toBe(2);
    });

    it("drops the trailing margin on the last paragraph only", () => {
      // Asserts the margins in document order rather than an exact style
      // string, so adding a property to the paragraphs doesn't break the test.
      const html = renderContactEmailHtml({ ...base, message: "One.\n\nTwo.\n\nThree." });
      // Scoped to message paragraphs by their 15px body size — the document
      // also contains the label, sender, and footer paragraphs.
      const margins = [
        ...html.matchAll(/<p style="margin:([^;]+);[^"]*font-size:15px/g),
      ].map((m) => m[1]);
      expect(margins).toEqual(["0 0 14px", "0 0 14px", "0"]);
    });

    it("renders a single-paragraph message with no trailing margin", () => {
      const html = renderContactEmailHtml(base);
      // Scoped to message paragraphs by their 15px body size — the document
      // also contains the label, sender, and footer paragraphs.
      const margins = [
        ...html.matchAll(/<p style="margin:([^;]+);[^"]*font-size:15px/g),
      ].map((m) => m[1]);
      expect(margins).toEqual(["0"]);
    });
  });

  describe("character encoding", () => {
    // A delivered message showed "this — the split tool" as "this ? the split
    // tool": the em-dash arrived as a replacement character. The template was
    // never at fault (these tests pin that down), but they guard the rendering
    // half of the fix while the route declares charset=utf-8 for the transport
    // half.
    it("preserves an em-dash, the character that surfaced the bug", () => {
      const html = renderContactEmailHtml({ ...base, message: "Thanks — really" });
      expect(html).toContain("Thanks — really");
      expect(html).not.toContain("�");
    });

    it("preserves curly quotes and apostrophes, which phones insert by default", () => {
      const message = "It’s a “bug”, I think";
      expect(renderContactEmailHtml({ ...base, message })).toContain(message);
    });

    it("preserves accented Latin text", () => {
      const message = "café naïve Zürich";
      expect(renderContactEmailHtml({ ...base, message })).toContain(message);
    });

    it("preserves non-Latin scripts", () => {
      const message = "नमस्ते — こんにちは — مرحبا";
      expect(renderContactEmailHtml({ ...base, message })).toContain(message);
    });

    it("preserves emoji, including surrogate pairs", () => {
      const message = "Works great 🚀 thanks 👍";
      expect(renderContactEmailHtml({ ...base, message })).toContain(message);
    });

    it("preserves non-ASCII in the sender's name", () => {
      const html = renderContactEmailHtml({ ...base, name: "José Müller" });
      expect(html).toContain("José Müller");
    });

    it("declares the charset both ways, since clients strip one or the other", () => {
      const html = renderContactEmailHtml(base);
      expect(html).toContain('<meta charset="utf-8">');
      expect(html).toMatch(/http-equiv="Content-Type"[^>]*charset=UTF-8/i);
    });

    it("carries non-ASCII through the plain-text alternative too", () => {
      const text = renderContactEmailText({ ...base, message: "café — 🚀 — नमस्ते" });
      expect(text).toContain("café — 🚀 — नमस्ते");
    });
  });

  describe("hostile input", () => {
    it("breaks a long unbroken token so it can't stretch the card", () => {
      // Found by rendering an adversarial message: a 70-character run with no
      // spaces pushed the card wider than the viewport and made the whole
      // email scroll sideways. A sender could do that deliberately, or by
      // pasting a stack trace or a long URL.
      const html = renderContactEmailHtml({ ...base, message: "A".repeat(200) });
      expect(html).toMatch(/word-break:break-word|overflow-wrap:break-word/);
    });

    it("breaks a long sender name and address too", () => {
      const html = renderContactEmailHtml({
        ...base,
        name: "A".repeat(80),
        email: `${"b".repeat(60)}@example.com`,
      });
      // The name paragraph and the address paragraph each carry a break rule.
      const breaking = html.match(/word-break:break-(word|all)/g) || [];
      expect(breaking.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("email-client constraints", () => {
    it("uses no flexbox or grid, which Outlook's Word engine ignores", () => {
      const html = renderContactEmailHtml(base);
      expect(html).not.toMatch(/display:\s*(flex|grid)/);
    });

    it("carries no <style> block, which Gmail strips", () => {
      expect(renderContactEmailHtml(base)).not.toContain("<style");
    });

    it("references no external images, which clients block by default", () => {
      const html = renderContactEmailHtml(base);
      expect(html).not.toMatch(/<img[^>]+src=["']https?:/);
    });

    it("uses no CSS custom properties, unsupported across mail clients", () => {
      expect(renderContactEmailHtml(base)).not.toContain("var(--");
    });

    it("includes a preheader so the inbox preview isn't layout junk", () => {
      const html = renderContactEmailHtml(base);
      expect(html).toContain("sent a message via the contact form");
      expect(html).toMatch(/display:none/);
    });

    it("lays out with presentation tables, ignored by screen readers", () => {
      expect(renderContactEmailHtml(base)).toContain('role="presentation"');
    });
  });

  it("defaults the site origin but allows an override", () => {
    expect(renderContactEmailHtml(base)).toContain("https://wary.tools/contact");
    expect(
      renderContactEmailHtml({ ...base, siteOrigin: "https://staging.example" })
    ).toContain("https://staging.example/contact");
  });
});

describe("renderContactEmailText", () => {
  it("carries the same information as the HTML version", () => {
    const text = renderContactEmailText(base);
    expect(text).toContain("Ada Lovelace");
    expect(text).toContain("ada@example.com");
    expect(text).toContain("dropped the last page");
  });

  it("contains no markup", () => {
    const text = renderContactEmailText({ ...base, message: "<b>bold</b>" });
    // The raw message is passed through verbatim — it's plain text, so there is
    // nothing to escape and nothing that renders.
    expect(text).not.toContain("<p ");
    expect(text).not.toContain("<table");
  });

  it("preserves the message's own line breaks", () => {
    const text = renderContactEmailText({ ...base, message: "One\nTwo" });
    expect(text).toContain("One\nTwo");
  });
});

describe("escapeHtml", () => {
  it("escapes ampersands before the entities it introduces", () => {
    expect(escapeHtml("Tom & Jerry <b>")).toBe("Tom &amp; Jerry &lt;b&gt;");
  });

  it("handles nullish input", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
});
