import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Testing Library does not auto-clean under vitest's globals-off setup, and a
// leaked document between tests turns getByRole into an ambiguous-match error
// in whichever test happens to run second — a failure that points at the wrong
// test entirely.
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// next/navigation throws outside an App Router render tree. Components under
// test read the pathname only to attribute analytics events, so a fixed value
// is enough and keeps the tests from needing a router provider.
vi.mock("next/navigation", () => ({
  usePathname: () => "/pdf/merge",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// jsdom implements neither of these, and both are load-bearing in the
// components below rather than incidental: PdfPageThumbnail renders lazily via
// IntersectionObserver (CLAUDE.md: rendering a whole document up front is what
// made the old Reorder tool unusable), and CropOverlay reads a live bounding
// rect on every pointer move.
if (!globalThis.IntersectionObserver) {
  globalThis.IntersectionObserver = class {
    constructor(callback) {
      this.callback = callback;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom has no layout engine, so every getBoundingClientRect is a 0x0 box.
// Geometry-driven components would divide by that zero and produce NaN, so
// tests that need a real frame install their own rect via this helper.
globalThis.stubRect = (element, rect) => {
  element.getBoundingClientRect = () => ({
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
    top: rect.top,
    left: rect.left,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    toJSON: () => {},
  });
};

// setPointerCapture / releasePointerCapture are unimplemented in jsdom and
// throw when called. CropOverlay's use of them is deliberate and documented
// (a drag that leaves the element must not drop the handle), so they are
// stubbed rather than avoided.
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = function setPointerCapture() {};
  Element.prototype.releasePointerCapture = function releasePointerCapture() {};
  Element.prototype.hasPointerCapture = function hasPointerCapture() {
    return false;
  };
}
