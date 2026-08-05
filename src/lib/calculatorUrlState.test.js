import { describe, it, expect } from "vitest";
import { encodeState, decodeState } from "./calculatorUrlState";

describe("encodeState", () => {
  it("encodes populated values", () => {
    expect(encodeState({ amount: "1000", rate: "18" })).toBe("amount=1000&rate=18");
  });

  it("omits empty, null, and undefined values", () => {
    expect(encodeState({ amount: "", rate: null, years: undefined, x: "1" })).toBe("x=1");
  });

  it("omits values equal to their default, keeping shared links short", () => {
    expect(encodeState({ mode: "add", amount: "500" }, { mode: "add" })).toBe("amount=500");
    expect(encodeState({ mode: "remove", amount: "500" }, { mode: "add" })).toBe(
      "amount=500&mode=remove"
    );
  });

  it("orders keys stably so the same state yields the same URL", () => {
    expect(encodeState({ b: "2", a: "1" })).toBe(encodeState({ a: "1", b: "2" }));
  });

  it("escapes values that would otherwise break the query string", () => {
    expect(encodeState({ q: "a&b=c" })).toBe("q=a%26b%3Dc");
  });

  it("returns an empty string for pristine state", () => {
    expect(encodeState({ amount: "" })).toBe("");
  });
});

describe("decodeState", () => {
  const schema = {
    amount: "number",
    mode: ["add", "remove"],
    date: "date",
    note: "string",
  };

  it("restores values that satisfy the schema", () => {
    expect(decodeState("?amount=1000&mode=remove&date=2024-03-15", schema)).toMatchObject({
      amount: "1000",
      mode: "remove",
      date: "2024-03-15",
    });
  });

  it("keeps numbers as strings so a half-typed value survives the round trip", () => {
    expect(decodeState("?amount=12.", schema).amount).toBe("12.");
  });

  it("drops a value outside an allowed set rather than trusting the URL", () => {
    expect(decodeState("?mode=evil", schema).mode).toBeUndefined();
  });

  it("drops a non-numeric value for a number field", () => {
    expect(decodeState("?amount=alert(1)", schema).amount).toBeUndefined();
    expect(decodeState("?amount=Infinity", schema).amount).toBeUndefined();
  });

  it("drops a malformed date", () => {
    expect(decodeState("?date=15-03-2024", schema).date).toBeUndefined();
  });

  it("keeps valid keys even when another key is invalid", () => {
    const result = decodeState("?amount=500&mode=bogus", schema);
    expect(result.amount).toBe("500");
    expect(result.mode).toBeUndefined();
  });

  it("falls back to defaults for absent keys", () => {
    expect(decodeState("?amount=500", schema, { mode: "add" })).toMatchObject({
      amount: "500",
      mode: "add",
    });
  });

  it("ignores keys that aren't in the schema", () => {
    expect(decodeState("?evil=1", schema).evil).toBeUndefined();
  });

  it("caps the length of free-text and numeric values", () => {
    expect(decodeState(`?note=${"a".repeat(500)}`, schema).note).toHaveLength(120);
    expect(decodeState(`?amount=${"9".repeat(50)}`, schema).amount).toBeUndefined();
  });

  it("handles an empty or missing search string", () => {
    expect(decodeState("", schema, { mode: "add" })).toEqual({ mode: "add" });
    expect(decodeState(undefined, schema)).toEqual({});
  });

  it("round-trips through encodeState", () => {
    const state = { amount: "1234.5", mode: "remove" };
    expect(decodeState(`?${encodeState(state)}`, schema)).toMatchObject(state);
  });
});
