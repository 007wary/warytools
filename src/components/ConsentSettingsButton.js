"use client";

import { useSyncExternalStore } from "react";
import { colors } from "@/lib/theme";

// Reopens Google's consent message so a visitor can change a choice they have
// already made.
//
// WHY THIS EXISTS
//
// The CMP shows once and then stores the answer, which is the correct
// behaviour — but it leaves no way back. GDPR (Art. 7(3)) requires that
// withdrawing consent be as easy as giving it, and before this the only route
// documented on /privacy was "clear your browser's cookies and site data",
// which is technically true and practically not a control. Google's CMP
// exposes `googlefc.showRevocationMessage()` for exactly this purpose.
//
// WHY IT RENDERS CONDITIONALLY
//
// The consent message is only shown to EEA/UK/Swiss visitors, so `googlefc`
// only ever exists for them. A button that is always visible would do nothing
// at all for most of the world's visitors — a dead control is worse than an
// absent one, because it reads as a broken promise about a privacy right. So
// the button is absent until the CMP has actually loaded and offered the API.
//
// This mirrors the reasoning in ShareRow.js for `navigator.share`: a control
// that depends on a capability the browser may not have is rendered from the
// capability, not from a guess about the visitor.
//
// WHY IT POLLS RATHER THAN CHECKING ONCE
//
// adsbygoogle.js is `async` and the CMP initialises after it, so `googlefc` is
// reliably absent on mount and appears an unpredictable moment later. A single
// check on mount would therefore hide the button from precisely the visitors
// it exists for. The poll is bounded and stops as soon as the API appears, so
// the common case is a handful of cheap property reads.
//
// WHY useSyncExternalStore AND NOT useState + useEffect
//
// The obvious shape — poll in an effect, setState when it resolves — is a
// setState-in-effect, which React's lint rules reject and which renders the
// component twice on every load. This is instead exactly what
// useSyncExternalStore is for: `googlefc` is external mutable state, the
// subscribe function owns the polling, and getSnapshot is a pure read. The
// server snapshot is `false`, so the button is absent from prerendered HTML
// and appears on hydration with no mismatch — the same pattern ShareRow.js
// uses for `navigator.share`, and for the same reason.

// Long enough to cover a slow connection loading an async third-party script,
// short enough that it cannot run for the life of the page.
const POLL_INTERVAL_MS = 400;
const POLL_TIMEOUT_MS = 12000;

/** Whether Google's CMP has loaded and can reopen its message. */
function revocationAvailable() {
  return (
    typeof window !== "undefined" &&
    typeof window.googlefc?.showRevocationMessage === "function"
  );
}

/**
 * Polls for the CMP and notifies React when it appears.
 *
 * Stops on the first success, and gives up after the timeout — a visitor
 * outside the EEA/UK/Switzerland never gets a `googlefc`, so the poll must not
 * outlive its usefulness.
 */
function subscribeToCmp(onStoreChange) {
  if (revocationAvailable()) return () => {};

  const startedAt = Date.now();
  const timer = setInterval(() => {
    if (revocationAvailable()) {
      clearInterval(timer);
      onStoreChange();
    } else if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      clearInterval(timer);
    }
  }, POLL_INTERVAL_MS);

  return () => clearInterval(timer);
}

export default function ConsentSettingsButton() {
  const available = useSyncExternalStore(
    subscribeToCmp,
    revocationAvailable,
    // Never rendered on the server: there is no consent state to read there,
    // and claiming otherwise would mismatch on hydration.
    () => false
  );

  if (!available) return null;

  return (
    <button
      type="button"
      onClick={() => window.googlefc.showRevocationMessage()}
      style={{
        border: `1px solid ${colors.border}`,
        backgroundColor: colors.surface,
        color: colors.primary,
        borderRadius: "8px",
        padding: "10px 16px",
        fontSize: "15px",
        fontWeight: 500,
        cursor: "pointer",
        marginTop: "4px",
      }}
    >
      Change your consent choices
    </button>
  );
}
