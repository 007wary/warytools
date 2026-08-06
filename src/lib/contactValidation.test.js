import { describe, it, expect } from "vitest";
import {
  MAX_NAME_LENGTH,
  MAX_EMAIL_LENGTH,
  MAX_MESSAGE_LENGTH,
  MIN_MESSAGE_LENGTH,
  ContactRejection,
  checkSubmission,
  rejectionMessage,
  notificationSubject,
  escapeHtml,
} from "./contactValidation";

const valid = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  message: "The merge tool dropped the last page of a 12-page file.",
};

describe("checkSubmission", () => {
  it("accepts an ordinary submission and returns the normalized value", () => {
    const result = checkSubmission(valid);
    expect(result.ok).toBe(true);
    expect(result.value).toEqual(valid);
  });

  it("trims surrounding whitespace on every field", () => {
    const result = checkSubmission({
      name: "  Ada  ",
      email: "  ada@example.com  ",
      message: `  ${valid.message}  `,
    });
    expect(result.ok).toBe(true);
    expect(result.value.name).toBe("Ada");
    expect(result.value.email).toBe("ada@example.com");
    expect(result.value.message).toBe(valid.message);
  });

  it("rejects missing fields with a reason naming the field", () => {
    expect(checkSubmission({ ...valid, name: "   " }).reason).toBe(ContactRejection.NAME_EMPTY);
    expect(checkSubmission({ ...valid, email: "" }).reason).toBe(ContactRejection.EMAIL_EMPTY);
    expect(checkSubmission({ ...valid, message: "" }).reason).toBe(
      ContactRejection.MESSAGE_EMPTY
    );
  });

  it("rejects non-string fields rather than coercing them", () => {
    // A JSON body is untrusted: `{"name": 42}` must not become "42".
    expect(checkSubmission({ ...valid, name: 42 }).reason).toBe(ContactRejection.NAME_EMPTY);
    expect(checkSubmission({ ...valid, email: { toString: () => "a@b.co" } }).reason).toBe(
      ContactRejection.EMAIL_EMPTY
    );
    expect(checkSubmission(null).ok).toBe(false);
    expect(checkSubmission(undefined).ok).toBe(false);
  });

  describe("email shape", () => {
    it("accepts the addresses a stricter regex would wrongly reject", () => {
      for (const email of [
        "ada+tools@example.com",
        "ada.lovelace@sub.example.co.uk",
        "o'hara@example.museum",
        "user_name@example-host.dev",
      ]) {
        expect(checkSubmission({ ...valid, email }).ok, email).toBe(true);
      }
    });

    it("rejects the ordinary typos", () => {
      for (const email of [
        "ada",
        "ada@",
        "@example.com",
        "ada@example",
        "ada example@x.com",
        "ada@@example.com",
      ]) {
        expect(checkSubmission({ ...valid, email }).reason, email).toBe(
          ContactRejection.EMAIL_MALFORMED
        );
      }
    });
  });

  describe("header injection", () => {
    it("rejects a newline in the email, which would forge a mail header", () => {
      // "a@b.com\nBcc: victim@example.com" is the classic vector — this field
      // lands in Reply-To.
      const result = checkSubmission({
        ...valid,
        email: "ada@example.com\nBcc: victim@example.com",
      });
      expect(result.ok).toBe(false);
      // Reported as malformed or injection — either way it never sends.
      expect([ContactRejection.EMAIL_MALFORMED, ContactRejection.HEADER_INJECTION]).toContain(
        result.reason
      );
    });

    it("rejects a newline in the name, which lands in the subject line", () => {
      expect(checkSubmission({ ...valid, name: "Ada\r\nSubject: spam" }).reason).toBe(
        ContactRejection.HEADER_INJECTION
      );
    });

    it("allows newlines in the message, which is a body and not a header", () => {
      expect(checkSubmission({ ...valid, message: "Line one.\nLine two, with detail." }).ok).toBe(
        true
      );
    });
  });

  describe("length limits", () => {
    it("accepts values exactly at each boundary", () => {
      // The boundary belongs to the accepted side — a field documented as
      // "up to N" that rejects at exactly N is a bug report waiting to happen.
      expect(checkSubmission({ ...valid, name: "a".repeat(MAX_NAME_LENGTH) }).ok).toBe(true);
      expect(checkSubmission({ ...valid, message: "a".repeat(MIN_MESSAGE_LENGTH) }).ok).toBe(true);
      expect(checkSubmission({ ...valid, message: "a".repeat(MAX_MESSAGE_LENGTH) }).ok).toBe(true);
    });

    it("rejects one character past each boundary", () => {
      expect(checkSubmission({ ...valid, name: "a".repeat(MAX_NAME_LENGTH + 1) }).reason).toBe(
        ContactRejection.NAME_TOO_LONG
      );
      expect(
        checkSubmission({ ...valid, message: "a".repeat(MAX_MESSAGE_LENGTH + 1) }).reason
      ).toBe(ContactRejection.MESSAGE_TOO_LONG);
      expect(
        checkSubmission({ ...valid, message: "a".repeat(MIN_MESSAGE_LENGTH - 1) }).reason
      ).toBe(ContactRejection.MESSAGE_TOO_SHORT);
    });

    it("rejects an over-long email before testing its shape", () => {
      const long = `${"a".repeat(MAX_EMAIL_LENGTH)}@example.com`;
      expect(checkSubmission({ ...valid, email: long }).reason).toBe(
        ContactRejection.EMAIL_TOO_LONG
      );
    });
  });

  describe("spam heuristics", () => {
    it("rejects a filled honeypot without saying why", () => {
      const result = checkSubmission({ ...valid, website: "http://spam.example" });
      expect(result.ok).toBe(false);
      // Generic on purpose: naming the honeypot in the response is how the
      // check stops working.
      expect(result.reason).toBe(ContactRejection.SPAM);
      expect(rejectionMessage(result.reason)).not.toMatch(/honeypot|website|hidden/i);
    });

    it("ignores an empty or absent honeypot", () => {
      expect(checkSubmission({ ...valid, website: "" }).ok).toBe(true);
      expect(checkSubmission({ ...valid, website: "   " }).ok).toBe(true);
    });

    it("rejects a message that is mostly links", () => {
      const links = Array.from({ length: 5 }, (_, i) => `https://spam${i}.example`).join(" ");
      expect(checkSubmission({ ...valid, message: links }).reason).toBe(ContactRejection.SPAM);
    });

    it("allows a genuine bug report that cites a couple of URLs", () => {
      const message =
        "Shortening https://example.com/a returned an error, but https://example.com/b worked.";
      expect(checkSubmission({ ...valid, message }).ok).toBe(true);
    });
  });
});

