import { describe, it, expect } from "vitest";
import {
  generateCode,
  isValidShortCode,
  CODE_ALPHABET,
  CODE_LENGTH,
  CODE_PATTERN,
} from "./shortCode";

describe("isValidShortCode", () => {
  it("accepts a well-formed code", () => {
    expect(isValidShortCode("aBcDeF2")).toBe(true);
  });

  it("rejects wrong lengths", () => {
    expect(isValidShortCode("abcdef")).toBe(false);
    expect(isValidShortCode("abcdefgh")).toBe(false);
    expect(isValidShortCode("")).toBe(false);
  });

  it("rejects the ambiguous characters excluded from the alphabet", () => {
    for (const ambiguous of ["0", "1", "I", "O", "l"]) {
      expect(isValidShortCode(`abcdef${ambiguous}`), ambiguous).toBe(false);
    }
  });

  it("rejects non-strings and injection-shaped input", () => {
    expect(isValidShortCode(null)).toBe(false);
    expect(isValidShortCode(1234567)).toBe(false);
    expect(isValidShortCode("../../etc")).toBe(false);
    // The pattern is anchored, so a valid code with a newline suffix (which
    // an unanchored $ would allow) is still rejected.
    expect(isValidShortCode("abcdef2\nx")).toBe(false);
  });
});

describe("generateCode", () => {
  it("produces codes matching the validation pattern", () => {
    for (let i = 0; i < 200; i++) {
      expect(CODE_PATTERN.test(generateCode())).toBe(true);
    }
  });

  it("defaults to CODE_LENGTH characters", () => {
    expect(generateCode()).toHaveLength(CODE_LENGTH);
    expect(generateCode(10)).toHaveLength(10);
  });

  it("only ever emits alphabet characters", () => {
    const code = generateCode(500);
    for (const ch of code) {
      expect(CODE_ALPHABET).toContain(ch);
    }
  });

  it("discards bytes above the rejection-sampling limit rather than folding them", () => {
    // 255 is above the limit (228), so a biased implementation using a bare
    // modulo would map it onto an early character. Feeding 255s first and
    // then zeros must yield only the zero-mapped character.
    const queue = [new Uint8Array([255, 255, 255]), new Uint8Array([0, 0, 0])];
    let i = 0;
    const code = generateCode(3, () => queue[Math.min(i++, queue.length - 1)]);
    expect(code).toBe(CODE_ALPHABET[0].repeat(3));
  });

  it("does not repeat itself across many draws", () => {
    const seen = new Set();
    for (let i = 0; i < 1000; i++) seen.add(generateCode());
    expect(seen.size).toBe(1000);
  });
});
