import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ErrorBanner from "./ErrorBanner";

// Small, but it carries the site's entire error-announcement contract: every
// PDF, image and calculator tool routes failures through here. Errors were
// once a bare red <p>, which a screen reader user never heard at all — the
// message simply appeared. role="alert" is the fix, and it is one attribute
// that no build, screenshot or manual click-through would miss if it went.
describe("ErrorBanner", () => {
  it("announces its message via role=alert", () => {
    render(<ErrorBanner>Couldn&apos;t read that PDF.</ErrorBanner>);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Couldn't read that PDF.");
  });

  it("renders nothing when there is no message", () => {
    const { container } = render(<ErrorBanner />);

    // An empty alert region left in the DOM would be announced as a spurious
    // interruption on some screen readers, so absence is the correct state.
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders nothing for an empty string, not an empty box", () => {
    const { container } = render(<ErrorBanner>{""}</ErrorBanner>);
    expect(container).toBeEmptyDOMElement();
  });
});
