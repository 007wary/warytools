import { describe, it, expect } from "vitest";
import { planObjectUrl } from "./useObjectUrl";

// The hook itself can't be rendered here — the suite runs without a DOM — so
// the decision that closes the leak is tested as the pure function it was
// split out into. What matters is that a URL created by a render which never
// committed is always reported for revocation: that render's cleanup effect
// never mounted, so this is the only code that can release it.

const fileA = { name: "a.jpg" };
const fileB = { name: "b.jpg" };

describe("planObjectUrl", () => {
  it("creates on the first render with a source", () => {
    expect(planObjectUrl(null, fileA)).toEqual({ action: "create", revoke: null });
  });

  it("keeps the existing URL while the source is unchanged", () => {
    const held = { source: fileA, url: "blob:a" };
    expect(planObjectUrl(held, fileA)).toEqual({ action: "keep", revoke: null });
  });

  // The leak this file exists to close. Reaching a new source with a URL still
  // held means the previous render created one and was then discarded, so
  // nothing else will ever revoke it.
  it("revokes the stranded URL of a discarded render before creating", () => {
    const held = { source: fileA, url: "blob:a" };
    expect(planObjectUrl(held, fileB)).toEqual({ action: "create", revoke: "blob:a" });
  });

  it("revokes and clears when the source goes away", () => {
    const held = { source: fileA, url: "blob:a" };
    expect(planObjectUrl(held, null)).toEqual({ action: "clear", revoke: "blob:a" });
  });

  it("clears without a revoke when there was nothing held", () => {
    expect(planObjectUrl(null, null)).toEqual({ action: "clear", revoke: null });
    expect(planObjectUrl(null, undefined)).toEqual({ action: "clear", revoke: null });
  });

  // Identity, not value. Two Files with identical metadata are different blobs
  // and need different URLs; matching on a derived key (name, size) would hand
  // the second one the first one's URL and show the wrong image.
  it("treats a distinct object with the same shape as a new source", () => {
    const held = { source: { name: "a.jpg" }, url: "blob:a" };
    expect(planObjectUrl(held, { name: "a.jpg" })).toEqual({
      action: "create",
      revoke: "blob:a",
    });
  });

  // Repeated churn must not accumulate: every step hands back the previous URL
  // for revocation, so at most one is outstanding at any time.
  it("never strands a URL across a run of source changes", () => {
    const sources = [fileA, fileB, fileA, fileB];
    let held = null;
    const created = [];
    const revoked = [];

    sources.forEach((source, i) => {
      const plan = planObjectUrl(held, source);
      if (plan.revoke) revoked.push(plan.revoke);
      if (plan.action === "create") {
        const url = `blob:${i}`;
        created.push(url);
        held = { source, url };
      }
    });

    // Every URL but the one still held has been revoked.
    expect(created).toHaveLength(4);
    expect(revoked).toEqual(created.slice(0, 3));
  });
});