describe("rejectionMessage", () => {
  it("has copy for every rejection reason", () => {
    for (const reason of Object.values(ContactRejection)) {
      expect(rejectionMessage(reason), reason).toBeTruthy();
      expect(rejectionMessage(reason), reason).not.toMatch(/undefined/);
    }
  });

  it("falls back to a generic message for an unknown reason", () => {
    expect(rejectionMessage("not_a_reason")).toBeTruthy();
  });
});

describe("notificationSubject", () => {
  it("includes the sender's name so an inbox list is scannable", () => {
    expect(notificationSubject("Ada")).toContain("Ada");
  });

  it("strips line breaks, which would otherwise forge a header", () => {
    const subject = notificationSubject("Ada\r\nBcc: victim@example.com");
    expect(subject).not.toMatch(/[\r\n]/);
  });

  it("clamps a very long name", () => {
    expect(notificationSubject("a".repeat(500)).length).toBeLessThan(MAX_NAME_LENGTH + 40);
  });

  it("stays sensible with no name at all", () => {
    expect(notificationSubject("")).toBeTruthy();
    expect(notificationSubject(null)).toBeTruthy();
  });
});

describe("escapeHtml", () => {
  it("neutralizes markup so a message can't inject HTML into our inbox", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"
    );
  });

  it("escapes ampersands before the entities it introduces", () => {
    // Order matters: escaping < first and & second would double-encode.
    expect(escapeHtml("Tom & Jerry <b>")).toBe("Tom &amp; Jerry &lt;b&gt;");
  });

  it("handles empty and nullish input", () => {
    expect(escapeHtml("")).toBe("");
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
});
