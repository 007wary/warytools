"use client";

import { useCallback, useRef } from "react";

// Client half of the converter warmup. See src/lib/converterWarmup.js for the
// reasoning; this file is only the trigger.
//
// Called when the user PICKS A FILE, not when the page loads. Warming on page
// load would boot a container for every visitor who reads the FAQ and leaves,
// which is exactly the always-on bill the scale-to-zero config exists to avoid.
// A file selection is a real statement of intent and buys the seconds the user
// spends checking the filename and reaching for Convert.

/**
 * Returns a `warm()` callback for one converter.
 *
 * The call is fire-and-forget by design: it never blocks the UI, never
 * surfaces an error, and never affects what the user sees. A failed warmup
 * costs nothing but the cold start we were trying to avoid.
 *
 * @param {string} key One of WARMUP_KEYS.
 */
export function useConverterWarmup(key) {
  // Once per mount. Re-selecting a file does not re-warm: the machine is
  // already booting from the first call, and repeat calls would spend the
  // warmup quota that exists to bound this.
  const warmedRef = useRef(false);

  return useCallback(() => {
    if (warmedRef.current) return;
    warmedRef.current = true;

    // keepalive so the request survives the user navigating away mid-boot —
    // without it, a fast click-through cancels the warmup it just requested.
    fetch("/api/converter-warmup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
      keepalive: true,
    }).catch(() => {
      // Deliberately silent. This is an optimisation, not a feature: a user
      // who sees an error about a request they never made is worse off than a
      // user who waits an extra twenty seconds.
    });
  }, [key]);
}
