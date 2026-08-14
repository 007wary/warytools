import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminClient from "./AdminClient";

// Covers the dashboard's post list paging only. The send flow's guards live
// server side and are tested there; what cannot be tested there is that the
// operator can still find the post they came to send once the archive is long
// enough to need paging — and that paging never leaves an armed, irreversible
// send confirmation attached to a row that has scrolled out of existence.

const posts = (count) =>
  Array.from({ length: count }, (_, i) => ({
    slug: `post-${count - i}`,
    title: `Post ${count - i}`,
    date: new Date(Date.UTC(2026, 0, count - i)).toISOString(),
    category: "guide",
    sent: false,
    sentAt: null,
    sentTo: null,
  }));

function mockStatus(list) {
  return vi.fn(async (url) => ({
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      subscribers: 42,
      dailyCap: 100,
      sentToday: 0,
      remainingToday: 100,
      posts: list,
    }),
  }));
}

beforeEach(() => {
  vi.stubGlobal("fetch", mockStatus(posts(25)));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Post titles render as styled <p>, not headings — the dashboard has one
// <h2> for the section and the rows are a list of cards under it.
const row = (title) => screen.queryByText(title);

describe("AdminClient post list", () => {
  it("shows ten posts a page and the rest behind the control", async () => {
    render(<AdminClient />);

    await waitFor(() => expect(row("Post 25")).toBeInTheDocument());

    expect(row("Post 16")).toBeInTheDocument();
    // The eleventh newest post is on page 2.
    expect(row("Post 15")).toBeNull();
    expect(screen.getByText(/Showing 1–10 of 25 posts/)).toBeInTheDocument();
  });

  it("pages through the whole archive without losing a post", async () => {
    render(<AdminClient />);
    await waitFor(() => expect(row("Post 25")).toBeInTheDocument());

    const seen = new Set();
    const collect = () => {
      for (let n = 1; n <= 25; n += 1) {
        if (row(`Post ${n}`)) seen.add(`Post ${n}`);
      }
    };

    collect();
    await userEvent.click(screen.getByRole("button", { name: /older/i }));
    collect();
    await userEvent.click(screen.getByRole("button", { name: /older/i }));
    collect();

    expect(seen.size).toBe(25);
    expect(screen.getByText(/Showing 21–25 of 25 posts/)).toBeInTheDocument();
    // Last page: nothing older to go to.
    expect(screen.queryByRole("button", { name: /older/i })).toBeNull();
  });

  it("hides the control entirely when every post fits on one page", async () => {
    vi.stubGlobal("fetch", mockStatus(posts(4)));
    render(<AdminClient />);

    await waitFor(() => expect(row("Post 4")).toBeInTheDocument());
    expect(screen.queryByRole("navigation", { name: "Pagination" })).toBeNull();
  });

  it("falls back to page 1 rather than stranding the operator on an empty page", async () => {
    // The list is refetched after every send and a post can leave it. Holding
    // page 3 while the list shrinks to one page would render an empty list
    // under "Page 3 of 1" — which reads as "the posts are gone" on the one
    // page whose job is saying what has and hasn't been sent.
    render(<AdminClient />);
    await waitFor(() => expect(row("Post 25")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /older/i }));
    await userEvent.click(screen.getByRole("button", { name: /older/i }));
    expect(screen.getByText(/Page 3 of 3/)).toBeInTheDocument();

    // The archive shrinks under the held page.
    vi.stubGlobal("fetch", mockStatus(posts(4)));
    await userEvent.click(screen.getByRole("button", { name: /refresh/i }));

    await waitFor(() => expect(row("Post 4")).toBeInTheDocument());
    expect(screen.queryByText(/Page 3 of/)).toBeNull();
  });
});
