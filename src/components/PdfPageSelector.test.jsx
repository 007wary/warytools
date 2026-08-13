import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import PdfPageSelector from "./PdfPageSelector";

// The grid shared by Delete Pages and Extract Pages. The set arithmetic is
// already covered by pdfPageSelection.test.js; what only exists here is the
// wiring, and two parts of it are easy to break invisibly:
//
//   - The anchor for shift-click is a ref updated after every click. Get that
//     wrong and shift-click extends from the wrong page — a plausible-looking
//     selection that deletes the wrong pages.
//   - Selection is reported as 1-BASED PAGE NUMBERS. The conversion to indices
//     happens exactly once, at the worker boundary. A second conversion
//     creeping in here yields a valid PDF with the wrong page missing, which
//     nothing downstream can detect.

vi.mock("@/components/PdfPageThumbnail", () => ({
  default: ({ alt }) => <img alt={alt} />,
}));

function setup({ selected = new Set(), tone = "primary", ...props } = {}) {
  const onToggle = vi.fn();
  const view = render(
    <PdfPageSelector
      pageCount={5}
      selected={selected}
      onToggle={onToggle}
      getThumbnail={() => null}
      tone={tone}
      selectedLabel={tone === "danger" ? "delete" : "extract"}
      {...props}
    />
  );
  return { onToggle, ...view };
}

describe("PdfPageSelector", () => {
  it("renders one toggle button per page, numbered from 1", () => {
    setup();

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(5);
    // 1-based throughout. A grid labelled "Page 0" would be the visible symptom
    // of the off-by-one this component exists to avoid.
    expect(screen.getByRole("button", { name: /^Page 1 of 5$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Page 5 of 5$/ })).toBeInTheDocument();
  });

  it("reports 1-based page numbers, not indices", async () => {
    const { onToggle } = setup();

    await userEvent.click(screen.getByRole("button", { name: /^Page 3 of 5$/ }));

    expect(onToggle).toHaveBeenCalledWith(3, expect.objectContaining({ shiftKey: false }));
  });

  it("exposes selection state via aria-pressed, not colour alone", () => {
    setup({ selected: new Set([2, 4]) });

    expect(screen.getByRole("button", { name: /^Page 2 of 5/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: /^Page 1 of 5$/ })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("names the consequence in the accessible label, per tone", () => {
    const { unmount } = setup({ selected: new Set([2]), tone: "danger" });
    expect(
      screen.getByRole("button", { name: "Page 2 of 5, marked to delete" })
    ).toBeInTheDocument();
    unmount();

    setup({ selected: new Set([2]), tone: "primary" });
    expect(
      screen.getByRole("button", { name: "Page 2 of 5, marked to extract" })
    ).toBeInTheDocument();
  });

  it("passes no anchor on the first click, then the previously clicked page", async () => {
    const { onToggle } = setup();

    await userEvent.click(screen.getByRole("button", { name: /^Page 2 of 5$/ }));
    expect(onToggle).toHaveBeenLastCalledWith(2, expect.objectContaining({ anchor: null }));

    // The anchor must be the page clicked LAST, not the first or the lowest —
    // shift-clicking page 5 here has to extend from 2.
    await userEvent.click(screen.getByRole("button", { name: /^Page 5 of 5$/ }));
    expect(onToggle).toHaveBeenLastCalledWith(5, expect.objectContaining({ anchor: 2 }));
  });

  // A held modifier only persists across calls within one userEvent session;
  // the top-level `userEvent.click` helper starts a fresh one each time and
  // releases Shift immediately, so these use an explicit session.
  it("forwards the shift modifier so the caller can extend a range", async () => {
    const { onToggle } = setup();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /^Page 2 of 5$/ }));
    await user.keyboard("{Shift>}");
    await user.click(screen.getByRole("button", { name: /^Page 4 of 5$/ }));
    await user.keyboard("{/Shift}");

    expect(onToggle).toHaveBeenLastCalledWith(4, { shiftKey: true, anchor: 2 });
  });

  it("moves the anchor even on a shift-click, so ranges chain from the last page", async () => {
    const { onToggle } = setup();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /^Page 1 of 5$/ }));
    await user.keyboard("{Shift>}");
    await user.click(screen.getByRole("button", { name: /^Page 3 of 5$/ }));
    await user.click(screen.getByRole("button", { name: /^Page 5 of 5$/ }));
    await user.keyboard("{/Shift}");

    expect(onToggle).toHaveBeenLastCalledWith(5, { shiftKey: true, anchor: 3 });
  });

  it("reports nothing while disabled, and disables every button", async () => {
    const { onToggle } = setup({ disabled: true });

    const button = screen.getByRole("button", { name: /^Page 1 of 5$/ });
    expect(button).toBeDisabled();

    await userEvent.click(button);
    expect(onToggle).not.toHaveBeenCalled();
  });
});
