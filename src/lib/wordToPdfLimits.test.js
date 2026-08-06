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
} from "./wordToPdfLimits";

describe("checkUploadSize", () => {
  it("accepts an ordinary document", () => {
    const result = checkUploadSize(1024 * 1024);
    expect(result.ok).toBe(true);
    expect(result.isSlow).toBe(false);
  });

  it("accepts a large document but flags it as slow", () => {
    const result = checkUploadSize(SLOW_UPLOAD_BYTES + 1);
    expect(result.ok).toBe(true);
    expect(result.isSlow).toBe(true);
  });

  it("rejects an empty upload", () => {
    expect(checkUploadSize(0)).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects an upload over the ceiling", () => {
    expect(checkUploadSize(MAX_UPLOAD_BYTES + 1)).toEqual({ ok: false, reason: "too_large" });
  });

  it("accepts a document exactly at the ceiling", () => {
    expect(checkUploadSize(MAX_UPLOAD_BYTES).ok).toBe(true);
  });

  // The route reads this from a request body, so a non-number is reachable
  // input rather than a hypothetical — Number(null) is 0, Number("x") is NaN.
  it("rejects non-finite and negative sizes rather than passing them through", () => {
    for (const bad of [NaN, Infinity, -1, null, undefined, "big"]) {
      expect(checkUploadSize(bad), String(bad)).toEqual({ ok: false, reason: "empty" });
    }
  });
});

describe("rejectionMessage", () => {
  it("returns distinct, actionable copy for every known reason", () => {
    const reasons = [
      "empty",
      "too_large",
      "not_a_document",
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

    // Distinct copy is the point of the whole module: a password-protected
    // file and an oversized one need different responses from the user.
    expect(new Set(messages).size).toBe(reasons.length);
  });

  it("states the real limit rather than a hardcoded number", () => {
    expect(rejectionMessage("too_large")).toContain(
      `${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB`
    );
  });

  it("falls back for an unknown reason", () => {
    expect(rejectionMessage("wat")).toBe("Could not convert this document. Please try again.");
    expect(rejectionMessage(undefined)).toBe("Could not convert this document. Please try again.");
  });
});

describe("pdfFilename", () => {
  it("swaps each accepted extension for .pdf", () => {
    expect(pdfFilename("report.docx")).toBe("report.pdf");
    expect(pdfFilename("legacy.doc")).toBe("legacy.pdf");
    expect(pdfFilename("notes.odt")).toBe("notes.pdf");
    expect(pdfFilename("memo.rtf")).toBe("memo.pdf");
  });

  it("is case-insensitive, so Report.DOCX does not become Report.DOCX.pdf", () => {
    expect(pdfFilename("Report.DOCX")).toBe("Report.pdf");
  });

  it("appends .pdf when there is no recognised extension", () => {
    expect(pdfFilename("untitled")).toBe("untitled.pdf");
  });

  it("only strips the trailing extension, not one inside the name", () => {
    expect(pdfFilename("v1.docx.backup.docx")).toBe("v1.docx.backup.pdf");
  });

  it("falls back to a generic name for empty or missing input", () => {
    expect(pdfFilename("")).toBe("converted.pdf");
    expect(pdfFilename(null)).toBe("converted.pdf");
    expect(pdfFilename(".docx")).toBe("converted.pdf");
  });
});

describe("timeout layering", () => {
  // Load-bearing ordering, not a style preference. If the client gave up first
  // it would abort conversions that were about to succeed and report a timeout
  // that never happened, turning a working tool into a flaky one.
  it("gives the client a longer budget than the converter", () => {
    expect(CLIENT_TIMEOUT_MS).toBeGreaterThan(CONVERSION_TIMEOUT_MS);
  });

  it("keeps the slow-file warning below the hard ceiling", () => {
    expect(SLOW_UPLOAD_BYTES).toBeLessThan(MAX_UPLOAD_BYTES);
  });
});

describe("accepted formats", () => {
  it("offers every accepted extension to the file picker", () => {
    for (const extension of ACCEPTED_EXTENSIONS) {
      expect(ACCEPT_ATTRIBUTE).toContain(extension);
    }
  });

  // Extensions alone are not enough: several platforms filter the picker by
  // MIME type, and a picker that greys out the user's file is a dead end.
  it("also offers the MIME types, for pickers that filter on them", () => {
    expect(ACCEPT_ATTRIBUTE).toContain("application/msword");
    expect(ACCEPT_ATTRIBUTE).toContain("wordprocessingml.document");
  });
});
