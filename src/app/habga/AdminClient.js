"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Lock, Mail, RefreshCw, Send, Users } from "lucide-react";
import { colors } from "@/lib/theme";
import ErrorBanner from "@/components/ErrorBanner";

// The newsletter dashboard.
//
// Everything here is a thin shell over the same API a curl command would hit;
// the guards that matter (slug claim, daily cap, draft refusal) live server
// side and are not restated in the UI, because a check written twice is a
// check that can disagree with itself.
//
// The one piece of real UX thinking is the send flow. Sending is irreversible
// and touches every subscriber, so the button never sends on first click: it
// dry-runs, shows exactly what is about to happen, and asks again. That is the
// same discipline the CLI instructions describe, made hard to skip.

const CARD = {
  border: `1px solid ${colors.border}`,
  borderRadius: "14px",
  backgroundColor: colors.surface,
};

// How long a "Confirm send to N" button stays armed. Two minutes is long
// enough to read the number and decide, short enough that the count cannot
// drift meaningfully underneath it. See the guard in handleSend.
const PREVIEW_TTL_MS = 2 * 60 * 1000;

function formatDate(value) {
  if (!value) return null;
  // en-GB with an explicit UTC timezone, so the rendered date cannot depend on
  // the viewer's locale or drift a day either side of midnight.
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function LoginScreen({ onSignedIn }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = useCallback(
    async (event) => {
      event.preventDefault();
      setError("");
      setBusy(true);

      try {
        const res = await fetch("/api/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });

        let payload = {};
        try {
          payload = await res.json();
        } catch {
          // Non-JSON body (a proxy error page); fall through to the status.
        }

        if (!res.ok) {
          setError(payload.error || "Could not sign in.");
          return;
        }

        // The password is deliberately dropped from state on success: there is
        // no reason for it to outlive the request that exchanged it for a
        // session cookie.
        setPassword("");
        onSignedIn();
      } catch {
        setError("Could not reach the server. Check your connection.");
      } finally {
        setBusy(false);
      }
    },
    [password, onSignedIn]
  );

  return (
    <div style={{ maxWidth: "380px", margin: "0 auto", padding: "80px 20px" }}>
      <div style={{ ...CARD, padding: "32px 28px" }}>
        <Lock
          size={28}
          strokeWidth={1.7}
          color={colors.primary}
          aria-hidden="true"
          // display:block, since an inline <svg> centres as a glyph on a text
          // baseline rather than as a shape.
          style={{ display: "block", margin: "0 auto 14px" }}
        />
        <h1
          style={{
            margin: "0 0 20px",
            fontSize: "18px",
            fontWeight: 700,
            color: colors.text,
            textAlign: "center",
          }}
        >
          Newsletter dashboard
        </h1>

        {error ? <ErrorBanner message={error} /> : null}

        <form onSubmit={submit}>
          <label
            htmlFor="admin-password"
            style={{
              display: "block",
              fontSize: "13px",
              fontWeight: 600,
              color: colors.text,
              marginBottom: "6px",
            }}
          >
            Password
          </label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "11px 13px",
              fontSize: "15px",
              color: colors.text,
              backgroundColor: colors.surfaceMuted,
              border: `1px solid ${colors.borderInput}`,
              borderRadius: "10px",
            }}
          />
          <button
            type="submit"
            disabled={busy || password === ""}
            style={{
              width: "100%",
              marginTop: "14px",
              padding: "11px",
              fontSize: "15px",
              fontWeight: 600,
              color: colors.primaryContrast,
              backgroundColor:
                busy || password === "" ? colors.primaryDisabled : colors.primary,
              border: "none",
              borderRadius: "10px",
              cursor: busy || password === "" ? "default" : "pointer",
            }}
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone }) {
  return (
    <div style={{ ...CARD, padding: "16px 18px", flex: "1 1 150px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "6px" }}>
        <Icon size={15} strokeWidth={1.9} color={colors.textFaint} aria-hidden="true" />
        <span style={{ fontSize: "12.5px", color: colors.textMuted }}>{label}</span>
      </div>
      <p
        style={{
          margin: 0,
          fontSize: "22px",
          fontWeight: 700,
          color: tone || colors.text,
        }}
      >
        {value}
      </p>
    </div>
  );
}

function PostRow({ post, onSend, pending, preview }) {
  const isPreviewing = preview?.slug === post.slug;

  return (
    <div
      style={{
        ...CARD,
        padding: "16px 18px",
        display: "flex",
        flexWrap: "wrap",
        gap: "12px",
        alignItems: "center",
      }}
    >
      <div style={{ flex: "1 1 260px", minWidth: 0 }}>
        <p
          style={{
            margin: "0 0 4px",
            fontSize: "15px",
            fontWeight: 600,
            color: colors.text,
            overflowWrap: "break-word",
          }}
        >
          {post.title}
        </p>
        <p style={{ margin: 0, fontSize: "12.5px", color: colors.textFaint }}>
          {formatDate(post.date)}
          {post.sent
            ? ` · Sent ${formatDate(post.sentAt)} to ${post.sentTo ?? 0}`
            : " · Not sent"}
        </p>
      </div>

      {post.sent ? (
        // Sent posts get a state, not a disabled button. A greyed-out button
        // invites clicking to find out why; a label answers it.
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "13px",
            fontWeight: 600,
            color: colors.success,
          }}
        >
          <CheckCircle2 size={15} strokeWidth={2} aria-hidden="true" />
          Sent
        </span>
      ) : (
        <button
          type="button"
          onClick={() => onSend(post, isPreviewing)}
          disabled={pending}
          style={{
            padding: "9px 16px",
            fontSize: "14px",
            fontWeight: 600,
            color: isPreviewing ? colors.primaryContrast : colors.text,
            backgroundColor: isPreviewing ? colors.primary : colors.surfaceMuted,
            border: `1px solid ${isPreviewing ? colors.primary : colors.borderInput}`,
            borderRadius: "9px",
            cursor: pending ? "default" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "7px",
          }}
        >
          <Send size={14} strokeWidth={2} aria-hidden="true" />
          {/* The label carries the whole two-step flow: the first click
              previews, and only the second — which now names the exact number
              of people — actually sends. */}
          {isPreviewing ? `Confirm send to ${preview.recipients}` : "Send…"}
        </button>
      )}
    </div>
  );
}

