"use client";

import { colors } from "@/lib/theme";

// Shared button styling for tool actions. Every PDF tool previously spelled
// out the same ~10-line inline style object for its primary button, its
// secondary buttons, and its icon buttons — so a token change had to be made
// in five places and inevitably wasn't. Behaviour is identical; only the
// duplication is gone.

export function primaryButtonStyle(disabled) {
  return {
    backgroundColor: disabled ? colors.primaryDisabled : colors.primary,
    color: colors.primaryContrast,
    border: "none",
    borderRadius: "8px",
    padding: "10px 20px",
    fontSize: "14px",
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
  };
}

export function secondaryButtonStyle(disabled) {
  return {
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.surface,
    color: disabled ? colors.textFaint : colors.textSecondary,
    borderRadius: "8px",
    padding: "9px 14px",
    fontSize: "14px",
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
  };
}

// 36px minimum keeps icon-only controls at a usable touch target — the
// browser default for a bare icon button is well under the ~44px guideline.
export function iconButtonStyle(disabled, color = colors.textSecondary) {
  return {
    background: "none",
    border: `1px solid ${colors.border}`,
    borderRadius: "8px",
    width: "36px",
    height: "36px",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: disabled ? colors.borderInput : color,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}

export function PrimaryButton({ disabled, onClick, children, type = "button" }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={primaryButtonStyle(disabled)}>
      {children}
    </button>
  );
}

export function SecondaryButton({ disabled, onClick, children, type = "button", ...rest }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={secondaryButtonStyle(disabled)}
      {...rest}
    >
      {children}
    </button>
  );
}
