import { describe, it, expect } from "vitest";
import { convertLinear, convertTemperature } from "./unitConversions";

describe("convertLinear", () => {
  it("converts between length units via the base unit", () => {
    expect(convertLinear(1, "length", "kilometer", "meter")).toBe(1000);
    expect(convertLinear(1000, "length", "meter", "kilometer")).toBe(1);
  });

  it("converts inches to centimeters", () => {
    expect(convertLinear(1, "length", "inch", "centimeter")).toBeCloseTo(2.54);
  });

  it("returns the same value when converting a unit to itself", () => {
    expect(convertLinear(42, "length", "meter", "meter")).toBe(42);
  });

  it("converts between weight units", () => {
    expect(convertLinear(1, "weight", "kilogram", "gram")).toBe(1000);
    expect(convertLinear(1, "weight", "pound", "kilogram")).toBeCloseTo(0.453592);
  });
});

describe("convertTemperature", () => {
  it("converts Celsius to Fahrenheit", () => {
    expect(convertTemperature(0, "celsius", "fahrenheit")).toBe(32);
    expect(convertTemperature(100, "celsius", "fahrenheit")).toBe(212);
  });

  it("converts Fahrenheit to Celsius", () => {
    expect(convertTemperature(32, "fahrenheit", "celsius")).toBe(0);
  });

  it("converts Celsius to Kelvin", () => {
    expect(convertTemperature(0, "celsius", "kelvin")).toBeCloseTo(273.15);
  });

  it("converts Kelvin to Celsius", () => {
    expect(convertTemperature(273.15, "kelvin", "celsius")).toBeCloseTo(0);
  });

  it("returns the same value when converting a unit to itself, without going through Celsius", () => {
    expect(convertTemperature(-40, "fahrenheit", "fahrenheit")).toBe(-40);
  });

  it("agrees at -40, where Celsius and Fahrenheit intersect", () => {
    expect(convertTemperature(-40, "celsius", "fahrenheit")).toBeCloseTo(-40);
  });
});
