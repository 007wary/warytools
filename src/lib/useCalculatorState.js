"use client";

import { useCallback, useEffect, useState } from "react";
import { decodeState, writeStateToUrl, shareableUrl } from "./calculatorUrlState";

// Calculator state is a flat map of strings, so a shallow compare is exact.
function shallowEqual(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

/**
 * Holds a calculator's inputs and keeps them mirrored in the query string.
 *
 * These pages are statically prerendered, and the prerendered HTML is byte-for-
 * byte identical whether or not the request carried query parameters (verified:
 * /calculators/gst and /calculators/gst?amount=4999 serve the same document).
 * So the URL must NOT be read during the hydration render either — a lazy
 * useState initialiser looks like it solves this but still runs during that
 * render, and restoring `amount=4999` there is exactly the mismatch the server
 * markup cannot account for.
 *
 * Restoration is therefore deliberately deferred one commit: render `defaults`
 * (matching the server), then swap in the URL state from an effect. That effect
 * *is* a setState-in-effect, which is the correct tool here — it synchronises
 * React with an external system (the address bar) that React cannot see during
 * render. The lint rule is suppressed with that reasoning rather than worked
 * around, because every alternative reintroduces the mismatch.
 *
 * The visible cost is one frame: a shared link paints empty before filling in.
 * That is the right trade against a hydration error, and it is invisible in
 * practice because the effect runs before the browser paints.
 *
 * `schema` and `defaults` are expected to be module-level constants — they are
 * read during render and on every state change, so an object literal created
 * inside a component body would be a new value on every render.
 *
 * @param schema  see decodeState — the allowed shape of each key
 * @param defaults the pristine state
 */
export function useCalculatorState(schema, defaults) {
  const [state, setState] = useState(defaults);
  // Doubles as the "we are on the client, past hydration" flag, since it flips
  // in the same commit that the restore effect runs.
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    const fromUrl = decodeState(window.location.search, schema, defaults);
    // Skip the state commit when the URL carried nothing, which is the common
    // case — no point re-rendering a calculator opened without a link.
    //
    // set-state-in-effect is suppressed deliberately: this effect's whole job
    // is to pull state in from an external system (the address bar) that React
    // cannot observe during render, and every alternative — a lazy useState
    // initialiser, useSyncExternalStore over location — reads the URL during
    // the hydration render and mismatches the static HTML. See the note above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((previous) => (shallowEqual(previous, fromUrl) ? previous : fromUrl));
    setRestored(true);
    // Runs once: the URL is an entry point, not a continuously observed input.
    // Re-reading it on every change would fight the mirror effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror state back into the URL — but strictly after the restore above has
  // run. Gating on `mounted` alone is not enough: both effects fire on the same
  // commit, and this one would then write `defaults` over a shared link's
  // parameters before they had been read, silently emptying the calculator the
  // link was supposed to fill in.
  useEffect(() => {
    if (!restored) return;
    writeStateToUrl(state, defaults);
  }, [state, restored, defaults]);

  const setField = useCallback((key, value) => {
    setState((previous) => ({ ...previous, [key]: value }));
  }, []);

  const reset = useCallback(() => {
    setState(defaults);
  }, [defaults]);

  // Empty until restored, so the copy-link button never offers a URL built
  // from server-side defaults rather than what is actually on screen — and so
  // this value is identical on the server and in the hydration render.
  const shareUrl = restored ? shareableUrl(state, defaults) : "";

  return { state, setField, setState, reset, shareUrl, hydrated: restored };
}
