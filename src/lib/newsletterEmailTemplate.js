// The HTML and plain-text bodies for the two newsletter emails: the double
// opt-in confirmation, and the new-post announcement.
//
// Kept out of the routes so they can be tested and previewed without sending
// mail, the same reason contactEmailTemplate.js exists.
//
// These are *marketing* emails to a subscriber, which is the opposite of the
// contact notification's brief. That one is triage: no images, no CTA, body
// text dominant. These are read once, on a phone, by someone deciding whether
// to tap through — so each has exactly one call to action, the cover image is
// worth its weight, and the footer carries the unsubscribe link that keeps us
// out of the spam folder.
//
// Every email-HTML rule from contactEmailTemplate.js applies here identically
// and is not repeated: tables not flexbox, inline styles only, no CSS custom
// properties, conservative font stack. One rule is *reversed* — these do carry
// a remote image (the post cover), because a blog announcement without the
// picture is a wall of grey text. It degrades to nothing when images are
// blocked, which is why the headline and description are never inside it.

const BRAND = {
  primary: "#2563eb",
  accent: "#7c3aed",
  text: "#111827",
  textSecondary: "#374151",
  textMuted: "#6b7280",
  textFaint: "#9ca3af",
  border: "#e5e7eb",
  surface: "#ffffff",
  surfaceMuted: "#f9fafb",
};

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * Escapes a string for interpolation into HTML.
 *
 * Duplicated from contactEmailTemplate.js rather than imported, for the same
 * reason that file duplicates it from contactValidation: this module stands
 * alone as "everything needed to render these emails", and a future change to
 * another module's escaping must not silently alter what gets sent.
 *
 * Post titles and descriptions come from our own frontmatter rather than from a
 * stranger, so this is defence in depth rather than the front line — but an
 * unescaped `&` in a title ("Word & PDF") is a broken entity in a mail client
 * regardless of who wrote it.
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
 * Wraps the shared chrome around a body.
 *
 * Both emails share a card, a brand rule, and a footer, so they are built once
 * here. The footer differs: a confirmation is a transactional email nobody
 * should be able to "unsubscribe" from (there is nothing yet to unsubscribe
 * from), so it takes no unsubscribe link, while an announcement must always
 * carry one.
 */
function renderShell({ preheader, body, footer }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WaryTools</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.surfaceMuted};">
<!-- Preheader: the grey preview text beside the subject. Without one, clients
     pull the first words of the layout instead, which reads as junk. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.surfaceMuted};">
<tr>
<td align="center" style="padding:32px 16px;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:14px;">

<!-- Brand bar. Solid colour declared before the gradient so Outlook, which
     ignores linear-gradient, shows a brand rule rather than a white gap. Its
     own corners are rounded because mail clients don't clip a child cell to
     the parent's radius. -->
<tr>
<td style="height:3px;background-color:${BRAND.primary};background-image:linear-gradient(90deg, ${BRAND.primary}, ${BRAND.accent});border-radius:13px 13px 0 0;font-size:0;line-height:0;">&nbsp;</td>
</tr>

${body}

</table>

${footer}

</td>
</tr>
</table>
</body>
</html>`;
}

/**
 * The button both emails use for their single call to action.
 *
 * A padded table cell, not a styled <a>: Outlook ignores padding on inline
 * elements, which collapses a link-styled button into bare underlined text.
 * The <a> still fills the cell so the whole area is tappable.
 */
function renderButton(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr>
<td align="center" style="background-color:${BRAND.primary};border-radius:10px;">
<a href="${href}" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(label)}</a>
</td>
</tr>
</table>`;
}

/**
 * The welcome email for a new subscription.
 *
 * Replaces an earlier confirmation email. The site now uses single opt-in: the
 * subscription is live the moment the form is submitted, so this email
 * *reports* a subscription rather than gating one, and needs no click to work.
 *
 * That inverts what the email has to do. A confirmation could be quiet, because
 * its link was the whole product. This one is the only notice the recipient
 * ever gets that they are on a list — and under single opt-in the recipient is
 * not guaranteed to be the person who typed the address. So the unsubscribe
 * link is prominent rather than buried, and the "if this wasn't you" line is
 * near the top: for someone who did not sign up, leaving is the only thing
 * this email needs to help them do, and making them hunt for it is what earns
 * a spam report instead.
 *
 * @param {{unsubscribeUrl: string, siteUrl: string}} input
 * @returns {string}
 */
