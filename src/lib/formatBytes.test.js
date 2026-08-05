import { describe, it, expect } from "vitest";
import { formatBytes } from "./formatBytes";

describe("formatBytes", () => {
  it("formats bytes under 1KB as bytes", () => {
    expect(formatBytes(500)).toBe("500 B");
  });

  it("formats bytes under 1MB as KB", () => {
    expect(formatBytes(2048)).toBe("2.0 KB");
  });

  it("formats bytes at 1MB and above as MB", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.00 MB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.00 MB");
  });

  it("formats zero bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  // Previously rendered the literal string "NaN MB" into the UI.
  it("returns a placeholder for non-numeric or negative input", () => {
    expect(formatBytes(NaN)).toBe("—");
    expect(formatBytes(Infinity)).toBe("—");
    expect(formatBytes(-1)).toBe("—");
    expect(formatBytes(undefined)).toBe("—");
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes("1024")).toBe("—");
  });
});

describe("formatBytes re-export from imageFile", () => {
  it("is the same function the image tools import", async () => {
    const { formatBytes: reExported } = await import("./imageFile");
    expect(reExported).toBe(formatBytes);
  });
});
