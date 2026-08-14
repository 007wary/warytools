import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  FrontmatterError,
  parseFrontmatter,
  slugFromFilename,
  splitFrontmatter,
} from "./blogFrontmatter";

// A valid header, used as the base for "one thing wrong" cases below.
const VALID = `title: A real post
description: A description long enough to pass the minimum length check that guards against placeholders.
date: 2026-08-13
category: guide`;

describe("splitFrontmatter", () => {
  it("separates the header from the body", () => {
    const { frontmatter, body } = splitFrontmatter(`---\n${VALID}\n---\nBody text.`);
    expect(frontmatter).toContain("title: A real post");
    expect(body).toBe("Body text.");
  });

  it("tolerates a BOM and leading blank lines", () => {
    const { body } = splitFrontmatter(`﻿\n---\n${VALID}\n---\nBody.`);
    expect(body).toBe("Body.");
  });

  it("tolerates CRLF line endings", () => {
    const { frontmatter, body } = splitFrontmatter(`---\r\n${VALID.replace(/\n/g, "\r\n")}\r\n---\r\nBody.`);
    expect(frontmatter).toContain("title: A real post");
    expect(body).toBe("Body.");
  });

  it("throws when the opening delimiter is missing", () => {
    expect(() => splitFrontmatter("title: no delimiters")).toThrow(FrontmatterError);
  });

  // The regression this guards: searching for the literal "---" anywhere
  // would match a horizontal rule in the body of a post whose header was
  // never closed, silently swallowing prose into the frontmatter.
  it("does not treat a body horizontal rule as a closing delimiter", () => {
    const raw = `---\n${VALID}\n---\nIntro.\n\n---\n\nMore text.`;
    const { body } = splitFrontmatter(raw);
    expect(body).toContain("Intro.");
    expect(body).toContain("More text.");
  });

  it("throws when the closing delimiter is missing", () => {
    expect(() => splitFrontmatter(`---\n${VALID}\nBody with no close`)).toThrow(
      /missing closing/,
    );
  });

  it("attaches the filename to the error message", () => {
    expect(() => splitFrontmatter("no delimiter", "broken.mdx")).toThrow(/broken\.mdx/);
  });
});

