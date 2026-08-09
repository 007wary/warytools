"use client";

import { useEffect } from "react";
import { recordToolUsage } from "./toolUsage";

// Thin wrapper over gtag. Safe to call from anywhere, at any time: if
// analytics is disabled (no NEXT_PUBLIC_GA_ID), blocked by an ad blocker, or
// called during SSR, these become no-ops rather than throwing. Tool code can
// therefore fire events unconditionally without guarding every call site.

/**
 * Deliberately small event vocabulary. GA4 allows 50 custom event names per
 * property and 25 parameters per event, and a sprawling set of one-off names
 * produces reports nobody reads. Instead of an event per tool, we use four
 * lifecycle events and carry the tool identity in the `tool_slug` parameter —
 * that supports both per-tool breakdowns and a cross-tool funnel
 * (file_selected -> tool_run -> file_downloaded).
 */
export const events = {
  FILE_SELECTED: "file_selected",
  TOOL_RUN: "tool_run",
  FILE_DOWNLOADED: "file_downloaded",
  LINK_COPIED: "link_copied",
  NAV_CLICK: "nav_click",
  OUTBOUND_CLICK: "outbound_click",
  TOOL_ERROR: "tool_error",
};

/**
 * Queues a GA4 hit, whether or not gtag.js has finished loading.
 *
 * gtag.js is loaded with `lazyOnload` (see components/Analytics.js — it is
 * ~167 KB and was costing the mobile Lighthouse score outright), so there is a
 * real window early in a visit where `window.gtag` does not exist yet. Calling
 * it directly in that window silently drops the hit, which on a tool people
 * often use within a second or two of landing means losing exactly the events
 * worth having.
 *
 * dataLayer is an ordinary array that exists before the tag does, and gtag.js
 * replays everything it finds on load, so a queued hit arrives intact. The
 * `arguments` shape is what gtag's own shim pushes — a replayed hit is
 * indistinguishable from a live one. If the tag is blocked entirely this is
 * just an array append, which is the same no-op the old guard produced.
 */
export function pushHit(name, params) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  // A real `arguments` object, not an array: gtag.js inspects the pushed value
  // and an array literal is not replayed the same way. This is the exact shim
  // Google's own snippet installs.
  (function gtag() {
    window.dataLayer.push(arguments);
  })("event", name, params);
}

/**
 * Derives the tool slug from the current path so shared components
 * (FileDropzone, DownloadButton) can attribute events without every one of
 * the 15 tools having to thread a prop down. Leading slash stripped, so
 * "/pdf/merge" -> "pdf/merge" and "/" -> "home".
 */
export function currentToolSlug() {
  if (typeof window === "undefined") return "unknown";
  const path = window.location.pathname.replace(/^\/+|\/+$/g, "");
  return path || "home";
}

/**
 * Sends a GA4 event. `params` should hold only non-identifying values —
 * never file names or file contents, which would leak user data into
 * analytics and break the "nothing leaves your browser" promise the PDF and
 * image tools make. File *sizes* and *counts* are fine and genuinely useful.
 */
export function trackEvent(name, params = {}) {
  const slug = currentToolSlug();

  // Usage counting runs first and independently of GA entirely. GA is blocked
  // for a large share of visitors by ad blockers,
  // and that blocking is biased rather than random — ranking the homepage's
  // trending section on gtag data would systematically under-count exactly
  // the audiences most likely to block it. The Supabase counter is a
  // first-party RPC, so it reflects real usage. See lib/toolUsage.js.
  if (name === events.TOOL_RUN) {
    recordToolUsage(slug);
  }

  // Queued rather than gated on window.gtag existing. The old
  // `if (!isAnalyticsEnabled()) return` dropped every event fired before the
  // tag finished loading — a window that `lazyOnload` deliberately widens, and
  // one that covers a visitor who lands and immediately runs a tool.
  try {
    pushHit(name, { tool_slug: slug, ...params });
  } catch {
    // Analytics must never break a tool.
  }
}

/**
 * Fires a tool_run once a live-updating tool has settled.
 *
 * The calculators recompute on every keystroke, so tracking each render
 * would send dozens of events per calculation — burning GA quota and making
 * "how many times was this used" meaningless. Debouncing means one settled
 * calculation produces one event.
 *
 * `deps` should be the inputs that define a calculation; `active` guards
 * against firing for an empty/invalid form on first paint.
 */
export function useTrackedCalculation({ active, params, deps, delay = 1200 }) {
  useEffect(() => {
    if (!active) return undefined;
    const timer = setTimeout(() => trackEvent(events.TOOL_RUN, params), delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// Rounds to a coarse bucket so file sizes are useful in aggregate without
// being precise enough to help fingerprint an individual file.
export function sizeBucket(bytes) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return "unknown";
  const mb = bytes / (1024 * 1024);
  if (mb < 0.5) return "under_0.5mb";
  if (mb < 2) return "0.5_2mb";
  if (mb < 10) return "2_10mb";
  if (mb < 50) return "10_50mb";
  return "over_50mb";
}