export default function AdminClient() {
  const [status, setStatus] = useState(null);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin/newsletter", { cache: "no-store" });

      if (res.status === 401) {
        setSignedIn(false);
        setStatus(null);
        return;
      }

      let payload = {};
      try {
        payload = await res.json();
      } catch {
        // fall through to the status-based message
      }

      if (!res.ok) {
        setSignedIn(true);
        setError(payload.error || "Could not load the dashboard.");
        return;
      }

      setSignedIn(true);
      setStatus(payload);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Runs once on mount to discover whether the session cookie is still valid.
  // The cookie is httpOnly, so the client cannot inspect it — asking the server
  // is the only way to know.
  //
  // The fetch is issued directly rather than by calling load(), because load()
  // sets state synchronously before its first await. Doing that inside an
  // effect body causes a cascading render on every mount, which
  // react-hooks/set-state-in-effect correctly flags — and the honest fix is to
  // not set state synchronously here, rather than to disable the rule. The
  // initial state below is already "loading", so there is nothing to set.
  useEffect(() => {
    let cancelled = false;

    fetch("/api/admin/newsletter", { cache: "no-store" })
      .then(async (res) => {
        if (cancelled) return;

        if (res.status === 401) {
          setSignedIn(false);
          return;
        }

        const payload = await res.json().catch(() => ({}));
        if (cancelled) return;

        setSignedIn(true);
        if (res.ok) setStatus(payload);
        else setError(payload.error || "Could not load the dashboard.");
      })
      .catch(() => {
        if (!cancelled) setError("Could not reach the server.");
      })
      .finally(() => {
        // Guarded, so a response arriving after unmount does not set state on
        // a component that is gone.
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSend = useCallback(
    async (post, confirming) => {
      // A confirmation is only good for as long as the count it names is still
      // plausible. The preview says "Confirm send to 40"; if that button sits
      // untouched while people subscribe, the second click sends to whatever
      // the list is NOW, and the number the operator approved is not the
      // number that gets mailed — which defeats the point of a two-step flow.
      //
      // Re-previewing costs one dry run and is always safe, so an expired
      // confirmation falls back to a fresh preview rather than refusing.
      if (confirming && (!preview || Date.now() - preview.at > PREVIEW_TTL_MS)) {
        setPreview(null);
        setError("That confirmation expired. Press Send again to re-check the count.");
        return;
      }

      setPending(true);
      setError("");
      setNotice("");

      try {
        const res = await fetch("/api/admin/newsletter/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // First click is always a dry run. There is no path to a real send
          // that does not pass through a preview naming the recipient count.
          body: JSON.stringify({ slug: post.slug, dryRun: !confirming }),
        });

        let payload = {};
        try {
          payload = await res.json();
        } catch {
          // fall through
        }

        if (res.status === 401) {
          setSignedIn(false);
          return;
        }

        if (!res.ok) {
          setError(payload.error || "The send failed.");
          setPreview(null);
          return;
        }

        if (!confirming) {
          // The route computes this precisely so the block is visible BEFORE
          // the irreversible click rather than at the point of no return.
          // Ignoring it left the operator confirming a send that was always
          // going to 409.
          if (payload.alreadySent) {
            setPreview(null);
            setError(
              `"${post.slug}" has already been sent. Nothing was emailed.`
            );
            await load();
            return;
          }

          setPreview({
            slug: post.slug,
            recipients: payload.recipients,
            // Stamped so the confirmation can expire. See PREVIEW_TTL_MS.
            at: Date.now(),
          });
          return;
        }

        // Reached only on a confirmed send.
        setPreview(null);

        setNotice(
          `Sent "${payload.subject}" to ${payload.sent} of ${payload.recipients} subscribers.`
        );
        await load();
      } catch {
        setError("Could not reach the server.");
      } finally {
        setPending(false);
      }
    },
    // `preview` is read by the staleness guard, so it must be a dependency —
    // without it the guard closes over the preview as it was on first render
    // and never fires.
    [load, preview]
  );

  const signOut = useCallback(async () => {
    await fetch("/api/admin/login", { method: "DELETE" });
    setSignedIn(false);
    setStatus(null);
    setPreview(null);
  }, []);

  if (loading && !status) {
    return (
      <p style={{ textAlign: "center", padding: "80px 20px", color: colors.textMuted }}>
        Loading…
      </p>
    );
  }

  if (!signedIn) {
    return <LoginScreen onSignedIn={load} />;
  }

  return (
    <div style={{ maxWidth: "760px", margin: "0 auto", padding: "48px 20px 80px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          marginBottom: "24px",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 700, color: colors.text }}>
          Newsletter
        </h1>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            onClick={load}
            aria-label="Refresh"
            style={{
              padding: "8px 12px",
              fontSize: "13px",
              color: colors.textMuted,
              backgroundColor: "transparent",
              border: `1px solid ${colors.border}`,
              borderRadius: "8px",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <RefreshCw size={14} strokeWidth={2} aria-hidden="true" />
            Refresh
          </button>
          <button
            type="button"
            onClick={signOut}
            style={{
              padding: "8px 12px",
              fontSize: "13px",
              color: colors.textMuted,
              backgroundColor: "transparent",
              border: `1px solid ${colors.border}`,
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </div>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      {notice ? (
        <p
          role="status"
          style={{
            margin: "0 0 20px",
            padding: "12px 14px",
            fontSize: "14px",
            color: colors.success,
            backgroundColor: colors.successSoft,
            border: `1px solid ${colors.successSoftBorder}`,
            borderRadius: "10px",
          }}
        >
          {notice}
        </p>
      ) : null}

      {status ? (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "28px" }}>
            <Stat icon={Users} label="Subscribers" value={status.subscribers} />
            <Stat
              icon={Mail}
              label="Sent today"
              value={`${status.sentToday} / ${status.dailyCap}`}
              // Turns amber once the day's headroom is thin, since a run larger
              // than what remains is refused outright rather than truncated.
              tone={status.remainingToday < 10 ? colors.warningText : undefined}
            />
          </div>

          <h2
            style={{
              margin: "0 0 12px",
              fontSize: "15px",
              fontWeight: 700,
              color: colors.text,
            }}
          >
            Posts
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {status.posts.length === 0 ? (
              <p style={{ fontSize: "14px", color: colors.textMuted }}>
                No published posts yet.
              </p>
            ) : (
              status.posts.map((post) => (
                <PostRow
                  key={post.slug}
                  post={post}
                  onSend={handleSend}
                  pending={pending}
                  preview={preview}
                />
              ))
            )}
          </div>

          <p
            style={{
              margin: "24px 0 0",
              fontSize: "12.5px",
              lineHeight: 1.6,
              color: colors.textFaint,
            }}
          >
            Sending is permanent: a post can only be sent once, and subscribers who
            join afterwards will not receive it. The first click previews the
            recipient count; the second sends.
          </p>
        </>
      ) : null}
    </div>
  );
}
