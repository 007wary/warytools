"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, Link2, Share2 } from "lucide-react";
import { copyText } from "@/lib/copyText";
import { nativeSharePayload, shareTargets } from "@/lib/shareLinks";
import { events, trackEvent } from "@/lib/analytics";
import { colors } from "@/lib/theme";

// Share row at the foot of a blog post: four named targets, a copy-link
// button, and a More button that opens the device's native share sheet.
//
// A client component out of necessity, not preference — it needs the
// clipboard, navigator.share, and a post-mount capability check. The URL is
// passed in as an absolute string from the server rather than read from
// window.location, so the markup is identical on both sides of hydration and
// the buttons work before any JS-dependent state settles.

// Brand marks are inline SVGs because lucide-react ships NONE — the icon set
// removed every brand glyph, so `Facebook`, `Linkedin` and the old Twitter
// bird are all undefined imports rather than icons. That fails loudly at
// build, but the near miss is worth recording: `ToolIcon` resolves unknown
// names through a `|| FileText` fallback, so had these gone through that path
// instead they would have rendered a document glyph on every share button
// with nothing throwing.
//
// Each path below is the official mark, drawn on a 24x24 viewBox and filled
// with `currentColor` so one `color` on the button drives icon and label
// together. They are monochrome silhouettes, which is what every brand's
// guidelines permit for a share affordance at this size — full-colour logos
// would also fight the neutral button row.
const BRAND_PATHS = {
  whatsapp:
    "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 0 1 6.988 2.896 9.83 9.83 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.8 11.8 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.9 11.9 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.82 11.82 0 0 0 20.464 3.488",
  x: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  linkedin:
    "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065m1.782 13.019H3.555V9h3.564zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0z",
  facebook:
    "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073",
};

function BrandIcon({ id, size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={BRAND_PATHS[id]} />
    </svg>
  );
}

// Module scope, so the reference is stable across renders — an inline arrow
// would be a new subscribe function every render, which makes
// useSyncExternalStore tear down and re-subscribe each time.
const subscribeToNothing = () => () => {};

const buttonStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "7px",
  padding: "9px 14px",
  borderRadius: "999px",
  border: `1px solid ${colors.border}`,
  backgroundColor: colors.surface,
  color: colors.textSecondary,
  fontSize: "13.5px",
  fontWeight: 500,
  textDecoration: "none",
  cursor: "pointer",
  // Buttons and anchors disagree on inherited font by default, so the row
  // would render in two different faces without this.
  fontFamily: "inherit",
  lineHeight: 1.4,
};

export default function ShareRow({ url, title, description, slug }) {
  const [copied, setCopied] = useState(false);

  // Whether the device has a native share sheet, read via
  // useSyncExternalStore rather than a mount effect.
  //
  // This hook exists precisely for "read a value that differs between server
  // and client": it takes a separate server snapshot, so React renders `false`
  // during prerender and re-reads on the client with no hydration mismatch and
  // no setState-in-effect. `subscribe` is a no-op returning an empty cleanup
  // because the capability cannot change for the life of the page — there is
  // nothing to subscribe to, and the hook still handles the SSR split.
  //
  // The button is therefore absent from the prerendered HTML and appears on
  // hydration, which is why it sits at the END of the row: appearing mid-row
  // would shift every button after it.
  const canNativeShare = useSyncExternalStore(
    subscribeToNothing,
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => false,
  );

  // Clears the "Copied" confirmation. Tied to `copied` rather than set inside
  // the handler so a second click restarts the timer instead of stacking a
  // second one that fires early and clears a fresh confirmation.
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const targets = shareTargets({ url, title });

  async function handleCopy() {
    try {
      await copyText(url);
      setCopied(true);
      trackEvent(events.LINK_COPIED, { tool_slug: `blog:${slug}` });
    } catch {
      // A rejected clipboard write (denied permission, insecure origin with
      // execCommand also unavailable) must not leave a "Copied" confirmation
      // that lies. Staying silent is right here: the URL is in the address
      // bar, so the user has a trivial manual path and an error banner on a
      // share button would be disproportionate.
      setCopied(false);
    }
  }

  async function handleNativeShare() {
    try {
      await navigator.share(nativeSharePayload({ url, title, description }));
      trackEvent(events.OUTBOUND_CLICK, { tool_slug: `blog:${slug}`, link_url: "native-share" });
    } catch {
      // Dismissing the share sheet rejects with AbortError. That is the user
      // choosing not to share, not a failure, and it is indistinguishable
      // enough from a real error that treating either as one would be wrong.
    }
  }

  return (
    <section
      style={{ marginTop: "48px", paddingTop: "28px", borderTop: `1px solid ${colors.border}` }}
    >
      <h2 style={{ fontSize: "15px", fontWeight: 600, color: colors.text, margin: "0 0 14px" }}>
        Share this article
      </h2>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "9px" }}>
        {targets.map((target) => (
          <a
            key={target.id}
            href={target.href}
            target="_blank"
            // noopener is the load-bearing half: without it the opened tab
            // gets a window.opener handle back to this page and can navigate
            // it elsewhere. noreferrer additionally withholds the referrer.
            rel="noopener noreferrer"
            style={buttonStyle}
            onClick={() =>
              trackEvent(events.OUTBOUND_CLICK, {
                tool_slug: `blog:${slug}`,
                link_url: target.id,
              })
            }
          >
            <BrandIcon id={target.id} />
            {/* The visible label is the accessible name, so no aria-label is
                needed — and adding one would override the text a voice-control
                user actually says. */}
            {target.label}
          </a>
        ))}

        <button type="button" onClick={handleCopy} style={buttonStyle}>
          {copied ? (
            <Check size={17} aria-hidden="true" style={{ color: colors.success }} />
          ) : (
            <Link2 size={17} aria-hidden="true" />
          )}
          {copied ? "Copied" : "Copy link"}
        </button>

        {/* An aria-live region, so the confirmation is announced rather than
            only shown. Swapping the button's own text is invisible to a
            screen reader, which does not re-read a control it is not focused
            on. */}
        <span aria-live="polite" className="sr-only">
          {copied ? "Link copied to clipboard" : ""}
        </span>

        {canNativeShare && (
          <button type="button" onClick={handleNativeShare} style={buttonStyle}>
            <Share2 size={17} aria-hidden="true" />
            More
          </button>
        )}
      </div>
    </section>
  );
}
