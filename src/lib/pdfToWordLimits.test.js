import { describe, it, expect } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  SLOW_UPLOAD_BYTES,
  MAX_PAGES,
  CONVERSION_TIMEOUT_MS,
  CLIENT_TIMEOUT_MS,
  checkUploadSize,
  checkPageCount,
  looksScanned,
  rejectionMessage,
  docxFilename,
} from "./pdfToWordLimits";

describe("checkUploadSize", () => {
  it("accepts an ordinary file without flagging it slow", () => {
    const result = checkUploadSize(1024 * 1024);
    expect(result.ok).toBe(true);
    expect(result.isSlow).toBe(false);
  });

  it("accepts a large-but-allowed file and flags it slow", () => {
    const result = checkUploadSize(SLOW_UPLOAD_BYTES + 1);
    expect(result.ok).toBe(true);
    expect(result.isSlow).toBe(true);
  });

  it("accepts a file exactly at the limit", () => {
    // Boundary belongs to the accepted side — a file advertised as "up to
    // 20 MB" that rejects at exactly 20 MB is a bug report waiting to happen.
    expect(checkUploadSize(MAX_UPLOAD_BYTES).ok).toBe(true);
  });

  it("rejects a file one byte over the limit", () => {
    const result = checkUploadSize(MAX_UPLOAD_BYTES + 1);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("too_large");
  });

  it("rejects an empty file", () => {
    expect(checkUploadSize(0)).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects non-finite and negative sizes rather than passing them through", () => {
    // A missing Content-Length yields NaN; treating that as 0-and-fine would
    // forward an unbounded body to the converter.
    for (const size of [NaN, Infinity, -1, undefined, null]) {
      expect(checkUploadSize(size).ok).toBe(false);
    }
  });
});

describe("timeout ordering", () => {
  // The chain is container (55s) < route (60s) < Vercel maxDuration (90s) <
  // browser. Every layer but the last produces a real, actionable response;
  // the browser's exists only for a connection that stalls with nobody
  // replying. If the browser's fired first it would abort conversions that
  // were about to succeed and report a timeout that never happened — a
  // working tool made flaky by its own safety net.
  it("gives the browser the longest budget in the chain", () => {
    expect(CLIENT_TIMEOUT_MS).toBeGreaterThan(CONVERSION_TIMEOUT_MS);
  });

  it("outlasts the route's own Vercel maxDuration of 90s", () => {
    // Hardcoded rather than imported: maxDuration is a route-segment export
    // Next.js reads statically, so it cannot come from this module. That makes
    // this the only place the two can be checked against each other.
    expect(CLIENT_TIMEOUT_MS).toBeGreaterThan(90_000);
  });
});

describe("checkPageCount", () => {
  it("accepts a normal document", () => {
    expect(checkPageCount(12)).toEqual({ ok: true });
  });

  it("accepts exactly the page limit", () => {
    expect(checkPageCount(MAX_PAGES).ok).toBe(true);
  });

  it("rejects one page over the limit", () => {
    expect(checkPageCount(MAX_PAGES + 1)).toEqual({
      ok: false,
      reason: "too_many_pages",
    });
  });

  it("reports a zero or unreadable page count as damaged, not oversized", () => {
    // These need different advice: "split the file" is useless when the real
    // problem is that the file wouldn't parse.
    expect(checkPageCount(0).reason).toBe("unreadable");
    expect(checkPageCount(NaN).reason).toBe("unreadable");
    expect(checkPageCount(undefined).reason).toBe("unreadable");
  });
});

describe("looksScanned", () => {
  it("treats pages of real prose as not scanned", () => {
    const pages = [
      "This is a paragraph of ordinary document text that goes on for a while.",
      "And a second page with plenty of its own content to read.",
    ];
    expect(looksScanned(pages)).toBe(false);
  });

  it("treats entirely empty pages as scanned", () => {
    expect(looksScanned(["", "", ""])).toBe(true);
  });

  it("treats a few stray characters as scanned", () => {
    // Real scans commonly carry a signature annotation or a header stamp; a
    // strict === 0 check would call these "has text" and convert them into an
    // empty Word document.
    expect(looksScanned(["Page 1", "  ", "3"])).toBe(true);
  });

  it("does not flag a short but genuine document", () => {
    const pages = ["Dear Sir, thank you for your letter of the 3rd. Yours faithfully, A. Person."];
    expect(looksScanned(pages)).toBe(false);
  });

  it("does not flag a single sparse page as a scan", () => {
    // Regression: the threshold used to scale with the number of pages
    // sampled, so a one-page document with a short heading was refused as a
    // scan while the identical text spread over three pages passed. Refusing
    // a convertible document is the worse failure of the two.
    expect(looksScanned(["Invoice 2026 — Total due: 4,999"])).toBe(false);
  });

  it("judges by total text, not by page count", () => {
    // The same content must get the same verdict however many pages it
    // arrived on — otherwise the sample size decides the outcome.
    const text = "Quarterly report for the period ending March.";
    expect(looksScanned([text])).toBe(false);
    expect(looksScanned([text, "", ""])).toBe(false);
  });

  it("returns false for an empty sample rather than guessing", () => {
    // No sample is not evidence of a scan — refusing here would block files
    // whose text extraction simply hadn't run.
    expect(looksScanned([])).toBe(false);
    expect(looksScanned(null)).toBe(false);
  });

  it("ignores whitespace-only text when counting", () => {
    expect(looksScanned(["\n\n   \t  \n"])).toBe(true);
  });
});

describe("rejectionMessage", () => {
  it("returns a distinct, actionable message for every known reason", () => {
    const reasons = [
      "empty",
      "too_large",
      "too_many_pages",
      "unreadable",
      "scanned",
      "encrypted",
      "no_pages",
      "unavailable",
      "timeout",
      "rate_limited",
    ];

    const messages = reasons.map(rejectionMessage);

    // Every reason says something different — a shared string would mean the
    // user can't tell "wait a minute" apart from "this file will never work".
    expect(new Set(messages).size).toBe(reasons.length);
    messages.forEach((message) => expect(message.length).toBeGreaterThan(20));
  });

  it("mentions the actual limits so the copy can't drift from the constants", () => {
    expect(rejectionMessage("too_large")).toContain("20 MB");
    expect(rejectionMessage("too_many_pages")).toContain(String(MAX_PAGES));
  });

  it("explains OCR for a scanned file instead of just refusing", () => {
    expect(rejectionMessage("scanned").toLowerCase()).toContain("ocr");
  });

  it("falls back to a generic message for an unknown reason", () => {
    expect(rejectionMessage("something_new")).toBe("Could not convert this PDF. Please try again.");
  });
});

describe("docxFilename", () => {
  it("swaps a .pdf extension for .docx", () => {
    expect(docxFilename("report.pdf")).toBe("report.docx");
  });

  it("handles an uppercase extension without doubling it", () => {
    expect(docxFilename("Report.PDF")).toBe("Report.docx");
  });

  it("appends to a name with no extension", () => {
    expect(docxFilename("report")).toBe("report.docx");
  });

  it("keeps interior dots intact", () => {
    expect(docxFilename("2026.q1.summary.pdf")).toBe("2026.q1.summary.docx");
  });

  it("falls back to a generic name when there is nothing usable", () => {
    expect(docxFilename("")).toBe("converted.docx");
    expect(docxFilename(".pdf")).toBe("converted.docx");
    expect(docxFilename(null)).toBe("converted.docx");
  });
});
