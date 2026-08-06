import { describe, it, expect } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  SLOW_UPLOAD_BYTES,
  CONVERSION_TIMEOUT_MS,
  CLIENT_TIMEOUT_MS,
  ACCEPTED_EXTENSIONS,
  ACCEPT_ATTRIBUTE,
  checkUploadSize,
  rejectionMessage,
  pdfFilename,
} from "./powerPointToPdfLimits";

describe("checkUploadSize", () => {
  it("accepts an ordinary presentation", () => {
    const result = checkUploadSize(1024 * 1024);
    expect(result.ok).toBe(true);
    expect(result.isSlow).toBe(false);
  });

  it("accepts a file exactly at the limit", () => {
    // The boundary is inclusive; an off-by-one here would refuse a file the
    // converter handles and the error copy claims is allowed.
    expect(checkUploadSize(MAX_UPLOAD_BYTES).ok).toBe(true);
  });

  it("rejects one byte over the limit", () => {
    const result = checkUploadSize(MAX_UPLOAD_BYTES + 1);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("too_large");
  });

  it("flags a slow-but-allowed file rather than rejecting it", () => {
    const result = checkUploadSize(SLOW_UPLOAD_BYTES + 1);
    expect(result.ok).toBe(true);
    expect(result.isSlow).toBe(true);
  });

  it("treats an empty or nonsensical size as empty, not as valid", () => {
    // Number("") is 0, and a 0-byte upload must not read as a successful one.
    for (const size of [0, -1, NaN, Infinity, null, undefined]) {
      const result = checkUploadSize(size);
      expect(result.ok, String(size)).toBe(false);
      expect(result.reason, String(size)).toBe("empty");
    }
  });
});

describe("timeout layering", () => {
  // The chain only degrades gracefully if each layer outlives the one below
  // it. If the client gave up first it would report a timeout for conversions
  // that were about to succeed.
  it("gives the client a longer budget than the conversion itself", () => {
    expect(CLIENT_TIMEOUT_MS).toBeGreaterThan(CONVERSION_TIMEOUT_MS);
  });

  it("warns about slow files well below the hard limit", () => {
    expect(SLOW_UPLOAD_BYTES).toBeLessThan(MAX_UPLOAD_BYTES);
  });
});

describe("rejectionMessage", () => {
  it("has distinct, actionable copy for every reason the route can send", () => {
    const reasons = [
      "empty",
      "too_large",
      "not_a_presentation",
      "unreadable",
      "encrypted",
      "no_content",
      "unavailable",
      "timeout",
      "rate_limited",
    ];

    const messages = reasons.map(rejectionMessage);

    for (const message of messages) {
      expect(message.length).toBeGreaterThan(20);
    }
    // Distinct copy per reason is the whole point — a shared string would mean
    // a password-protected deck and a damaged one give the same dead end.
    expect(new Set(messages).size).toBe(reasons.length);
  });

  it("quotes the real limit rather than a hardcoded number", () => {
    expect(rejectionMessage("too_large")).toContain(
      `${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB`
    );
  });

  it("falls back for an unrecognised reason", () => {
    expect(rejectionMessage("something_new")).toMatch(/could not convert/i);
    expect(rejectionMessage(undefined)).toMatch(/could not convert/i);
  });
});

describe("pdfFilename", () => {
  it("swaps the extension rather than appending to it", () => {
    expect(pdfFilename("Pitch.pptx")).toBe("Pitch.pdf");
    expect(pdfFilename("Pitch.ppt")).toBe("Pitch.pdf");
    expect(pdfFilename("Pitch.odp")).toBe("Pitch.pdf");
    expect(pdfFilename("Show.ppsx")).toBe("Show.pdf");
    expect(pdfFilename("Show.pps")).toBe("Show.pdf");
  });

  it("is case-insensitive about the source extension", () => {
    expect(pdfFilename("Pitch.PPTX")).toBe("Pitch.pdf");
    expect(pdfFilename("Pitch.PpT")).toBe("Pitch.pdf");
  });

  it("keeps dots inside the name", () => {
    expect(pdfFilename("Q3.final.v2.pptx")).toBe("Q3.final.v2.pdf");
  });

  it("handles a file with no extension", () => {
    expect(pdfFilename("deck")).toBe("deck.pdf");
  });

  it("falls back for an empty or missing name", () => {
    expect(pdfFilename("")).toBe("converted.pdf");
    expect(pdfFilename(null)).toBe("converted.pdf");
    expect(pdfFilename(undefined)).toBe("converted.pdf");
    expect(pdfFilename(".pptx")).toBe("converted.pdf");
  });
});

describe("accepted formats", () => {
  it("advertises every extension the converter handles", () => {
    expect(ACCEPTED_EXTENSIONS).toEqual([".pptx", ".ppt", ".ppsx", ".pps", ".odp"]);
  });

  it("lists both MIME types and extensions in the picker attribute", () => {
    // Extensions are what make the picker behave on platforms whose MIME
    // registry is empty or wrong — the same reason pdfFile.js distrusts type.
    for (const extension of ACCEPTED_EXTENSIONS) {
      expect(ACCEPT_ATTRIBUTE).toContain(extension);
    }
    expect(ACCEPT_ATTRIBUTE).toContain("application/vnd.ms-powerpoint");
    expect(ACCEPT_ATTRIBUTE).toContain("presentationml.presentation");
  });

  it("strips every advertised extension in pdfFilename", () => {
    // Guards the two lists drifting apart: an extension added above but not to
    // the regex would download as "deck.pptx.pdf".
    for (const extension of ACCEPTED_EXTENSIONS) {
      expect(pdfFilename(`deck${extension}`)).toBe("deck.pdf");
    }
  });
});
