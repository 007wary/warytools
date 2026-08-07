"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { colors } from "@/lib/theme";

/**
 * A password input with a show/hide toggle, shared by Unlock and Protect.
 *
 * The reveal toggle is not a nicety here. These fields carry a password that is
 * either being recalled from elsewhere or invented on the spot, and a typo in
 * either direction is expensive: on Unlock it reads as "wrong password" on a
 * file the user can actually open, and on Protect it produces a document nobody
 * can open at all, discovered long after the original is gone. Letting someone
 * check what they typed is the cheapest possible guard against that.
 *
 * `autoComplete="new-password"` on the Protect side stops browsers and password
 * managers offering a saved site login for a field that has nothing to do with
 * this site's account — and stops them offering to *save* a document password as
 * one.
 */
export default function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  autoComplete = "new-password",
  hint,
  disabled = false,
  onEnter,
}) {
  const [revealed, setRevealed] = useState(false);
  const id = useId();
  const hintId = `${id}-hint`;

  return (
    <div style={{ marginBottom: "16px" }}>
      <label
        htmlFor={id}
        style={{
          display: "block",
          fontSize: "13px",
          fontWeight: 600,
          color: colors.text,
          marginBottom: "6px",
        }}
      >
        {label}
      </label>

      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <input
          id={id}
          // Toggling the type rather than rendering two inputs keeps the value,
          // the caret position, and the element's focus intact across a reveal.
          type={revealed ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && onEnter) onEnter();
          }}
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
          aria-describedby={hint ? hintId : undefined}
          style={{
            width: "100%",
            padding: "10px 44px 10px 12px",
            fontSize: "14px",
            fontFamily: "inherit",
            color: colors.text,
            backgroundColor: disabled ? colors.surfaceMuted : colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: "8px",
            outline: "none",
          }}
        />

        <button
          type="button"
          onClick={() => setRevealed((current) => !current)}
          disabled={disabled}
          // The label states the action, not the state, and it is announced
          // because an icon-only control is otherwise silent to a screen reader.
          aria-label={revealed ? "Hide password" : "Show password"}
          aria-pressed={revealed}
          style={{
            position: "absolute",
            right: "6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "32px",
            height: "32px",
            border: "none",
            background: "transparent",
            borderRadius: "6px",
            cursor: disabled ? "default" : "pointer",
            color: colors.textMuted,
          }}
        >
          {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>

      {hint && (
        <p id={hintId} style={{ fontSize: "12px", color: colors.textMuted, margin: "6px 0 0" }}>
          {hint}
        </p>
      )}
    </div>
  );
}
