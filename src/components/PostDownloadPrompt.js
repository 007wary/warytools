"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  useSyncExternalStore,
} from "react";
import { colors } from "@/lib/theme";
import NewsletterSignup from "@/components/NewsletterSignup";

// The newsletter ask, shown after a tool has actually produced a file.
//
// This is the moment the homepage's card cannot reach: the person has picked
// a file, run a tool, and downloaded a result. They have had the value before
// being asked for anything, which is the same principle the blog's
// end-of-post card follows.
//
// It does not replace the homepage card — both exist, deliberately. Someone
// who arrives from a search result, uses one tool and leaves never scrolls
// the homepage and would never see that one; someone browsing the site to
// judge whether it is trustworthy may not convert a file at all. The two
// surfaces catch different visitors and cannot both appear on one screen,
// since this renders only on tool pages and that one only on the homepage.
//
// Split into a provider, a hook, and a card because of where the two halves
// have to live. <DownloadButton> is the only component that knows a download
// succeeded, but every one of them sits inside a `display: flex` row of
// buttons — so the card cannot render as its sibling without landing inside
// that row. The button signals through context; the card renders wherever the
// tool page puts it, after the whole panel.
//
// Three restraints, carried over from NewsletterSignup's own note:
//
//   - No modal, no overlay, no exit intent. It appears inline, below the
//     tool, and never covers the thing the user came for.
//   - It appears once per session, not once per download. Someone splitting
//     twelve PDFs should be asked once; asking on every file is the behaviour
//     that makes people install blockers.
//   - It is dismissible, and a dismissal sticks for the session.
//
// Session, not permanent: localStorage would mean a dismissal in January
// silences the ask forever, including for someone who later becomes a
// regular. sessionStorage forgets on tab close, which is the honest middle —
// asked at most once per visit.

const DISMISS_KEY = "wt-newsletter-prompt-dismissed";

// Dismissal is read through useSyncExternalStore rather than a mount effect,
// the same pattern (and for the same reason) as ConsentSettingsButton's
// googlefc poll and ShareRow's navigator.share check: a setState-in-effect is
// a cascading render the lint rules reject, while this gives one correct
// render. The server snapshot is `true` — "dismissed", i.e. hidden — so the
// prerendered HTML never contains the card and hydration cannot mismatch.
//
// Subscribing to the `storage` event is what keeps two tabs consistent:
// dismissing in one tab hides it in the other rather than leaving a stale
// card that reappears on the next download.
function subscribeToDismissal(onChange) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function getDismissed() {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    // Private-mode Safari and hardened browsers throw on access. Treating
    // that as "not dismissed" is right: the ask is the fallback, and the
    // worst case is being asked once more than intended.
    return false;
  }
}

const getServerDismissed = () => true;

const DownloadSignalContext = createContext(null);

/**
 * Returns a function a DownloadButton calls when a download actually fired.
 *
 * Falls back to a no-op when there is no provider, so <DownloadButton> stays
 * usable anywhere — including the eight tools that do not opt into the prompt
 * and any future caller outside a tool page. A missing provider is a
 * deliberate opt-out, not a bug, so this must not throw the way
 * ToolSearch's context did.
 */
export function useDownloadSignal() {
  const ctx = useContext(DownloadSignalContext);
  return ctx ?? noop;
}

const noop = () => {};

/**
 * Wraps a tool's interactive area and renders the prompt beneath it.
 *
 * Usage, in a tool's client component:
 *   <PostDownloadPrompt>
 *     …existing tool UI, including its DownloadButton…
 *   </PostDownloadPrompt>
 */
export default function PostDownloadPrompt({ children }) {
  const [downloaded, setDownloaded] = useState(false);

  const storedDismissal = useSyncExternalStore(
    subscribeToDismissal,
    getDismissed,
    getServerDismissed
  );

  // A same-tab dismissal does not fire the `storage` event (that only fires
  // in *other* tabs), so the local decision is held alongside the store and
  // either one hides the card.
  const [dismissedHere, setDismissedHere] = useState(false);

  // Stable identity: DownloadButton would otherwise get a new callback every
  // render, which is harmless today but is the kind of thing a future
  // useEffect dependency would trip over.
  const signalDownload = useCallback(() => setDownloaded(true), []);

  function handleDismiss() {
    setDismissedHere(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Nothing to do — the card is hidden for this render either way, and a
      // browser that refuses storage simply gets asked again next visit.
    }
  }

  const dismissed = storedDismissal || dismissedHere;

  return (
    <DownloadSignalContext.Provider value={signalDownload}>
      {children}
      {downloaded && !dismissed && (
        <div
          style={{
            marginTop: "28px",
            paddingTop: "24px",
            borderTop: `1px solid ${colors.border}`,
            position: "relative",
          }}
        >
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss newsletter invitation"
            style={{
              position: "absolute",
              top: "18px",
              right: "0",
              background: "none",
              border: "none",
              color: colors.textFaint,
              fontSize: "13px",
              cursor: "pointer",
              padding: "4px 8px",
            }}
          >
            Not now
          </button>

          <NewsletterSignup
            title="Get new tools by email"
            body="A short email when a new tool or guide ships — once or twice a month, unsubscribe in one click."
          />
        </div>
      )}
    </DownloadSignalContext.Provider>
  );
}
