// The HTML and plain-text bodies for a contact-form notification.
//
// Kept out of the route so it can be tested and previewed without sending
// mail, the same reason the guard logic lives in contactValidation.js.
//
// This email is a *notification to the operator*, not marketing to a customer,
// and the design follows from that. It is read on a phone, mid-scroll, to
// answer two questions fast: "is this real or spam?" and "what do they want?"
// So the message body dominates, the sender's address is one tap away, and
// there is no hero image, no call-to-action button, and no footer of links to
// scroll past. Decoration here would actively cost triage speed.
//
// Email HTML is not web HTML. The rules this file obeys, each learned from a
// client that breaks otherwise:
//
//   - Tables for layout, never flexbox or grid. Outlook renders through Word's
//     engine, which supports neither, and a flex layout collapses to a single
//     unstyled column there.
//   - Inline styles only. Gmail strips <style> blocks entirely, so anything in
//     one is decoration that silently vanishes for the largest mail client.
//   - No external images. Most clients block remote images by default, so an
//     image-based header renders as an empty box on first open — and loading
//     one is a tracking signal we have no reason to send.
//   - No CSS custom properties. The site's theme.js is built on them; they are
//     unusable here, so the palette below repeats globals.css as literal hex.
//
// The palette is deliberately the site's own (globals.css :root), so the email
// and wary.tools read as one product.

const BRAND = {
  primary: "#2563eb",
  accent: "#7c3aed", // logo gradient end; matches --category-image-text
  text: "#111827",
  textSecondary: "#374151",
  textMuted: "#6b7280",
  textFaint: "#9ca3af",
  border: "#e5e7eb",
  surface: "#ffffff",
  surfaceMuted: "#f9fafb",
};

// A conservative stack. Email clients have no webfonts worth relying on, and
// -apple-system/Segoe UI give the native look on the two platforms that matter.
const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * Escapes a string for interpolation into HTML.
 *
 * Duplicated from contactValidation.js rather than imported, so this module
 * stands alone as "everything needed to render the email" — and so a future
 * change to validation's escaping cannot silently alter what gets sent.
 *
 * @param {string} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Renders the message body, preserving the shape of what was typed.
 *
 * A textarea's newlines carry meaning — steps to reproduce, a list, a
 * signature — and HTML collapses them. Blank lines become paragraph spacing
 * and single newlines become <br>, so a bug report arrives looking like what
 * the reporter wrote rather than one run-on block.
 *
 * Escaping happens first, always: this is attacker-controlled text landing in
 * the operator's inbox, and a contact form that renders arbitrary markup there
 * is a phishing delivery mechanism aimed at us.
 *
 * @param {string} message
 * @returns {string}
 */
function renderMessageBody(message) {
  const escaped = escapeHtml(message);

  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((para) => para.replace(/\n/g, "<br>"))
    .filter((para) => para.trim().length > 0);

  // A message that was entirely whitespace would leave an empty card. It can't
  // reach here (validation enforces a minimum length), but rendering depends on
  // that guarantee rather than restating it, so this keeps the output valid if
  // the two ever drift.
  if (paragraphs.length === 0) return "";

  return paragraphs
    .map((para, index) => {
      // The last paragraph drops its bottom margin, which would otherwise stack
      // with the container's padding and leave a lopsided gap above the divider.
      const margin = index === paragraphs.length - 1 ? "0" : "0 0 14px";
      // font-family is repeated on every paragraph rather than inherited from
      // the container. Several clients (Outlook.com and some Android clients
      // among them) reset font properties on block elements, and the message
      // body is the one part that must not fall back to a serif default.
      // word-break guards against a single unbroken token — a long URL, a
      // base64 blob, a wall of one character — stretching the card past the
      // viewport and forcing the whole email to scroll sideways. Without it a
      // sender can break the layout, deliberately or by pasting a stack trace.
      return `<p style="margin:${margin};font-family:${FONT};font-size:15px;line-height:1.65;color:${BRAND.text};word-break:break-word;overflow-wrap:break-word;">${para}</p>`;
    })
    .join("");
}

/**
 * Builds the HTML notification.
 *
 * @param {{name: string, email: string, message: string, siteOrigin?: string}} input
 * @returns {string}
 */
