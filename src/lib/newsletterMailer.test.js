import { afterEach, describe, expect, it, vi } from "vitest";
import { listUnsubscribeHeaders, sendEmail } from "./newsletterMailer";

// The Resend call every newsletter and welcome email goes through. Three
// properties here are load-bearing and all fail quietly:
//
//   - The body is a Buffer with an explicit charset and a Content-Length in
//     BYTES. A string body lets the runtime infer a length from CHARACTERS,
//     which under-reports any multi-byte content and truncates the request —
//     so an em-dash in a subject line silently cuts the email short.
//   - It returns a discriminated result rather than throwing, so one bad
//     address cannot abort a bulk run and leave the list half-emailed with no
//     record of where it stopped.
//   - Resend's error text names OUR configuration (unverified domain, bad
//     key). It belongs in Sentry, never in a response to a recipient.

afterEach(() => {
  vi.unstubAllGlobals();
});

const MESSAGE = {
  apiKey: "re_test_key",
  from: "WaryTools <hello@wary.tools>",
  to: "reader@example.com",
  subject: "New post",
  html: "<p>Hello</p>",
  text: "Hello",
};

/** Captures the fetch call and replies with the given response. */
function stubFetch(response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function okResponse() {
  return { ok: true, status: 200, json: async () => ({ id: "abc" }) };
}

describe("sendEmail", () => {
  it("posts to Resend with bearer auth and a JSON content type", async () => {
    const fetchMock = stubFetch(okResponse());

    const result = await sendEmail(MESSAGE);

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer re_test_key");
  });

  it("declares utf-8 explicitly in the content type", async () => {
    const fetchMock = stubFetch(okResponse());
    await sendEmail(MESSAGE);

    // Without a declared charset the receiving parser may assume a
    // single-byte encoding, turning one em-dash into three mojibake glyphs.
    expect(fetchMock.mock.calls[0][1].headers["Content-Type"]).toBe(
      "application/json; charset=utf-8"
    );
  });

  it("sends a Buffer body, not a string", async () => {
    const fetchMock = stubFetch(okResponse());
    await sendEmail(MESSAGE);

    expect(Buffer.isBuffer(fetchMock.mock.calls[0][1].body)).toBe(true);
  });

  it("counts Content-Length in bytes, not characters", async () => {
    const fetchMock = stubFetch(okResponse());

    // An em-dash is three bytes in UTF-8 and one JS character. This is the
    // exact case that truncates a request when the length is inferred from a
    // string body.
    await sendEmail({ ...MESSAGE, subject: "New post — a guide", text: "Hello — world" });

    const init = fetchMock.mock.calls[0][1];
    const declared = Number(init.headers["Content-Length"]);
    expect(declared).toBe(init.body.length);
    // And it genuinely exceeds the character count, or this test would pass
    // against a plain-ASCII payload without proving anything.
    const json = init.body.toString("utf8");
    expect(declared).toBeGreaterThan(json.length);
  });

  it("wraps the recipient in an array, as the API expects", async () => {
    const fetchMock = stubFetch(okResponse());
    await sendEmail(MESSAGE);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body.toString("utf8"));
    expect(body.to).toEqual(["reader@example.com"]);
    expect(body.from).toBe(MESSAGE.from);
    expect(body.subject).toBe(MESSAGE.subject);
  });

  it("sends both html and text parts", async () => {
    const fetchMock = stubFetch(okResponse());
    await sendEmail(MESSAGE);

    // A bulk message with no plain-text alternative scores worse with spam
    // filters, which for this sender means the contact form's domain too.
    const body = JSON.parse(fetchMock.mock.calls[0][1].body.toString("utf8"));
    expect(body.html).toBe("<p>Hello</p>");
    expect(body.text).toBe("Hello");
  });

  it("includes custom headers when given, and omits the key entirely when not", async () => {
    const fetchMock = stubFetch(okResponse());

    await sendEmail({ ...MESSAGE, headers: { "List-Unsubscribe": "<https://x>" } });
    let body = JSON.parse(fetchMock.mock.calls[0][1].body.toString("utf8"));
    expect(body.headers).toEqual({ "List-Unsubscribe": "<https://x>" });

    await sendEmail(MESSAGE);
    body = JSON.parse(fetchMock.mock.calls[1][1].body.toString("utf8"));
    // `headers: undefined` would serialise away anyway, but an explicit
    // `headers: {}` would not — and Resend rejects an empty headers object.
    expect(body).not.toHaveProperty("headers");
  });

  it("returns a failure result instead of throwing on a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));

    const result = await sendEmail(MESSAGE);

    // A throw here would abort a bulk run partway through, leaving the post
    // marked sent and the remainder of the list permanently unmailed.
    expect(result.ok).toBe(false);
    expect(result.detail).toBe("ECONNRESET");
    expect(result.status).toBeNull();
  });

  it("survives a rejection with no message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue({}));

    const result = await sendEmail(MESSAGE);
    expect(result).toEqual({ ok: false, detail: "network error", status: null });
  });

  it("reports the API's own reason when Resend rejects the message", async () => {
    stubFetch({
      ok: false,
      status: 403,
      json: async () => ({ message: "The domain is not verified." }),
    });

    const result = await sendEmail(MESSAGE);

    // The detail is for Sentry, where it is the difference between "our
    // domain lapsed" and "that address bounced".
    expect(result).toEqual({
      ok: false,
      detail: "The domain is not verified.",
      status: 403,
    });
  });

  it("falls back to the error name, then to the status", async () => {
    stubFetch({ ok: false, status: 422, json: async () => ({ name: "validation_error" }) });
    expect((await sendEmail(MESSAGE)).detail).toBe("validation_error");

    stubFetch({ ok: false, status: 500, json: async () => ({}) });
    expect((await sendEmail(MESSAGE)).detail).toBe("status 500");
  });

  it("survives a non-JSON error page", async () => {
    // A gateway timeout returns HTML, and calling .json() on it throws.
    // Losing the status here would lose the only diagnostic left.
    stubFetch({
      ok: false,
      status: 504,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    });

    expect(await sendEmail(MESSAGE)).toEqual({
      ok: false,
      detail: "status 504",
      status: 504,
    });
  });

  it("never reports rate limiting as success", async () => {
    // 429 is the response a bulk run hits when it outpaces Resend's 2/second
    // limit. Treating it as sent would silently drop those recipients.
    stubFetch({ ok: false, status: 429, json: async () => ({ message: "Too many requests" }) });

    const result = await sendEmail(MESSAGE);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(429);
  });
});

describe("listUnsubscribeHeaders", () => {
  const url = "https://wary.tools/newsletter/unsubscribe?token=abc";

  it("wraps the URL in angle brackets, as RFC 2369 requires", () => {
    // A bare URL here is ignored by Gmail and Outlook, so the native
    // unsubscribe button never appears and the spam button becomes the exit.
    expect(listUnsubscribeHeaders(url)["List-Unsubscribe"]).toBe(`<${url}>`);
  });

  it("declares one-click, which obliges the route to accept POST", () => {
    // Declaring this without handling POST is worse than omitting it: the
    // client shows the button and the click does nothing.
    expect(listUnsubscribeHeaders(url)["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click"
    );
  });

  it("returns both headers together", () => {
    // One without the other is the broken state; they are only meaningful as
    // a pair, which is why they come from one function.
    expect(Object.keys(listUnsubscribeHeaders(url)).sort()).toEqual([
      "List-Unsubscribe",
      "List-Unsubscribe-Post",
    ]);
  });
});
