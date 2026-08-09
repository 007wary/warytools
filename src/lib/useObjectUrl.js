"use client";

import { useEffect, useState } from "react";

// One object URL, created and revoked in step with a Blob or File.
//
// Every image and PDF tool that shows a thumbnail needs this, and they all
// reached for the same shape:
//
//   const url = useMemo(() => URL.createObjectURL(file), [file]);
//   useEffect(() => () => URL.revokeObjectURL(url), [url]);
//
// which leaks. useMemo is explicitly not a semantic guarantee — React may
// discard a cached value and recompute it — and any render thrown away before
// commit (a concurrent interrupt, a Suspense fallback, StrictMode's dev double
// invoke) creates a URL whose cleanup effect never mounts. Nothing revokes it,
// so the blob is pinned for the lifetime of the tab. That is precisely the leak
// the project's "revoke on unmount AND on re-select" rule exists to prevent,
// and the memo form quietly reintroduces it one render at a time.
//
// The URL is created during render, so it is available on the very first paint
// — no placeholder frame, which is what the useMemo form got right and worth
// keeping. What makes it safe is the ref: it records the URL that was actually
// created, and the effect below both adopts it and revokes any URL from a
// render that never committed. A discarded render therefore leaves at most one
// stray URL, which the next commit releases, rather than one per discard with
// nothing to release them.
//
// Returns null only while `source` is nullish, so callers guard on that.
//
// @param {Blob|File|null|undefined} source
// @returns {string|null}

/**
 * Decides what a render should do with the URL held from the previous one.
 *
 * Split out as a pure function because it is the whole correctness argument of
 * this file and the test suite runs without a DOM, so a hook cannot be rendered
 * here. It takes the retained `{source, url}` and the incoming source and
 * reports whether to keep, create, or revoke-then-create — which is exactly the
 * decision that closes the leak.
 *
 * @param {{source: object, url: string}|null} held
 * @param {object|null|undefined} source
 * @returns {{action: "clear"|"keep"|"create", revoke: string|null}}
 */
export function planObjectUrl(held, source) {
  if (!source) return { action: "clear", revoke: held?.url ?? null };
  if (held?.source === source) return { action: "keep", revoke: null };

  // A URL already held for a *different* source means the render that created
  // it never committed — React discarded it, so its cleanup effect never
  // mounted and nothing else will ever release it. Revoking here is the only
  // thing standing between that and a blob pinned for the tab's lifetime,
  // which is the leak the plain useMemo form has no way to close.
  return { action: "create", revoke: held?.url ?? null };
}

export function useObjectUrl(source) {
  // Held as state, not a ref, so the value is legitimately readable during
  // render — React's "adjusting state when a prop changes" pattern. A ref would
  // work identically at runtime but reading `.current` during render is exactly
  // what the refs lint rule forbids, and it is right to: this value decides
  // what gets painted, which makes it state by definition.
  const [held, setHeld] = useState(null);

  const plan = planObjectUrl(held, source);

  // `current` is what this pass paints. On a create/clear it is the freshly
  // built value rather than `held`, which the setHeld below has made stale —
  // hooks must run unconditionally, so this cannot early-return.
  let current = held;

  if (plan.action !== "keep") {
    // A URL revoked here may be revoked a second time by the effect cleanup
    // below when the same render both replaces the source and unmounts the old
    // effect. revokeObjectURL on an already-revoked URL is specified as a
    // no-op, so the duplicate is harmless — and preferable to tracking which of
    // the two paths "owns" each URL, since guessing wrong there strands one.
    if (plan.revoke) URL.revokeObjectURL(plan.revoke);

    current = plan.action === "create" ? { source, url: URL.createObjectURL(source) } : null;

    // Setting state during render (rather than in an effect) is what keeps the
    // URL available for the first paint. React discards the in-progress render
    // and immediately re-runs this function with the new state before the
    // browser paints, so there is no placeholder frame and no cascading commit.
    setHeld(current);
  }

  const url = current?.url ?? null;

  // Revokes on unmount and whenever the source changes. No setState here: the
  // render that changed `source` has already produced the replacement URL
  // above, so there is nothing to notify anyone about — which also keeps this
  // clear of the cascading-render trap that comes with creating in an effect.
  useEffect(() => {
    if (!url) return undefined;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  return url;
}
