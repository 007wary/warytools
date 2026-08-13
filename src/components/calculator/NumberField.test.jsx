import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import NumberField from "./NumberField";

// The numeric-input rule in CLAUDE.md is the one that has caused real bugs
// more than once (Split PDF, Resize Image). NumberField encodes the fix, and
// every part of it is the kind of thing that looks like dead configuration to
// someone tidying up:
//
//   - type="text" + inputMode="decimal", never type="number". type="number"
//     hijacks the scroll wheel, omits the decimal key on several Android
//     keyboards, and discards a pasted "1,234.56" outright.
//   - The raw string is preserved, so a half-typed "12." stays "12." and — the
//     load-bearing half — a CLEARED field stays "" rather than becoming 0.

function setup({ value = "", ...props } = {}) {
  const onChange = vi.fn();
  const view = render(
    <NumberField label="Amount" value={value} onChange={onChange} {...props} />
  );
  return { onChange, input: screen.getByLabelText("Amount"), ...view };
}

describe("NumberField", () => {
  it("is a text input with a decimal keypad, not type=number", () => {
    const { input } = setup();

    // If this ever reads "number" again, the three bugs above are all back and
    // none of them is visible in a screenshot.
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveAttribute("inputmode", "decimal");
  });

  it("associates its label, so the field has an accessible name", () => {
    const { input } = setup();
    expect(input).toHaveAccessibleName("Amount");
  });

  it("reports a cleared field as an empty string, never as zero", async () => {
    const { onChange, input } = setup({ value: "42" });

    await userEvent.clear(input);

    // This is the whole reason the value is held as a string. Number("") is 0,
    // so a cleared field reported as a number is indistinguishable from a
    // deliberate zero, and the calculator answers a question nobody asked.
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("preserves a half-typed decimal rather than normalising it", () => {
    const { onChange, input } = setup();

    fireEvent.change(input, { target: { value: "12." } });

    expect(onChange).toHaveBeenLastCalledWith("12.");
  });

  it("accepts a value pasted out of a spreadsheet or invoice", () => {
    const { onChange, input } = setup();

    // type="number" would have discarded these outright, leaving the field
    // empty with no explanation — and people paste from invoices constantly.
    fireEvent.change(input, { target: { value: "1,234.56" } });
    expect(onChange).toHaveBeenLastCalledWith("1234.56");

    fireEvent.change(input, { target: { value: "₹4,999" } });
    expect(onChange).toHaveBeenLastCalledWith("4999");
  });

  it("blurs on wheel so scrolling the page cannot silently change the value", () => {
    const { input } = setup({ value: "100" });

    input.focus();
    expect(input).toHaveFocus();

    fireEvent.wheel(input);

    // Scroll-wheel hijacking is a genuine source of wrong answers: the value
    // changes with no click and no keystroke, and nothing on screen says so.
    expect(input).not.toHaveFocus();
  });

  it("marks itself invalid for assistive tech, not just with a red border", () => {
    const { input } = setup({ value: "abc", invalid: true });
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("omits aria-invalid entirely when valid", () => {
    const { input } = setup({ value: "10" });
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("wires a hint through aria-describedby", () => {
    const { input } = setup({ hint: "Before tax" });

    expect(input).toHaveAccessibleDescription("Before tax");
  });
});
