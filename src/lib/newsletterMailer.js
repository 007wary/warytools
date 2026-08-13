// The Resend send call, shared by the subscribe and send routes.
//
// Server-only. Extracted from the routes rather than inlined twice because the
// two details below were both learned the hard way in /api/contact, and a
// second hand-rolled copy of this fetch is a second chance to get them wrong:
//
//   - The body is a Buffer with an explicit charset and Content-Length in
//     BYTES. JSON.stringify emits raw multi-byte characters; without a declared
//     charset the receiving parser may assume a single-byte encoding, which
//     turns an em-dash into three mojibake characters. A string body would let
//     the runtime infer a length from characters, under-reporting any
//     multi-byte content and truncating the request.
//   - Resend's error body names the cause (unverified domain, bad key). That
//     belongs in Sentry and never in a response: it describes our
//     configuration, not anything the recipient did.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Sends one email.
 *
 * Returns a discriminated result rather than throwing, so a bulk send can
 * record which recipients failed and carry on — one bad address must not
 * abort a run partway through and leave the list half-emailed with no record
 * of where it stopped.
 *
 * @param {object} input
 * @param {string} input.apiKey
 * @param {string} input.from
 * @param {string} input.to
 * @param {string} input.subject
 * @param {string} input.html
 * @param {string} input.text
 * @param {Record<string,string>} [input.headers] Extra SMTP headers.
 * @returns {Promise<{ok: true} | {ok: false, detail: string, status: number|null}>}
 */
export async function sendEmail({ apiKey, from, to, subject, html, text, headers }) {
  const payload = Buffer.from(
    JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      text,
      ...(headers ? { headers } : {}),
    }),
    "utf8"
  );

  let response;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": String(payload.length),
      },
      body: payload,
    });
  } catch (error) {
    return { ok: false, detail: error?.message || "network error", status: null };
  }

  if (!response.ok) {
    let detail = `status ${response.status}`;
    try {
      const body = await response.json();
      detail = body?.message || body?.name || detail;
    } catch {
      // Non-JSON error page; the status is all we have.
    }

    return { ok: false, detail, status: response.status };
  }

  return { ok: true };
}

/**
 * The List-Unsubscribe headers for a bulk message.
 *
 * These are not optional decoration. Gmail and Outlook show their own native
 * unsubscribe control when they see them, and — since Google and Yahoo's 2024
 * bulk-sender rules — a bulk sender without one-click unsubscribe gets
 * throttled or binned regardless of what the message body says. Without them a
 * subscriber's only exit is the spam button, and enough of those take the
 * sending domain down with them, including the contact form that shares it.
 *
 * List-Unsubscribe-Post is what makes it *one-click*: the client POSTs to the
 * URL itself rather than opening it in a browser, so the unsubscribe route
 * must accept POST as well as GET. Declaring the header without handling POST
 * is worse than omitting it — the client shows the button and the click does
 * nothing.
 */
export function listUnsubscribeHeaders(unsubscribeUrl) {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
