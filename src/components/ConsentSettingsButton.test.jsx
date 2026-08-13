import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ConsentSettingsButton from "./ConsentSettingsButton";

// This control exists to satisfy "withdrawing consent must be as easy as
// giving it". Both of its failure modes are silent and neither is visible from
// India, where the CMP never shows at all:
//
//   - Rendering unconditionally gives most of the world a button that does
//     nothing, which reads as a broken privacy promise.
//   - Checking for `googlefc` only once on mount hides it from the EEA/UK/Swiss
//     visitors it exists for, because adsbygoogle.js is async and the CMP
//     initialises well after this component mounts.

afterEach(() => {
  delete window.googlefc;
  vi.useRealTimers();
});

describe("ConsentSettingsButton", () => {
  it("renders nothing before the CMP has loaded", () => {
    render(<ConsentSettingsButton />);

    // The common case for a non-EEA visitor, and for anyone blocking ads.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders immediately when the CMP is already available", () => {
    window.googlefc = { showRevocationMessage: vi.fn() };

    render(<ConsentSettingsButton />);

    expect(screen.getByRole("button", { name: /change your consent choices/i })).toBeInTheDocument();
  });

  it("appears once the CMP finishes loading after mount", async () => {
    render(<ConsentSettingsButton />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    // adsbygoogle.js is async, so this is the ordinary case, not an edge one:
    // googlefc reliably does not exist yet when this component first renders.
    window.googlefc = { showRevocationMessage: vi.fn() };

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /change your consent choices/i })).toBeInTheDocument();
    });
  });

  it("reopens the consent message when clicked", async () => {
    const showRevocationMessage = vi.fn();
    window.googlefc = { showRevocationMessage };

    render(<ConsentSettingsButton />);
    await userEvent.click(screen.getByRole("button", { name: /change your consent choices/i }));

    expect(showRevocationMessage).toHaveBeenCalledTimes(1);
  });

  it("ignores a googlefc object that has no revocation method", () => {
    // The CMP object can exist in a partially initialised state; calling a
    // method that is not there would throw inside a click handler.
    window.googlefc = {};

    render(<ConsentSettingsButton />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("stops polling once the CMP appears", async () => {
    const clearSpy = vi.spyOn(globalThis, "clearInterval");

    render(<ConsentSettingsButton />);
    window.googlefc = { showRevocationMessage: vi.fn() };

    await waitFor(() => {
      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    // A poll left running for the life of the page would be a leak on every
    // page this component appears on.
    expect(clearSpy).toHaveBeenCalled();
  });

  it("clears its interval on unmount", () => {
    const clearSpy = vi.spyOn(globalThis, "clearInterval");

    const { unmount } = render(<ConsentSettingsButton />);
    unmount();

    expect(clearSpy).toHaveBeenCalled();
  });
});
