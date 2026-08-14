"use client";

import { useEffect, useRef } from "react";
import { detectCurrency, DEFAULT_CURRENCY } from "./calculatorCurrency";

/**
 * Applies the browser's implied currency once, after hydration.
 *
 * The whole difficulty here is ordering, and it mirrors the problem
 * useCalculatorState.js solves for URL state. Three constraints meet:
 *
 *   1. **Detection cannot run during render.** These pages are statically
 *      prerendered and serve byte-identical HTML to everyone, so reading
 *      `navigator` during the hydration render — including from a lazy
 *      useState initialiser — is a hydration mismatch. It has to be an effect.
 *
 *   2. **A shared link must win.** If someone opens `?currency=USD`, that is an
 *      explicit choice by the person who built the link and must not be
 *      overwritten by the recipient's browser locale. `useCalculatorState`
 *      restores URL state in its own effect on the same commit, so this hook
 *      cannot simply check "is the value still the default?" — it might be
 *      reading the value from before that restore landed.
 *
 *      So the URL is consulted directly rather than inferred from state. That
 *      is the one reliable signal available synchronously, and it is the same
 *      source `decodeState` reads.
 *
 *   3. **A user's own pick must stick.** Detection runs exactly once, guarded
 *      by a ref rather than by comparing against the default — otherwise
 *      someone in Germany who deliberately selects INR would have it reverted
 *      on the next render that re-ran the effect.
 *
 * Runs on mount only, by design: the browser's locale is an entry-point signal,
 * not something to keep observing.
 *
 * @param setCurrency called with the detected code when one is found. Read
 *                    through a ref, so an inline arrow function is fine and
 *                    the caller need not memoise it.
 * @param paramName   the query parameter carrying an explicit choice
 */
export function useDetectedCurrency(setCurrency, paramName = "currency") {
  const applied = useRef(false);
  // The setter is held in a ref so callers can pass an inline closure without
  // this effect re-running — but the ref is written from an effect, never
  // during render. Writing it during render is what the react-hooks/refs rule
  // forbids, and correctly: it makes the value depend on render timing.
  const setCurrencyRef = useRef(setCurrency);
  useEffect(() => {
    setCurrencyRef.current = setCurrency;
  });

  useEffect(() => {
    if (applied.current) return;
    applied.current = true;

    // An explicit choice in the URL outranks the browser's locale. Checked
    // against the URL rather than against state, per constraint 2 above.
    const params = new URLSearchParams(window.location.search);
    if (params.has(paramName)) return;

    const detected = detectCurrency();
    // No confident guess, or the guess is already what is rendered — in either
    // case leave the default alone rather than forcing a pointless re-render
    // on first paint.
    if (!detected || detected === DEFAULT_CURRENCY) return;

    setCurrencyRef.current(detected);
  }, [paramName]);
}
