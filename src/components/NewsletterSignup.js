"use client";

import { useCallback, useId, useState } from "react";
import { CheckCircle2, Mail } from "lucide-react";
import { checkSubscription, rejectionMessage } from "@/lib/newsletterValidation";
import { colors } from "@/lib/theme";
import { events, trackEvent } from "@/lib/analytics";
import ErrorBanner from "@/components/ErrorBanner";

// The subscribe form, used at the foot of the blog index and of every post.
//
// The validation here is the same module /api/newsletter/subscribe uses, so
// the message shown inline and the one returned by the server cannot disagree.
// The server's copy is the one that counts; this one just avoids a round trip
// for an obvious typo.
//
// One deliberate restraint: no modal, no scroll-triggered popup, no exit
// intent. Those convert better and they are the reason people install content
// blockers. This is a card at the end of something someone chose to read,
// which is the moment they can actually judge whether they want more of it.

export default function NewsletterSignup({
  title = "Get new guides by email",
  body = "A short email whenever a new tool or guide goes live. Usually once or twice a month. Unsubscribe in one click.",
}) {
  const [email, setEmail] = useState("");
  // The honeypot. Rendered but hidden from people; bots that fill every input
  // give themselves away. Never surfaced as an error — see
  // newsletterValidation.js.
  const [website, setWebsite] = useState("");

  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const baseId = useId();
  const emailId = `${baseId}-email`;

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      setError("");

      const result = checkSubscription({ email, website });
      if (!result.ok) {
        setError(rejectionMessage(result.reason));
        trackEvent(events.TOOL_ERROR, { reason: "invalid_newsletter_input" });
        return;
      }

      setIsSending(true);

      try {
        const res = await fetch("/api/newsletter/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...result.value, website }),
        });

        // A non-JSON body (a proxy error page) would otherwise throw here and
        // be reported as a network failure.
        let payload = {};
        try {
          payload = await res.json();
        } catch {
          // fall through to the status-based message below
        }

        if (!res.ok) {
          setError(payload.error || "Could not subscribe. Please try again.");
          trackEvent(events.TOOL_ERROR, {
            reason: "newsletter_api_error",
            status: res.status,
          });
          return;
        }

        setDone(true);
        // No address, no identifier — just that a subscription happened, in
        // keeping with the site-wide rule that analytics carries no user data.
        trackEvent(events.TOOL_RUN, { action: "newsletter_subscribed" });
      } catch {
        setError("Could not reach the server. Check your connection and try again.");
        trackEvent(events.TOOL_ERROR, { reason: "newsletter_network_error" });
      } finally {
        setIsSending(false);
      }
    },
    [email, website]
  );

  const cardStyle = {
    border: `1px solid ${colors.border}`,
    borderRadius: "16px",
    padding: "28px 24px",
    backgroundColor: colors.surfaceMuted,
  };

  if (done) {
    return (
      <div
        // Announced, not merely displayed: the form is replaced wholesale, and
        // without this a screen reader user gets no confirmation that anything
        // happened.
        role="status"
        style={{ ...cardStyle, textAlign: "center" }}
      >
        <CheckCircle2
          size={32}
          strokeWidth={1.7}
          color={colors.success}
          aria-hidden="true"
        />
        <p
          style={{
            margin: "12px 0 0",
            fontSize: "16px",
            fontWeight: 600,
            color: colors.text,
          }}
        >
          You&rsquo;re subscribed
        </p>
        <p
          style={{
            margin: "6px 0 0",
            fontSize: "14px",
            lineHeight: 1.6,
            color: colors.textSecondary,
          }}
        >
          {/* States that the subscription is already active — there is no
              confirmation step to complete, so implying one would send people
              looking for an email they don't need to act on. The welcome is
              mentioned because it's about to arrive and shouldn't surprise
              them. */}
          You&rsquo;ll get an email whenever a new guide or tool goes live.
          We&rsquo;ve sent a welcome message with a one-click unsubscribe link,
          in case you change your mind.
        </p>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: "6px" }}>
        <Mail size={18} strokeWidth={1.8} color={colors.primary} aria-hidden="true" />
        <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: colors.text }}>
          {title}
        </h2>
      </div>

      <p
        style={{
          margin: "0 0 16px",
          fontSize: "14px",
          lineHeight: 1.6,
          color: colors.textSecondary,
        }}
      >
        {body}
      </p>

      {error ? <ErrorBanner message={error} /> : null}

      <form onSubmit={handleSubmit} noValidate>
        {/* The honeypot. aria-hidden and tabIndex -1 keep it away from screen
            readers and the tab order, so it is invisible to people using
            assistive technology as well as to sighted ones. Positioned off
            screen rather than display:none, which some bots specifically
            check for. */}
        <div
          aria-hidden="true"
          style={{ position: "absolute", left: "-9999px", width: "1px", height: "1px", overflow: "hidden" }}
        >
          <label htmlFor={`${baseId}-website`}>Website</label>
          <input
            id={`${baseId}-website`}
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>

        <label htmlFor={emailId} style={{ position: "absolute", left: "-9999px" }}>
          Email address
        </label>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          <input
            id={emailId}
            // type="email" here rather than "text": unlike the calculators'
            // numeric fields, the email keyboard on mobile is a genuine win
            // and carries none of type="number"'s hazards.
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isSending}
            style={{
              // Grows to fill, but wraps to its own line below ~260px rather
              // than squeezing the button off the card.
              flex: "1 1 220px",
              minWidth: 0,
              padding: "11px 13px",
              fontSize: "15px",
              color: colors.text,
              backgroundColor: colors.surface,
              border: `1px solid ${colors.borderInput}`,
              borderRadius: "10px",
            }}
          />

          <button
            type="submit"
            disabled={isSending}
            style={{
              flex: "0 0 auto",
              padding: "11px 20px",
              fontSize: "15px",
              fontWeight: 600,
              color: colors.primaryContrast,
              backgroundColor: isSending ? colors.primaryDisabled : colors.primary,
              border: "none",
              borderRadius: "10px",
              cursor: isSending ? "default" : "pointer",
            }}
          >
            {isSending ? "Subscribing…" : "Subscribe"}
          </button>
        </div>
      </form>

      <p
        style={{
          margin: "12px 0 0",
          fontSize: "12.5px",
          lineHeight: 1.55,
          color: colors.textFaint,
        }}
      >
        {/* Stated up front, because it is the question a privacy-focused
            site's readers will actually have. */}
        We only email about new posts and tools. No ads, no sharing your
        address, and no account required.
      </p>
    </div>
  );
}
