"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Link2, RefreshCw, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { checkUrl, rejectionMessage, UrlRejection } from "@/lib/urlShortenerValidation";
import { colors } from "@/lib/theme";
import { copyText } from "@/lib/copyText";
import { events, trackEvent } from "@/lib/analytics";
import ErrorBanner from "@/components/ErrorBanner";

const STORAGE_KEY = "warytools_short_links";
const MAX_SAVED_LINKS = 5;

export default function UrlShortenerClient() {
  const [longUrl, setLongUrl] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Links created in this session, persisted to localStorage so a refresh
  // doesn't lose them (but this is still just local session history, not
  // a synced account — see the note in page.js). Read once via the lazy
  // initializer rather than in an effect, avoiding an extra render.
  const [links, setLinks] = useState(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : [];
      // localStorage is user-writable and survives across deploys, so treat
      // it as untrusted: a hand-edited or older-format entry shouldn't be
      // able to crash the list render.
      return Array.isArray(parsed)
        ? parsed
            .filter((l) => l && typeof l.shortCode === "string" && typeof l.longUrl === "string")
            .slice(0, MAX_SAVED_LINKS)
        : [];
    } catch {
      return [];
    }
  });
  const [copiedCode, setCopiedCode] = useState(null);
  const copyTimeout = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
    } catch {
      // Private mode or a full quota shouldn't break the tool — the links
      // are still in memory and on screen for this session.
    }
  }, [links]);

  // Clearing the "Copied!" label on a timer leaks the timeout if the
  // component unmounts first, which warns in React and fires setState on a
  // dead component.
  useEffect(() => () => clearTimeout(copyTimeout.current), []);

  // Live validation, but only once there's enough input to judge — showing
  // "that isn't a URL" while someone is still typing "h" is just noise.
  const inputProblem = useMemo(() => {
    if (longUrl.trim().length === 0) return "";
    const result = checkUrl(longUrl, window.location.origin);
    if (result.ok) return "";
    // These two only mean "not finished typing yet".
    if (result.reason === UrlRejection.MALFORMED || result.reason === UrlRejection.EMPTY) return "";
    return rejectionMessage(result.reason);
  }, [longUrl]);

  const handleShorten = useCallback(async () => {
    setError("");
    setStatus("");

    const result = checkUrl(longUrl, window.location.origin);
    if (!result.ok) {
      setError(rejectionMessage(result.reason));
      trackEvent(events.TOOL_ERROR, { reason: "invalid_url" });
      inputRef.current?.focus();
      return;
    }

    setIsWorking(true);

    try {
      const res = await fetch("/api/shorten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: result.url }),
      });

      // A non-JSON body (proxy error page, rate-limit HTML) would otherwise
      // throw here and be reported as a network error.
      let body = {};
      try {
        body = await res.json();
      } catch {
        // fall through to the status-based message below
      }

      if (!res.ok) {
        setError(body.error || "Could not shorten this URL. Please try again.");
        trackEvent(events.TOOL_ERROR, { reason: "api_error", status: res.status });
        return;
      }

      setLinks((prev) =>
        [
          {
            shortCode: body.shortCode,
            longUrl: body.longUrl,
            clicks: 0,
            createdAt: body.createdAt || new Date().toISOString(),
          },
          // Drop any previous entry for the same code so a repeat never
          // produces two rows with the same React key.
          ...prev.filter((l) => l.shortCode !== body.shortCode),
        ].slice(0, MAX_SAVED_LINKS)
      );
      setLongUrl("");
      setStatus("Short link created.");
      // The shortened URL itself is deliberately not sent — it's user
      // content, and the useful signal is just that a link was created.
      trackEvent(events.TOOL_RUN);
    } catch (err) {
      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "network_error" });
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setIsWorking(false);
    }
  }, [longUrl]);

  async function refreshClickCounts() {
    if (links.length === 0 || isRefreshing) return;

    setIsRefreshing(true);
    setError("");

    try {
      const codes = links.map((l) => l.shortCode);
      // Goes through an RPC rather than a table select: anon has no SELECT on
      // short_urls, because `.in(...)` over a readable table also permits an
      // unfiltered scan of everyone else's links. This returns only the codes
      // the caller already holds.
      const { data, error: fetchError } = await supabase.rpc("get_short_url_clicks", {
        p_short_codes: codes,
      });

      if (fetchError) {
        console.error(fetchError);
        setError("Could not refresh click counts. Please try again.");
        return;
      }

      // An RPC can resolve with a null body and no error (empty result, or a
      // function returning void after a signature change) — indexing straight
      // into it would throw inside the handler and leave the button spinning.
      const clicksByCode = Object.fromEntries(
        (Array.isArray(data) ? data : []).map((row) => [row.short_code, row.clicks])
      );
      setLinks((prev) =>
        prev.map((l) => ({ ...l, clicks: clicksByCode[l.shortCode] ?? l.clicks }))
      );
      setStatus("Click counts updated.");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleCopy(shortCode) {
    const shortUrl = `${window.location.origin}/s/${shortCode}`;

    try {
      await copyText(shortUrl);
      setCopiedCode(shortCode);
      clearTimeout(copyTimeout.current);
      copyTimeout.current = setTimeout(() => setCopiedCode(null), 2000);
      // Copying is the real completion signal for this tool — a shortened
      // link nobody copies never actually got used.
      trackEvent(events.LINK_COPIED);
    } catch (err) {
      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "copy_failed" });
      setError("Could not copy the link. Please copy it manually.");
    }
  }

  function handleForget(shortCode) {
    setLinks((prev) => prev.filter((l) => l.shortCode !== shortCode));
    // Worth being explicit that this is local-only — the link itself keeps
    // working, which is not what "remove" usually implies.
    setStatus("Removed from this list. The short link still works.");
  }

  return (
    <div>
      <label htmlFor="long-url" style={labelStyle}>
        Long URL
      </label>
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <input
          id="long-url"
          ref={inputRef}
          // type="url" adds native validation that fights our own messages
          // and rejects some things we accept; we validate explicitly.
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={longUrl}
          onChange={(e) => setLongUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !isWorking) handleShorten();
          }}
          placeholder="https://example.com/a-very-long-url"
          aria-describedby={inputProblem ? "long-url-problem" : undefined}
          aria-invalid={inputProblem ? true : undefined}
          style={{
            ...inputStyle,
            borderColor: inputProblem ? colors.danger : colors.borderInput,
          }}
        />
        <button
          onClick={handleShorten}
          disabled={isWorking || longUrl.trim().length === 0}
          style={{
            backgroundColor:
              isWorking || longUrl.trim().length === 0 ? colors.primaryDisabled : colors.primary,
            color: colors.primaryContrast,
            border: "none",
            borderRadius: "8px",
            padding: "12px 20px",
            fontSize: "14px",
            fontWeight: 600,
            cursor: isWorking || longUrl.trim().length === 0 ? "not-allowed" : "pointer",
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <Link2 size={16} />
          {isWorking ? "Shortening…" : "Shorten"}
        </button>
      </div>

      {inputProblem && (
        <p id="long-url-problem" style={{ fontSize: "13px", color: colors.danger, marginTop: "8px" }}>
          {inputProblem}
        </p>
      )}

      <ErrorBanner>{error}</ErrorBanner>

      {/* Announces success to a screen reader, which otherwise gets no
          signal that anything happened beyond a new list item appearing. */}
      <p aria-live="polite" style={visuallyHidden}>
        {status}
      </p>

      {links.length > 0 && (
        <div style={{ marginTop: "28px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "12px",
              flexWrap: "wrap",
              gap: "8px",
            }}
          >
            <h2 style={{ fontSize: "16px", fontWeight: 600, color: colors.text }}>
              Links from this session
            </h2>
            <button
              onClick={refreshClickCounts}
              disabled={isRefreshing}
              style={{
                ...smallButtonStyle,
                cursor: isRefreshing ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <RefreshCw size={14} />
              {isRefreshing ? "Refreshing…" : "Refresh click counts"}
            </button>
          </div>

          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {links.map((link) => (
              <li
                key={link.shortCode}
                style={{
                  border: `1px solid ${colors.border}`,
                  borderRadius: "10px",
                  padding: "14px 16px",
                  marginBottom: "10px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 0, flex: "1 1 240px" }}>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: colors.primary }}>
                      /s/{link.shortCode}
                    </div>
                    <div
                      title={link.longUrl}
                      style={{
                        fontSize: "13px",
                        color: colors.textMuted,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: "100%",
                      }}
                    >
                      {link.longUrl}
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ fontSize: "13px", color: colors.textFaint }}>
                      {link.clicks} click{link.clicks === 1 ? "" : "s"}
                    </span>
                    <a
                      href={`/s/${link.shortCode}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ ...iconButtonStyle, textDecoration: "none" }}
                    >
                      <ExternalLink size={14} />
                      Open
                    </a>
                    <button
                      onClick={() => handleCopy(link.shortCode)}
                      style={iconButtonStyle}
                      aria-label={`Copy short link for ${link.longUrl}`}
                    >
                      {copiedCode === link.shortCode ? <Check size={14} /> : <Copy size={14} />}
                      {copiedCode === link.shortCode ? "Copied!" : "Copy"}
                    </button>
                    <button
                      onClick={() => handleForget(link.shortCode)}
                      style={iconButtonStyle}
                      aria-label={`Remove ${link.shortCode} from this list`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const labelStyle = {
  display: "block",
  fontSize: "13px",
  fontWeight: 600,
  color: colors.textSecondary,
  marginBottom: "6px",
};

const inputStyle = {
  flex: "1 1 260px",
  minWidth: 0,
  width: "100%",
  padding: "12px 14px",
  // 16px keeps iOS Safari from zooming in when the field is focused.
  fontSize: "16px",
  border: `1px solid ${colors.borderInput}`,
  borderRadius: "8px",
  color: colors.textSecondary,
};

const smallButtonStyle = {
  background: "none",
  border: `1px solid ${colors.border}`,
  borderRadius: "6px",
  padding: "8px 14px",
  fontSize: "13px",
  color: colors.textSecondary,
  cursor: "pointer",
};

const iconButtonStyle = {
  ...smallButtonStyle,
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  padding: "8px 12px",
};

const visuallyHidden = {
  position: "absolute",
  width: "1px",
  height: "1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
  padding: 0,
  margin: -1,
};