describe("parseFrontmatter", () => {
  it("parses the required fields", () => {
    const data = parseFrontmatter(VALID);
    expect(data.title).toBe("A real post");
    expect(data.category).toBe("guide");
    expect(data.date.toISOString()).toBe("2026-08-13T00:00:00.000Z");
  });

  it("strips one layer of matching quotes", () => {
    const data = parseFrontmatter(`${VALID}\nauthor: "Wary"`);
    expect(data.author).toBe("Wary");
  });

  it("keeps a colon in a quoted value", () => {
    const data = parseFrontmatter(`title: "Split PDF: a guide"\n${VALID.split("\n").slice(1).join("\n")}`);
    expect(data.title).toBe("Split PDF: a guide");
  });

  it("parses inline lists", () => {
    expect(parseFrontmatter(`${VALID}\ntags: [pdf, privacy]`).tags).toEqual(["pdf", "privacy"]);
  });

  it("parses an empty list", () => {
    expect(parseFrontmatter(`${VALID}\ntags: []`).tags).toEqual([]);
  });

  it("parses booleans", () => {
    expect(parseFrontmatter(`${VALID}\ndraft: true`).draft).toBe(true);
    expect(parseFrontmatter(`${VALID}\ndraft: false`).draft).toBe(false);
  });

  it("ignores comments and blank lines", () => {
    expect(parseFrontmatter(`# a comment\n\n${VALID}`).title).toBe("A real post");
  });

  // The core design decision: a typo must break the build, not vanish.
  it("rejects an unknown key rather than dropping it", () => {
    expect(() => parseFrontmatter(`${VALID}\ndiscription: oops`)).toThrow(/unknown frontmatter key/);
  });

  it("rejects a duplicate key", () => {
    expect(() => parseFrontmatter(`${VALID}\ntitle: Second`)).toThrow(/duplicate/);
  });

  it("rejects an empty value", () => {
    expect(() => parseFrontmatter(`${VALID}\nauthor:`)).toThrow(/has no value/);
  });

  it("rejects a line that is not key: value", () => {
    expect(() => parseFrontmatter(`${VALID}\njust some text`)).toThrow(/not \`key: value\`/);
  });

  for (const field of ["title", "description", "date", "category"]) {
    it(`requires \`${field}\``, () => {
      const block = VALID.split("\n")
        .filter((line) => !line.startsWith(`${field}:`))
        .join("\n");
      expect(() => parseFrontmatter(block)).toThrow(new RegExp(`missing required.*${field}`));
    });
  }

  it("rejects an unknown category", () => {
    const block = VALID.replace("category: guide", "category: musings");
    expect(() => parseFrontmatter(block)).toThrow(/unknown category/);
  });

  it("accepts every declared category", () => {
    for (const category of Object.keys(CATEGORIES)) {
      const block = VALID.replace("category: guide", `category: ${category}`);
      expect(parseFrontmatter(block).category).toBe(category);
    }
  });

  it("rejects a too-short description", () => {
    const block = VALID.replace(/description: .*/, "description: Too short.");
    expect(() => parseFrontmatter(block)).toThrow(/meta description/);
  });

  describe("dates", () => {
    it("parses as UTC, not local time", () => {
      // The whole point: the displayed day must not depend on the build
      // machine's timezone. Asserting the UTC date components round-trips
      // through the same representation the site renders from.
      const { date } = parseFrontmatter(VALID);
      expect(date.getUTCFullYear()).toBe(2026);
      expect(date.getUTCMonth()).toBe(7); // August, zero-indexed
      expect(date.getUTCDate()).toBe(13);
    });

    it("rejects a non-ISO date shape", () => {
      const block = VALID.replace("date: 2026-08-13", "date: 13 August 2026");
      expect(() => parseFrontmatter(block)).toThrow(/YYYY-MM-DD/);
    });

    it("rejects a date with a time component", () => {
      const block = VALID.replace("date: 2026-08-13", "date: 2026-08-13T10:00:00Z");
      expect(() => parseFrontmatter(block)).toThrow(/YYYY-MM-DD/);
    });

    // Date would roll this over to March 2nd rather than throwing, so the
    // round-trip check in parseDate is what catches it.
    it("rejects a calendar-invalid date", () => {
      const block = VALID.replace("date: 2026-08-13", "date: 2026-02-30");
      expect(() => parseFrontmatter(block)).toThrow(/not a real calendar date/);
    });

    it("rejects `updated` earlier than `date`", () => {
      expect(() => parseFrontmatter(`${VALID}\nupdated: 2026-01-01`)).toThrow(/earlier than/);
    });

    it("accepts `updated` on the same day", () => {
      expect(parseFrontmatter(`${VALID}\nupdated: 2026-08-13`).updated).toBeInstanceOf(Date);
    });
  });

  describe("covers", () => {
    it("accepts a cover with alt text", () => {
      const data = parseFrontmatter(
        `${VALID}\ncover: /blog/a.jpg\ncoverAlt: A grid of PDF pages`,
      );
      expect(data.cover).toBe("/blog/a.jpg");
      expect(data.coverAlt).toBe("A grid of PDF pages");
    });

    it("leaves both unset when no cover is declared", () => {
      const data = parseFrontmatter(VALID);
      expect(data.cover).toBeUndefined();
      expect(data.coverAlt).toBeUndefined();
    });

    it("requires alt text alongside a cover", () => {
      expect(() => parseFrontmatter(`${VALID}\ncover: /blog/a.jpg`)).toThrow(/coverAlt/);
    });

    // A stale alt with no image means the next person to add a cover
    // inherits a description of a different picture.
    it("rejects alt text with no cover", () => {
      expect(() => parseFrontmatter(`${VALID}\ncoverAlt: Orphaned`)).toThrow(
        /`coverAlt` is set but `cover` is not/,
      );
    });

    it("rejects an invalid cover path", () => {
      expect(() =>
        parseFrontmatter(`${VALID}\ncover: https://example.com/a.jpg\ncoverAlt: x`),
      ).toThrow(/root-relative/);
    });
  });

  it("rejects a malformed list", () => {
    expect(() => parseFrontmatter(`${VALID}\ntags: pdf, privacy`)).toThrow(/inline list/);
  });

  it("rejects a non-boolean for a boolean field", () => {
    expect(() => parseFrontmatter(`${VALID}\ndraft: yes`)).toThrow(/must be true or false/);
  });
});

describe("slugFromFilename", () => {
  it("drops the extension", () => {
    expect(slugFromFilename("how-to-merge-pdfs.mdx")).toBe("how-to-merge-pdfs");
  });

  it("accepts digits", () => {
    expect(slugFromFilename("pdf-a-3-explained.mdx")).toBe("pdf-a-3-explained");
  });

  for (const bad of ["How-To.mdx", "with space.mdx", "double--hyphen.mdx", "-leading.mdx", "trailing-.mdx", "under_score.mdx"]) {
    it(`rejects "${bad}"`, () => {
      expect(() => slugFromFilename(bad)).toThrow(/kebab-case/);
    });
  }

  // /blog/page/2 is the index pagination route, and Next resolves a literal
  // segment ahead of the sibling [slug]. A post named page.mdx would build,
  // ship in the sitemap and the feed, and never be reachable — with nothing
  // throwing and nothing in the build output saying so.
  it("rejects the reserved `page` slug that the pagination route shadows", () => {
    expect(() => slugFromFilename("page.mdx")).toThrow(/reserved slug/);
  });

  it("still accepts slugs that merely start with a reserved word", () => {
    expect(slugFromFilename("page-numbers-explained.mdx")).toBe("page-numbers-explained");
    expect(slugFromFilename("feed-readers.mdx")).toBe("feed-readers");
  });
});
