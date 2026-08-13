import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ModeToggle from "./ModeToggle";

// ModeToggle exists because three calculators each carried a plain-<button>
// copy that told a screen reader nothing about which mode was active. That is
// an accessibility contract, and it is invisible in a rendered screenshot and
// in a build — a regression here would look completely fine to anyone testing
// by eye, which is exactly the kind of bug this tier is for.

const OPTIONS = [
  { id: "add", label: "Add GST" },
  { id: "remove", label: "Remove GST" },
  { id: "compare", label: "Compare" },
];

function setup(value = "add") {
  const onChange = vi.fn();
  const view = render(
    <ModeToggle options={OPTIONS} value={value} onChange={onChange} label="GST mode" />
  );
  return { onChange, ...view };
}

describe("ModeToggle", () => {
  it("exposes a labelled radiogroup with one checked radio", () => {
    setup("remove");

    const group = screen.getByRole("radiogroup", { name: "GST mode" });
    expect(group).toBeInTheDocument();

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(screen.getByRole("radio", { checked: true })).toHaveTextContent("Remove GST");
  });

  it("makes only the selected option a tab stop", async () => {
    setup("remove");

    // The roving-tabindex contract: a six-option group must not cost six tab
    // presses to traverse. Asserted through focus rather than by reading the
    // attribute, since that is what a keyboard user actually experiences.
    await userEvent.tab();
    expect(screen.getByRole("radio", { name: "Remove GST" })).toHaveFocus();
  });

  it("selects and moves focus with the arrow keys, wrapping at both ends", async () => {
    const { onChange } = setup("add");
    const first = screen.getByRole("radio", { name: "Add GST" });
    first.focus();

    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("remove");
    expect(screen.getByRole("radio", { name: "Remove GST" })).toHaveFocus();

    // Wrapping backwards off the first option is the case an index-based
    // implementation gets wrong (-1 lands nowhere, silently).
    first.focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith("compare");
    expect(screen.getByRole("radio", { name: "Compare" })).toHaveFocus();
  });

  it("supports Home and End", async () => {
    const { onChange } = setup("remove");
    screen.getByRole("radio", { name: "Remove GST" }).focus();

    await userEvent.keyboard("{End}");
    expect(onChange).toHaveBeenLastCalledWith("compare");

    await userEvent.keyboard("{Home}");
    expect(onChange).toHaveBeenLastCalledWith("add");
  });

  it("ignores keys it does not own, so typing does not change the mode", async () => {
    const { onChange } = setup("add");
    screen.getByRole("radio", { name: "Add GST" }).focus();

    await userEvent.keyboard("x{Tab}");
    expect(onChange).not.toHaveBeenCalled();
  });
});