export function renderContactEmailHtml({ name, email, message, siteOrigin = "https://wary.tools" }) {
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeOrigin = escapeHtml(siteOrigin);
  const body = renderMessageBody(message);

  // encodeURIComponent, not escapeHtml, for the href: this is a URL context,
  // and an address with a "+" or "&" would otherwise truncate the mailto.
  const replyHref = `mailto:${encodeURIComponent(email)}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<!-- The http-equiv form as well as the bare charset: several mail clients
     strip <meta charset> when they rewrite the document, and fall back to a
     single-byte encoding that turns an em-dash or any accented character into
     mojibake. Declaring both is the cheap insurance. -->
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>New contact message</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.surfaceMuted};">
<!-- Preheader: the grey text a client previews next to the subject. Without
     one, clients pull the first words of the layout instead, which reads as
     junk in the inbox list. Hidden in the body itself. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${safeName} sent a message via the contact form</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.surfaceMuted};">
<tr>
<td align="center" style="padding:32px 16px;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:14px;">

<!-- Brand bar. A 3px gradient rule rather than a logo block: it identifies the
     source at a glance, survives image blocking, and costs no vertical space
     on a phone.
     Its own top corners are rounded to match the card, rather than relying on
     overflow:hidden — mail clients (and table rendering generally) don't clip
     a child cell to the parent's radius, which left the bar overhanging the
     corners. A solid background is declared before the gradient so Outlook,
     which ignores linear-gradient entirely, still shows a brand-blue rule
     instead of a white gap. -->
<tr>
<td style="height:3px;background-color:${BRAND.primary};background-image:linear-gradient(90deg, ${BRAND.primary}, ${BRAND.accent});border-radius:13px 13px 0 0;font-size:0;line-height:0;">&nbsp;</td>
</tr>

<tr>
<td style="padding:28px 28px 0;">
<p style="margin:0 0 4px;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.textFaint};">
New contact message
</p>
</td>
</tr>

<!-- Sender. The name is the heading and the address is a live mailto, because
     replying is the only action this email ever leads to. -->
<tr>
<td style="padding:8px 28px 0;">
<p style="margin:0 0 2px;font-family:${FONT};font-size:19px;font-weight:700;color:${BRAND.text};word-break:break-word;overflow-wrap:break-word;">
${safeName}
</p>
<p style="margin:0;font-family:${FONT};font-size:14px;word-break:break-all;">
<a href="${replyHref}" style="color:${BRAND.primary};text-decoration:none;">${safeEmail}</a>
</p>
</td>
</tr>

<tr>
<td style="padding:20px 28px 0;">
<div style="height:1px;background-color:${BRAND.border};font-size:0;line-height:0;">&nbsp;</div>
</td>
</tr>

<!-- The message. Given the most room and the largest body text, because it is
     the only part that varies and the only part actually being read. -->
<tr>
<td style="padding:20px 28px 4px;font-family:${FONT};">
${body}
</td>
</tr>

<tr>
<td style="padding:20px 28px 26px;">
<div style="height:1px;background-color:${BRAND.border};font-size:0;line-height:0;">&nbsp;</div>
<p style="margin:16px 0 0;font-family:${FONT};font-size:12.5px;line-height:1.6;color:${BRAND.textMuted};">
Reply directly to this email to respond to ${safeName} &mdash; your reply goes to their address, not to the site.
</p>
</td>
</tr>

</table>

<p style="margin:16px 0 0;font-family:${FONT};font-size:11.5px;color:${BRAND.textFaint};">
Sent from the contact form at <a href="${safeOrigin}/contact" style="color:${BRAND.textMuted};text-decoration:none;">${safeOrigin.replace(/^https?:\/\//, "")}/contact</a>
</p>

</td>
</tr>
</table>
</body>
</html>`;
}

/**
 * Builds the plain-text alternative.
 *
 * Not a fallback nobody sees: some clients are configured to prefer text, and
 * sending HTML alone is itself a spam signal. It carries the same information
 * in the same order, so a reader of either version sees the same email.
 *
 * @param {{name: string, email: string, message: string, siteOrigin?: string}} input
 * @returns {string}
 */
export function renderContactEmailText({
  name,
  email,
  message,
  siteOrigin = "https://wary.tools",
}) {
  return [
    "NEW CONTACT MESSAGE",
    "",
    `From: ${name} <${email}>`,
    "",
    "-".repeat(48),
    "",
    message,
    "",
    "-".repeat(48),
    "",
    `Reply directly to this email to respond to ${name} — your reply goes`,
    "to their address, not to the site.",
    "",
    `Sent from the contact form at ${siteOrigin}/contact`,
  ].join("\n");
}
