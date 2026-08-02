import { describe, it, expect } from "vitest";
import { formatBytes, getCappedDimensions, MAX_CANVAS_EDGE } from "./imageFile";

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
});

describe("getCappedDimensions", () => {
  it("leaves dimensions unchanged when under the cap", () => {
    const result = getCappedDimensions(1920, 1080);
    expect(result).toEqual({ width: 1920, height: 1080, capped: false });
  });

  it("leaves dimensions unchanged when exactly at the cap", () => {
    const result = getCappedDimensions(MAX_CANVAS_EDGE, 2000);
    expect(result.capped).toBe(false);
  });

  it("downscales the longest edge to the cap, preserving aspect ratio", () => {
    // 8000x6000, 4:3 — longest edge (8000) should scale to 4096.
    const result = getCappedDimensions(8000, 6000);
    expect(result.capped).toBe(true);
    expect(result.width).toBe(4096);
    expect(result.height).toBe(3072);
  });

  it("scales based on height when height is the longest edge", () => {
    const result = getCappedDimensions(3000, 9000, 4096);
    expect(result.capped).toBe(true);
    expect(result.height).toBe(4096);
    expect(result.width).toBe(Math.round(3000 * (4096 / 9000)));
  });

  it("respects a custom maxEdge argument", () => {
    const result = getCappedDimensions(2000, 1000, 500);
    expect(result.capped).toBe(true);
    expect(result.width).toBe(500);
    expect(result.height).toBe(250);
  });
});
