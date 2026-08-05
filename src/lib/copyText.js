// Clipboard write with a fallback for browsers without the async Clipboard
// API (older Samsung Internet, some in-app WebViews) — the same situation the
// URL shortener already handled inline. Extracted so the calculators' copy
// buttons don't each re-implement it.
//
// navigator.clipboard is also undefined on any non-secure origin, so the
// fallback matters on local network testing too, not just old browsers.
export async function copyText(text) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  // Off-screen but still focusable — display:none would make select() a no-op.
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.setAttribute("readonly", "");
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}
