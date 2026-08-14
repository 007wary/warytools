import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Pagination from "./Pagination";

// Shared by the public blog index and the /habga dashboard, in two different
// navigation modes. The contract worth protecting is that the mode decides the
// ELEMENT: links where there is a real URL, buttons where there is not.
// Getting that wrong produces a control that looks identical in a screenshot
// and is wrong in the ways only a keyboard, a screen reader, or a middle-click
// reveal — the same silent class as an unannounced error banner.

const linkProps = {
  page: 2,
  totalPages: 3,
  previousPath: "/blog",
  nextPath: "/blog/page/3",
  from: 11,
  to: 20,
  total: 25,
};

describe("Pagination", () => {
  it("renders nothing when everything fits on one page", () => {
    // A disabled prev/next pair on a four-post blog is UI announcing a
    // structure that isn't there.
    const { container } = render(
      <Pagination page={1} totalPages={1} from={1} to={4} total={4} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  describe("link mode", () => {
    it("renders real anchors carrying the given paths", () => {
      render(<Pagination {...linkProps} />);

      // getByRole("link") is the assertion: a <button> with an onClick would
      // fail here, which is the point.
      expect(screen.getByRole("link", { name: /newer/i })).toHaveAttribute("href", "/blog");
      expect(screen.getByRole("link", { name: /older/i })).toHaveAttribute(
        "href",
        "/blog/page/3",
      );
    });

    it("links back to /blog rather than /blog/page/1 from page 2", () => {
      // The whole module refuses to mint a second URL for page 1; the control
      // must not reintroduce one.
      render(<Pagination {...linkProps} />);

      expect(screen.getByRole("link", { name: /newer/i })).toHaveAttribute("href", "/blog");
    });

    it("omits the previous link on the first page", () => {
      render(<Pagination {...linkProps} page={1} previousPath={null} />);

      expect(screen.queryByRole("link", { name: /newer/i })).toBeNull();
      expect(screen.getByRole("link", { name: /older/i })).toBeInTheDocument();
    });

    it("omits the next link on the last page", () => {
      render(<Pagination {...linkProps} page={3} nextPath={null} />);

      expect(screen.queryByRole("link", { name: /older/i })).toBeNull();
      expect(screen.getByRole("link", { name: /newer/i })).toBeInTheDocument();
    });
  });

  describe("callback mode", () => {
    const callbackProps = { page: 2, totalPages: 3, from: 11, to: 20, total: 25 };

    it("renders buttons, not links, when there is no URL to point at", () => {
      render(<Pagination {...callbackProps} onPageChange={() => {}} />);

      expect(screen.getByRole("button", { name: /newer/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /older/i })).toBeInTheDocument();
      // A <Link href="#"> would put a fake URL in the status bar and in the
      // user's history.
      expect(screen.queryAllByRole("link")).toHaveLength(0);
    });

    it("reports the adjacent page number in each direction", async () => {
      const onPageChange = vi.fn();
      render(<Pagination {...callbackProps} onPageChange={onPageChange} />);

      await userEvent.click(screen.getByRole("button", { name: /older/i }));
      expect(onPageChange).toHaveBeenCalledWith(3);

      await userEvent.click(screen.getByRole("button", { name: /newer/i }));
      expect(onPageChange).toHaveBeenCalledWith(1);
    });

    it("derives the available directions from the page number alone", () => {
      // Callback consumers hold only a page number — requiring them to also
      // pass paths they have no use for is how the two modes drift.
      const { rerender } = render(
        <Pagination {...callbackProps} page={1} onPageChange={() => {}} />,
      );
      expect(screen.queryByRole("button", { name: /newer/i })).toBeNull();

      rerender(<Pagination {...callbackProps} page={3} onPageChange={() => {}} />);
      expect(screen.queryByRole("button", { name: /older/i })).toBeNull();
    });

    it("is reachable and operable by keyboard", async () => {
      const onPageChange = vi.fn();
      render(<Pagination {...callbackProps} onPageChange={onPageChange} />);

      await userEvent.tab();
      expect(screen.getByRole("button", { name: /newer/i })).toHaveFocus();

      await userEvent.keyboard("{Enter}");
      expect(onPageChange).toHaveBeenCalledWith(1);
    });
  });

  it("states the position, which is what makes prev/next a decision", () => {
    // Without it "Older posts" is a leap into the dark: the reader cannot tell
    // whether they are two posts from the end or forty.
    render(<Pagination {...linkProps} />);

    expect(screen.getByText(/Showing 11–20 of 25 posts/)).toBeInTheDocument();
    expect(screen.getByText(/Page 2 of 3/)).toBeInTheDocument();
  });

  it("takes the counted noun from `unit`", () => {
    render(<Pagination {...linkProps} unit="subscribers" />);

    expect(screen.getByText(/of 25 subscribers/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Older subscribers/ })).toBeInTheDocument();
  });

  it("names its landmark, so it is distinguishable from the site nav", () => {
    // A screen reader listing two undifferentiated "navigation" landmarks
    // makes the landmark list useless.
    render(<Pagination {...linkProps} />);

    expect(screen.getByRole("navigation", { name: "Pagination" })).toBeInTheDocument();
  });
});