export function renderWelcomeEmailHtml({ unsubscribeUrl, siteUrl }) {
  // The URL is already ours (built by newsletterToken) and its token is
  // base64url, so it needs no escaping for a URL context — but it lands inside
  // an HTML attribute, where an unescaped quote would break out of the href.
  const unsubHref = escapeHtml(unsubscribeUrl);
  const origin = escapeHtml(siteUrl);

  const body = `
<tr>
<td style="padding:30px 28px 0;">
<p style="margin:0 0 6px;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.textFaint};">
WaryTools newsletter
</p>
<p style="margin:0;font-family:${FONT};font-size:21px;font-weight:700;line-height:1.35;color:${BRAND.text};">
You're subscribed
</p>
</td>
</tr>

<tr>
<td style="padding:14px 28px 0;">
<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.65;color:${BRAND.textSecondary};">
Thanks for signing up. You'll get an email whenever a new guide or tool goes live on WaryTools &mdash; usually once or twice a month, never more.
</p>
<p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.65;color:${BRAND.textSecondary};">
Nothing else. No ads, no sharing your address, and no account to manage.
</p>
</td>
</tr>

<tr>
<td style="padding:22px 28px 0;">
${renderButton(`${origin}/blog`, "Read the blog")}
</td>
</tr>

<tr>
<td style="padding:24px 28px 26px;">
<div style="height:1px;background-color:${BRAND.border};font-size:0;line-height:0;">&nbsp;</div>
<!-- Prominent, not buried, and deliberately high in the email. Under single
     opt-in the recipient may not be the person who typed the address, and for
     them the ONLY useful thing here is a way out. Someone who cannot find it
     reaches for the spam button instead, and enough of those take the sending
     domain down with them - contact form included. -->
<p style="margin:16px 0 0;font-family:${FONT};font-size:12.5px;line-height:1.6;color:${BRAND.textMuted};">
Didn't sign up, or changed your mind?
<a href="${unsubHref}" style="color:${BRAND.primary};text-decoration:underline;">Unsubscribe here</a> &mdash; one click, no questions, and you'll hear nothing further.
</p>
</td>
</tr>`;

  const footer = `<p style="margin:16px 0 0;font-family:${FONT};font-size:11.5px;line-height:1.7;color:${BRAND.textFaint};">
<a href="${origin}" style="color:${BRAND.textMuted};text-decoration:none;">${origin.replace(/^https?:\/\//, "")}</a> &mdash; free PDF, image and calculator tools<br>
<a href="${unsubHref}" style="color:${BRAND.textMuted};text-decoration:underline;">Unsubscribe</a>
</p>`;

  return renderShell({
    preheader: "You're subscribed to the WaryTools newsletter",
    body,
    footer,
  });
}

/**
 * The plain-text alternative.
 *
 * Sent alongside the HTML rather than as a fallback nobody sees: some clients
 * prefer it, and HTML-only mail is itself a spam signal — which for a bulk
 * send matters far more than it does for a single contact notification.
 */
export function renderWelcomeEmailText({ unsubscribeUrl, siteUrl }) {
  return [
    "You're subscribed",
    "",
    "Thanks for signing up. You'll get an email whenever a new guide or tool goes live on WaryTools - usually once or twice a month, never more.",
    "",
    "Nothing else. No ads, no sharing your address, and no account to manage.",
    "",
    `Read the blog: ${siteUrl}/blog`,
    "",
    "---",
    "Didn't sign up, or changed your mind? Unsubscribe here - one click, no questions:",
    unsubscribeUrl,
  ].join("\n");
}

/**
 * The subject line for a post announcement.
 *
 * The post's own title, unprefixed. A "[WaryTools Newsletter]" prefix eats the
 * first third of the line on a phone, where the sender name already says who
 * it is from — so the prefix costs the words that decide whether it is opened.
 */
export function postSubject(post) {
  return post.title;
}

/**
 * The new-post announcement.
 *
 * @param {object} input
 * @param {{title: string, description: string, slug: string, cover?: string|null,
 *          coverAlt?: string|null, readingTime?: number|null,
 *          category?: string|null}} input.post
 * @param {string} input.siteUrl
 * @param {string} input.unsubscribeUrl
 * @returns {string}
 */
