import { describe, it, expect } from "vitest";
import {
  parseNumber,
  parseFields,
  sanitizeNumericInput,
  clamp,
  okValue,
  MAX_MAGNITUDE,
} from "./calculatorInput";

describe("parseNumber", () => {
  it("parses plain decimals", () => {
    expect(parseNumber("12")).toEqual({ ok: true, value: 12 });
    expect(parseNumber("12.5")).toEqual({ ok: true, value: 12.5 });
    expect(parseNumber(".5")).toEqual({ ok: true, value: 0.5 });
    expect(parseNumber("-3")).toEqual({ ok: true, value: -3 });
  });

  it("treats an empty or whitespace-only field as empty, not as zero", () => {
    // Number("") is 0 — the bug this whole module exists to prevent.
    expect(parseNumber("")).toMatchObject({ ok: false, empty: true });
    expect(parseNumber("   ")).toMatchObject({ ok: false, empty: true });
  });

  it("distinguishes a deliberate zero from an empty field", () => {
    expect(parseNumber("0")).toEqual({ ok: true, value: 0 });
  });

  it("rejects Infinity, which Number.isNaN would have let through", () => {
    expect(parseNumber("Infinity")).toMatchObject({ ok: false, empty: false });
    expect(parseNumber("-Infinity")).toMatchObject({ ok: false, empty: false });
  });

  it("rejects non-decimal notation Number() would otherwise accept", () => {
    expect(parseNumber("0x10")).toMatchObject({ ok: false, empty: false });
    expect(parseNumber("1e5")).toMatchObject({ ok: false, empty: false });
  });

  it("rejects junk", () => {
    expect(parseNumber("abc")).toMatchObject({ ok: false, empty: false });
    expect(parseNumber("12abc")).toMatchObject({ ok: false, empty: false });
    expect(parseNumber("1.2.3")).toMatchObject({ ok: false, empty: false });
  });

  it("tolerates surrounding whitespace on an otherwise valid number", () => {
    expect(parseNumber(" 12 ")).toEqual({ ok: true, value: 12 });
  });

  it("enforces min and max", () => {
    expect(parseNumber("5", { min: 10 })).toMatchObject({ ok: false });
    expect(parseNumber("50", { max: 10 })).toMatchObject({ ok: false });
    expect(parseNumber("10", { min: 10, max: 10 })).toEqual({ ok: true, value: 10 });
  });

  it("enforces allowNegative", () => {
    expect(parseNumber("-1", { allowNegative: false })).toMatchObject({ ok: false });
    expect(parseNumber("-1", { allowNegative: true })).toEqual({ ok: true, value: -1 });
  });

  it("enforces integer", () => {
    expect(parseNumber("2.5", { integer: true })).toMatchObject({ ok: false });
    expect(parseNumber("2", { integer: true })).toEqual({ ok: true, value: 2 });
  });

  it("rejects magnitudes too large to format or compute meaningfully", () => {
    expect(parseNumber(String(MAX_MAGNITUDE * 10))).toMatchObject({ ok: false, empty: false });
  });

  it("uses the supplied label in error messages", () => {
    const result = parseNumber("abc", { label: "Principal" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Principal");
  });
});

describe("parseFields", () => {
  it("collects values when every field is valid", () => {
    const result = parseFields({
      principal: ["1000", {}],
      rate: ["10", {}],
    });
    expect(result).toEqual({ ok: true, values: { principal: 1000, rate: 10 } });
  });

  it("reports incomplete (not invalid) when a field is blank", () => {
    const result = parseFields({
      principal: ["1000", {}],
      rate: ["", {}],
    });
    expect(result).toMatchObject({ ok: false, incomplete: true, error: "" });
  });

  it("surfaces a real error even while another field is still blank", () => {
    const result = parseFields({
      principal: ["abc", { label: "Principal" }],
      rate: ["", {}],
    });
    expect(result.ok).toBe(false);
    expect(result.incomplete).toBe(false);
    expect(result.error).toContain("Principal");
  });
});

describe("sanitizeNumericInput", () => {
  it("strips grouping separators and currency symbols people paste in", () => {
    expect(sanitizeNumericInput("1,234.56")).toBe("1234.56");
    expect(sanitizeNumericInput("₹1,234")).toBe("1234");
    expect(sanitizeNumericInput("1 234")).toBe("1234");
  });

  it("preserves the decimal point and sign", () => {
    expect(sanitizeNumericInput("-12.50")).toBe("-12.50");
  });

  it("normalises full-width and Devanagari digits from mobile keyboards", () => {
    expect(sanitizeNumericInput("１２３")).toBe("123");
    expect(sanitizeNumericInput("१२३")).toBe("123");
  });

  it("normalises Arabic-Indic, Persian, and Bengali digits", () => {
    expect(sanitizeNumericInput("١٢٣")).toBe("123");
    expect(sanitizeNumericInput("۱۲۳")).toBe("123");
    expect(sanitizeNumericInput("১২৩")).toBe("123");
  });

  it("normalises a unicode minus and typographic dashes to a plain hyphen", () => {
    // A word processor substitutes these silently, and the parser rejects them
    // with a "must be a number" error whose cause is invisible on screen.
    expect(sanitizeNumericInput("−12")).toBe("-12");
    expect(sanitizeNumericInput("–12")).toBe("-12");
  });

  it("strips the non-breaking spaces used as thousands separators", () => {
    expect(sanitizeNumericInput("1 234")).toBe("1234");
    expect(sanitizeNumericInput("1 234")).toBe("1234");
  });

  it("returns an empty string for non-string input", () => {
    expect(sanitizeNumericInput(null)).toBe("");
  });

  // Stripping every comma turned the European "1234,56" into 123456 — a
  // *silent* 100x error that still parsed as a valid number, on pages quoting
  // GST and loan figures. These pin the disambiguation.
  describe("the ambiguous comma", () => {
    it("reads a comma as a decimal point only when no grouping could explain it", () => {
      expect(sanitizeNumericInput("1234,56")).toBe("1234.56");
      expect(sanitizeNumericInput("1.234,56")).toBe("1234.56");
      expect(sanitizeNumericInput("1.234.567,89")).toBe("1234567.89");
    });

    it("still reads Indian and US grouping as grouping", () => {
      expect(sanitizeNumericInput("1,234")).toBe("1234");
      expect(sanitizeNumericInput("12,34,567.89")).toBe("1234567.89");
      expect(sanitizeNumericInput("1,234.56")).toBe("1234.56");
    });

    // The load-bearing one. This runs on every keystroke, so no intermediate
    // value may be rewritten into something that is not a prefix of what the
    // user is typing — that corrupts the field under the cursor, which is
    // worse than the bug being fixed.
    it("never mangles a partially typed number", () => {
      for (const target of ["1,234", "1,234.56", "12,34,567", "1234,56"]) {
        let previous = "";
        for (let i = 1; i <= target.length; i += 1) {
          const current = sanitizeNumericInput(target.slice(0, i));
          expect(current.startsWith(previous)).toBe(true);
          previous = current;
        }
      }
    });

    it("is idempotent, since it re-runs over its own output", () => {
      for (const raw of ["1234,56", "1.234,56", "₹1,234.56", "−12", "1,", "1,2", "12."]) {
        const once = sanitizeNumericInput(raw);
        expect(sanitizeNumericInput(once)).toBe(once);
      }
    });
  });
});

describe("okValue", () => {
  it("matches the full shape parseNumber returns on success", () => {
    // Guards against call sites hand-rolling a partial `{ ok: true }` object
    // and then reading an undefined `empty`/`error` off it.
    expect(Object.keys(okValue(18)).sort()).toEqual(
      Object.keys({ ...parseNumber("18"), empty: false, error: "" }).sort()
    );
    expect(okValue(18)).toMatchObject({ ok: true, value: 18, empty: false, error: "" });
  });
});

describe("clamp", () => {
  it("clamps into range", () => {
    expect(clamp(5, 1, 10)).toBe(5);
    expect(clamp(-5, 1, 10)).toBe(1);
    expect(clamp(50, 1, 10)).toBe(10);
  });

  it("falls back to min for non-finite input", () => {
    expect(clamp(NaN, 1, 10)).toBe(1);
    expect(clamp(Infinity, 1, 10)).toBe(1);
  });
});
