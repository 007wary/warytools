"use client";

import { useCallback, useId, useRef, useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import {
  MAX_MESSAGE_LENGTH,
  checkSubmission,
  rejectionMessage,
} from "@/lib/contactValidation";
import { colors } from "@/lib/theme";
import { events, trackEvent } from "@/lib/analytics";
import ErrorBanner from "@/components/ErrorBanner";

// Replaces the mailto: link that used to be this page's only contact route.
// That link published a personal address to every scraper, and it silently did
// nothing for the many visitors with no desktop mail client configured — on a
// phone browser or webmail, clicking it is a dead end.
//
// The validation here is the same module the API route uses, so the message
// shown inline and the message returned by the server can't disagree. The
// server's copy is the one that counts; this one just avoids a round trip.

const FIELD_LABEL = {
  fontSize: "13px",
  fontWeight: 600,
  color: colors.text,
  display: "block",
  marginBottom: "6px",
};

export default function ContactFormClient() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  // The honeypot. Rendered but hidden from people; bots that fill every input
  // give themselves away. Never shown as an error — see contactValidation.js.
  const [website, setWebsite] = useState("");

  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const formRef = useRef(null);
  // Stable ids for label/input association — useId rather than hardcoded
  // strings so the page stays valid if this form is ever rendered twice.
  const baseId = useId();
  const nameId = `${baseId}-name`;
  const emailId = `${baseId}-email`;
  const messageId = `${baseId}-message`;
  const countId = `${baseId}-count`;

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      setError("");

      const result = checkSubmission({ name, email, message, website });
      if (!result.ok) {
        setError(rejectionMessage(result.reason));
        trackEvent(events.TOOL_ERROR, { reason: "invalid_contact_input" });
        // Move focus to the first invalid control so a keyboard or screen
        // reader user lands on the problem rather than hunting for it.
        formRef.current?.querySelector("input, textarea")?.focus();
        return;
      }

      setIsSending(true);

      try {
        const res = await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...result.value, website }),
        });

        // A non-JSON body (a proxy error page) would otherwise throw here and
        // be reported as a network failure.
        let body = {};
        try {
          body = await res.json();
        } catch {
          // fall through to the status-based message below
        }

        if (!res.ok) {
          setError(body.error || "Could not send your message. Please try again.");
          trackEvent(events.TOOL_ERROR, { reason: "contact_api_error", status: res.status });
          return;
        }

        setSent(true);
        trackEvent(events.TOOL_RUN, { action: "contact_sent" });
      } catch {
        setError(
          "Could not reach the server. Check your connection and try again."
        );
        trackEvent(events.TOOL_ERROR, { reason: "contact_network_error" });
      } finally {
        setIsSending(false);
      }
    },
    [name, email, message, website]
  );

  if (sent) {
    return (
      <div
        // Announced, not just displayed — the form is replaced wholesale, and
        // without this a screen reader user gets no confirmation that anything
        // happened.
        role="status"
        style={{
          border: `1px solid ${colors.border}`,
          borderRadius: "16px",
          padding: "40px 32px",
          backgroundColor: colors.surfaceMuted,
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "12px",
            backgroundColor: colors.primarySoft,
            color: colors.primary,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
          }}
        >
          <CheckCircle2 size={22} />
        </div>
        <h2 style={{ fontSize: "17px", fontWeight: 600, color: colors.text, margin: "0 0 8px" }}>
          Message sent
        </h2>
        <p style={{ fontSize: "13.5px", color: colors.textMuted, margin: 0, lineHeight: 1.6 }}>
          Thanks for getting in touch. We read every message and usually reply within a couple
          of days.
        </p>
      </div>
    );
  }

  const remaining = MAX_MESSAGE_LENGTH - message.length;

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      noValidate
      style={{
        border: `1px solid ${colors.border}`,
        borderRadius: "16px",
        padding: "28px",
        backgroundColor: colors.surfaceMuted,
      }}
    >
      <div style={{ marginBottom: "18px" }}>
        <label htmlFor={nameId} style={FIELD_LABEL}>
          Your name
        </label>
        <input
          id={nameId}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          placeholder="Ada Lovelace"
          style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: "18px" }}>
        <label htmlFor={emailId} style={FIELD_LABEL}>
          Your email
        </label>
        <input
          id={emailId}
          // type="email" for the mobile keyboard, but the browser's own
          // validation is off (noValidate above): its bubble can't be styled,
          // isn't announced consistently, and would compete with our banner.
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="you@example.com"
          style={inputStyle}
        />
        <p style={{ fontSize: "12px", color: colors.textFaint, margin: "6px 0 0" }}>
          Only used to reply to you.
        </p>
      </div>

      <div style={{ marginBottom: "8px" }}>
        <label htmlFor={messageId} style={FIELD_LABEL}>
          Message
        </label>
        <textarea
          id={messageId}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          maxLength={MAX_MESSAGE_LENGTH}
          aria-describedby={countId}
          placeholder="What went wrong, what you expected, and which browser you were using."
          style={{ ...inputStyle, resize: "vertical", minHeight: "140px", fontFamily: "inherit" }}
        />
      </div>

      <p
        id={countId}
        // polite, not assertive: a counter that interrupts on every keystroke
        // makes the field unusable with a screen reader.
        aria-live="polite"
        style={{
          fontSize: "12px",
          color: remaining < 200 ? colors.danger : colors.textFaint,
          margin: "0 0 18px",
          textAlign: "right",
        }}
      >
        {remaining < 200 ? `${remaining} characters left` : ""}
      </p>

      {/* Honeypot. Hidden with an off-screen wrapper rather than display:none,
          which some bots specifically skip. aria-hidden and tabIndex keep it
          out of the way of real assistive tech and keyboard users. */}
      <div
        aria-hidden="true"
        style={{ position: "absolute", left: "-9999px", width: "1px", height: "1px", overflow: "hidden" }}
      >
        <label htmlFor={`${baseId}-website`}>Website (leave blank)</label>
        <input
          id={`${baseId}-website`}
          type="text"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <button
        type="submit"
        disabled={isSending}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          width: "100%",
          padding: "13px 20px",
          borderRadius: "10px",
          border: "none",
          backgroundColor: isSending ? colors.textFaint : colors.primary,
          color: "#fff",
          fontSize: "14.5px",
          fontWeight: 600,
          cursor: isSending ? "default" : "pointer",
        }}
      >
        <Send size={16} />
        {isSending ? "Sending…" : "Send message"}
      </button>

      <ErrorBanner>{error}</ErrorBanner>
    </form>
  );
}

const inputStyle = {
  width: "100%",
  padding: "11px 13px",
  borderRadius: "10px",
  border: `1px solid ${colors.border}`,
  backgroundColor: colors.surface,
  color: colors.text,
  fontSize: "14.5px",
  // 16px would avoid iOS's zoom-on-focus, but the site's field sizing is
  // consistent at 14.5px and the viewport meta allows zooming back out.
  boxSizing: "border-box",
};