export function renderPostEmailHtml({ post, siteUrl, unsubscribeUrl }) {
  const origin = escapeHtml(siteUrl);
  const postUrl = `${escapeHtml(siteUrl)}/blog/${escapeHtml(post.slug)}`;
  const unsubHref = escapeHtml(unsubscribeUrl);

  // Absolute, because a mail client has no page to resolve a root-relative
  // path against — "/blog/cover.jpg" in an email is a broken image, always.
  const coverHtml = post.cover
    ? `<tr>
<td style="padding:26px 28px 0;">
<a href="${postUrl}" style="text-decoration:none;">
<img src="${escapeHtml(siteUrl)}${escapeHtml(post.cover)}" alt="${escapeHtml(post.coverAlt || "")}" width="504" style="display:block;width:100%;max-width:504px;height:auto;border-radius:10px;border:1px solid ${BRAND.border};">
</a>
</td>
</tr>`
    : "";

  // Reading time and category are shown only when present. A blank "·"
  // separator with nothing either side is the kind of detail that makes an
  // email look automated, which is exactly what it is and exactly what it
  // should not look like.
  const meta = [post.category, post.readingTime ? `${post.readingTime} min read` : null]
    .filter(Boolean)
    .map((part) => escapeHtml(part))
    .join(" &middot; ");

  const body = `
<tr>
<td style="padding:30px 28px 0;">
<p style="margin:0;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.textFaint};">
New on WaryTools
</p>
</td>
</tr>

${coverHtml}

<tr>
<td style="padding:22px 28px 0;">
<!-- The title links as well as the button. On a phone the headline is what
     gets tapped, and a non-linked headline is a dead target. -->
<p style="margin:0 0 8px;font-family:${FONT};font-size:22px;font-weight:700;line-height:1.32;color:${BRAND.text};word-break:break-word;overflow-wrap:break-word;">
<a href="${postUrl}" style="color:${BRAND.text};text-decoration:none;">${escapeHtml(post.title)}</a>
</p>
${meta ? `<p style="margin:0;font-family:${FONT};font-size:12.5px;color:${BRAND.textFaint};">${meta}</p>` : ""}
</td>
</tr>

<tr>
<td style="padding:12px 28px 0;">
<p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.65;color:${BRAND.textSecondary};word-break:break-word;overflow-wrap:break-word;">
${escapeHtml(post.description)}
</p>
</td>
</tr>

<tr>
<td style="padding:22px 28px 0;">
${renderButton(postUrl, "Read the post")}
</td>
</tr>

<tr>
<td style="padding:24px 28px 26px;">
<div style="height:1px;background-color:${BRAND.border};font-size:0;line-height:0;">&nbsp;</div>
<p style="margin:16px 0 0;font-family:${FONT};font-size:12.5px;line-height:1.6;color:${BRAND.textMuted};">
Every tool on WaryTools is free, and nearly all of them run entirely in your browser.
</p>
</td>
</tr>`;

  // The unsubscribe link is in the visible footer of every announcement, not
  // only in the List-Unsubscribe header. The header is honoured by Gmail and
  // Outlook; everywhere else, a subscriber who can't find the link marks the
  // message as spam instead, and enough of those take the sending domain down
  // with them - including the contact form, which shares it.
  const footer = `<p style="margin:16px 0 0;font-family:${FONT};font-size:11.5px;line-height:1.7;color:${BRAND.textFaint};">
You're getting this because you confirmed your subscription at <a href="${origin}" style="color:${BRAND.textMuted};text-decoration:none;">${origin.replace(/^https?:\/\//, "")}</a>.<br>
<a href="${unsubHref}" style="color:${BRAND.textMuted};text-decoration:underline;">Unsubscribe</a> &mdash; one click, no questions.
</p>`;

  return renderShell({
    preheader: post.description,
    body,
    footer,
  });
}

export function renderPostEmailText({ post, siteUrl, unsubscribeUrl }) {
  const postUrl = `${siteUrl}/blog/${post.slug}`;

  return [
    "NEW ON WARYTOOLS",
    "",
    post.title,
    "",
    post.description,
    "",
    `Read it: ${postUrl}`,
    "",
    "---",
    `You're getting this because you confirmed your subscription at ${siteUrl}.`,
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join("\n");
}
