"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { colors } from "@/lib/theme";
import { events, trackEvent } from "@/lib/analytics";

// The "install this app" card, bottom-right.
//
// No service worker is involved and none is needed: Chrome dropped the SW
// requirement for beforeinstallprompt, and a manifest with a valid start_url,
// display: standalone, name, and 192/512 raster icons is what makes a site
// installable. src/app/manifest.js already satisfies all of it — which is why
// the browser's own install affordance works today. This card just surfaces
// the same capability where people will actually notice it.
//
// The whole component is driven by the event rather than by a guess. If the
// browser never fires beforeinstallprompt — already installed, unsupported
// engine, criteria unmet, or the user previously dismissed the native banner
// — nothing renders. That matters more than it sounds: a hand-rolled "Install"
// button shown unconditionally is a button that does nothing on iOS Safari and
// on every already-installed session, and there is no way to feature-detect
// your way out of it after the fact.
//
// Placement and dismissal follow the same restraint as PostDownloadPrompt: no
// modal, no overlay, nothing that covers the tool the visitor came for. It is
// a corner card with an explicit close, and it never reappears in a session
// once dismissed.

const DISMISS_KEY = "wt-install-prompt-dismissed";

// "Don't show again" writes here instead. localStorage rather than
// sessionStorage precisely because the user asked for permanence — the
// distinction between the two buttons is the whole point of having both.
const NEVER_KEY = "wt-install-prompt-never";

// Delay before the card appears, in ms. The event can fire almost immediately
// on a repeat visit, and a card that animates in while someone is still
// reading the hero is the behaviour that gets these dismissed reflexively.
// Waiting a few seconds means it arrives after the page has settled.
const APPEAR_DELAY_MS = 4000;

function hasOptedOut() {
  try {
    return (
      localStorage.getItem(NEVER_KEY) === "1" ||
      sessionStorage.getItem(DISMISS_KEY) === "1"
    );
  } catch {
    // Private-mode Safari and hardened browsers throw on storage access.
    // Treating that as "not opted out" is the safe default here: the card is
    // dismissible either way, and the alternative silently disables a feature
    // for everyone with strict privacy settings.
    return false;
  }
}

export default function InstallPrompt() {
  // The deferred BeforeInstallPromptEvent. Held in state rather than a ref
  // because its arrival is what makes the card render.
  const [deferredEvent, setDeferredEvent] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (hasOptedOut()) return undefined;

    function handleBeforeInstallPrompt(event) {
      // Without this the browser shows its own mini-infobar and this card
      // would be a second, competing prompt for the same action.
      event.preventDefault();
      setDeferredEvent(event);
    }

    // Fired by the browser when the install completes through any route —
    // this card, the address-bar icon, or the OS. Clearing state here stops a
    // stale card sitting on screen offering to install something that already
    // is installed.
    function handleInstalled() {
      setDeferredEvent(null);
      setVisible(false);
      trackEvent(events.INSTALL_PROMPT, { action: "installed" });
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  // Separate effect so the delay timer is tied to the event's arrival rather
  // than to mount — on a repeat visit the event can fire well after the page
  // has loaded, and starting the countdown at mount would show the card the
  // instant it landed.
  useEffect(() => {
    if (!deferredEvent) return undefined;
    const timer = setTimeout(() => setVisible(true), APPEAR_DELAY_MS);
    return () => clearTimeout(timer);
  }, [deferredEvent]);

  const handleInstall = useCallback(async () => {
    if (!deferredEvent) return;

    // Hide first: prompt() resolves only after the user answers the native
    // dialog, and leaving our card behind it looks like the click missed.
    setVisible(false);
    trackEvent(events.INSTALL_PROMPT, { action: "accepted" });

    try {
      deferredEvent.prompt();
      await deferredEvent.userChoice;
    } catch {
      // prompt() throws if it has already been called on this event. Nothing
      // to recover — the event is single-use either way, and it is cleared
      // below so the card cannot come back offering a spent prompt.
    }

    setDeferredEvent(null);
  }, [deferredEvent]);

  const handleClose = useCallback(() => {
    setVisible(false);
    trackEvent(events.INSTALL_PROMPT, { action: "dismissed" });
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Hidden for this render regardless; a browser refusing storage simply
      // sees the card again next visit.
    }
  }, []);

  const handleNever = useCallback(() => {
    setVisible(false);
    trackEvent(events.INSTALL_PROMPT, { action: "opted_out" });
    try {
      localStorage.setItem(NEVER_KEY, "1");
    } catch {
      // As above. The button still does the visible thing it promises for
      // this session even when the preference cannot be persisted.
    }
  }, []);

  if (!visible || !deferredEvent) return null;

  return (
    <div
      // A dialog would demand focus and trap it, which is wrong for an
      // unsolicited suggestion: it would yank the caret out of whatever field
      // someone was filling. This is a complementary region instead, announced
      // politely and reachable by tab without stealing focus.
      role="complementary"
      aria-label="Install WaryTools"
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        zIndex: 60,
        width: "min(340px, calc(100vw - 40px))",
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: "14px",
        boxShadow: "0 12px 32px rgba(0, 0, 0, 0.18)",
        padding: "18px",
      }}
    >
      <button
        type="button"
        onClick={handleClose}
        aria-label="Close install prompt"
        style={{
          position: "absolute",
          top: "10px",
          right: "10px",
          background: "none",
          border: "none",
          color: colors.textFaint,
          cursor: "pointer",
          padding: "4px",
          display: "inline-flex",
          lineHeight: 0,
        }}
      >
        <X size={16} aria-hidden="true" />
      </button>

      <p
        style={{
          fontSize: "14px",
          color: colors.text,
          lineHeight: 1.55,
          // Right padding clears the close button so a long string cannot run
          // underneath it.
          margin: "0 24px 14px 0",
        }}
      >
        Install WaryTools for faster access and offline&nbsp;support.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        <button
          type="button"
          onClick={handleInstall}
          style={{
            backgroundColor: colors.primary,
            color: colors.primaryContrast,
            border: "none",
            borderRadius: "8px",
            padding: "9px 16px",
            fontSize: "13.5px",
            fontWeight: 600,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "7px",
          }}
        >
          <Download size={15} aria-hidden="true" />
          Install app
        </button>

        <button
          type="button"
          onClick={handleClose}
          style={{
            backgroundColor: "transparent",
            color: colors.textSecondary,
            border: `1px solid ${colors.border}`,
            borderRadius: "8px",
            padding: "9px 16px",
            fontSize: "13.5px",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Not now
        </button>
      </div>

      {/* Deliberately a quiet text link rather than a third equal-weight
          button. All three as buttons reads as a decision with three real
          options, when the honest hierarchy is one action, one deferral, and
          one rarely-wanted permanent opt-out. */}
      <button
        type="button"
        onClick={handleNever}
        style={{
          marginTop: "10px",
          background: "none",
          border: "none",
          padding: 0,
          color: colors.textFaint,
          fontSize: "12.5px",
          cursor: "pointer",
          textDecoration: "underline",
        }}
      >
        Don&rsquo;t show again
      </button>
    </div>
  );
}
