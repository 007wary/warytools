import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/dom";
import { describe, expect, it, vi } from "vitest";
import CropOverlay from "./CropOverlay";

// CropOverlay's two documented design choices are both invisible in a build
// and in a screenshot, and both are the kind of thing a later refactor
// "simplifies" away:
//
//   - Pointer Events with setPointerCapture, so a drag that leaves the element
//     keeps tracking. With mouse events the rectangle freezes mid-gesture.
//   - The surface rect is read live on every move, never cached at drag start,
//     because a lazily-arriving thumbnail can reflow the preview mid-drag.
//
// The geometry itself is already covered by cropGeometry.test.js; what is
// tested here is only the wiring that file cannot see.

const SURFACE = { left: 100, top: 50, width: 400, height: 200 };

function setup({ rect = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }, ...props } = {}) {
  const onChange = vi.fn();
  const view = render(
    <CropOverlay
      rect={rect}
      onChange={onChange}
      sourceWidth={800}
      sourceHeight={400}
      label="Crop region"
      {...props}
    >
      <div data-testid="surface-child" />
    </CropOverlay>
  );

  // The crop region is the only element with role=application; its parent is
  // the surface whose bounding rect all pointer maths is measured against.
  const region = screen.getByRole("application", { name: /Crop region/ });
  const surface = region.parentElement;
  globalThis.stubRect(surface, SURFACE);

  return { onChange, region, surface, ...view };
}

/** A PointerEvent jsdom will dispatch, carrying the fields the component reads. */
function pointer(type, { clientX, clientY, pointerId = 1 }) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { clientX, clientY, pointerId, pointerType: "mouse", button: 0 });
  return event;
}

describe("CropOverlay pointer handling", () => {
  it("captures the pointer on drag start so the gesture survives leaving the element", () => {
    const { region, surface } = setup();
    const capture = vi.fn();
    region.setPointerCapture = capture;

    fireEvent(region, pointer("pointerdown", { clientX: 200, clientY: 100 }));

    // Without this the drag silently drops the moment the pointer crosses the
    // element boundary — the most common defect in hand-rolled crop UIs.
    expect(capture).toHaveBeenCalledWith(1);
    expect(surface).toBeTruthy();
  });

  it("keeps tracking a move whose pointer is outside the surface bounds", () => {
    const { onChange, region, surface } = setup();

    fireEvent(region, pointer("pointerdown", { clientX: 300, clientY: 150 }));
    onChange.mockClear();

    // 700px is well to the right of the 100..500 surface. A mouse-event
    // implementation reports nothing here; a captured pointer still does.
    fireEvent(surface, pointer("pointermove", { clientX: 700, clientY: 150 }));

    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)[0];
    // The rect stays normalised into 0-1 rather than running off the surface.
    expect(next.x + next.width).toBeLessThanOrEqual(1);
    expect(next.x).toBeGreaterThanOrEqual(0);
  });

  it("re-reads the surface rect on every move rather than caching it at drag start", () => {
    const { onChange, surface } = setup({
      rect: { x: 0, y: 0, width: 0.5, height: 0.5 },
    });

    // Started on the surface, not the region: that is the "new rectangle"
    // gesture, which maps the pointer to an absolute position. A "move" drag
    // would translate by a delta and could not distinguish the two rects.
    fireEvent(surface, pointer("pointerdown", { clientX: 100, clientY: 50 }));

    // The preview reflows mid-drag — a lazy thumbnail arriving is the real
    // case. The same client coordinate now means a different fraction of the
    // surface, and a rect cached at pointerdown would map it to the old one.
    globalThis.stubRect(surface, { left: 100, top: 50, width: 800, height: 400 });
    onChange.mockClear();
    fireEvent(surface, pointer("pointermove", { clientX: 500, clientY: 250 }));

    const next = onChange.mock.calls.at(-1)[0];
    // (500-100)/800 = 0.5 against the NEW width. Against the cached 400 it
    // would have been 1.0, so this distinguishes the two implementations.
    expect(next.x + next.width).toBeCloseTo(0.5, 5);
  });

  it("ignores pointer movement when no drag is in progress", () => {
    const { onChange, surface } = setup();

    fireEvent(surface, pointer("pointermove", { clientX: 300, clientY: 150 }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("stops dragging when the pointer is released outside the window", () => {
    const { onChange, region, surface } = setup();

    fireEvent(region, pointer("pointerdown", { clientX: 300, clientY: 150 }));
    // A pointer released outside the window never fires pointerup on the
    // element; without the window-level listener the drag stays latched and
    // the *next* stray move resizes the crop unexpectedly.
    fireEvent(window, new Event("pointercancel"));
    onChange.mockClear();

    fireEvent(surface, pointer("pointermove", { clientX: 400, clientY: 200 }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does nothing at all when disabled", () => {
    const { onChange, region } = setup({ disabled: true });

    fireEvent(region, pointer("pointerdown", { clientX: 300, clientY: 150 }));
    fireEvent(region, pointer("pointermove", { clientX: 400, clientY: 200 }));

    expect(onChange).not.toHaveBeenCalled();
    expect(region).toHaveAttribute("tabindex", "-1");
  });
});

describe("CropOverlay keyboard handling", () => {
  it("is focusable and moves the crop with the arrow keys", () => {
    const { onChange, region } = setup();

    expect(region).toHaveAttribute("tabindex", "0");

    fireEvent.keyDown(region, { key: "ArrowRight" });

    // Drag-and-drop alone is unusable with a keyboard or screen reader.
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)[0];
    expect(next.x).toBeGreaterThan(0.25);
  });

  it("resizes rather than moves when Alt is held", () => {
    const { onChange, region } = setup();

    fireEvent.keyDown(region, { key: "ArrowRight", altKey: true });

    const next = onChange.mock.calls.at(-1)[0];
    expect(next.x).toBeCloseTo(0.25, 5);
    expect(next.width).toBeGreaterThan(0.5);
  });

  it("announces keyboard adjustments in a live region", () => {
    const { region, container } = setup();

    // A rectangle that only changes visually reports nothing to a screen
    // reader, so the announcement is the whole accessibility story here.
    const live = container.querySelector("[aria-live='polite']");
    expect(live).toHaveTextContent("");

    fireEvent.keyDown(region, { key: "ArrowRight" });
    expect(live).toHaveTextContent(/Crop moved to/);

    fireEvent.keyDown(region, { key: "ArrowUp", altKey: true });
    expect(live).toHaveTextContent(/Crop resized to/);
  });

  it("leaves non-arrow keys to the browser", () => {
    const { onChange, region } = setup();

    fireEvent.keyDown(region, { key: "Tab" });
    fireEvent.keyDown(region, { key: "a" });

    expect(onChange).not.toHaveBeenCalled();
  });
});
