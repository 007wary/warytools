import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts, PDFName, PDFObjectCopier } from "@cantoo/pdf-lib";
import {
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
  UNLOCK_SCOPE_NOTE,
  PERMISSIONS,
  PRESERVED_CATALOG_KEYS,
  passwordByteLength,
  validateNewPassword,
  validateOpenPassword,
  allPermissionsGranted,
  toSecurityPermissions,
  isEveryPermissionGranted,
  describeProtection,
  ratePassword,
  describeEncryptionError,
} from "./pdfEncryption";

describe("passwordByteLength", () => {
  it("counts ASCII as one byte each", () => {
    expect(passwordByteLength("secret")).toBe(6);
  });

  it("returns 0 for empty and non-strings", () => {
    expect(passwordByteLength("")).toBe(0);
    expect(passwordByteLength(undefined)).toBe(0);
    expect(passwordByteLength(null)).toBe(0);
  });

  // The reason this function exists rather than using .length: String.length
  // counts UTF-16 code units, so a password of emoji passes a naive
  // `length <= 127` check while overflowing the spec's 127-byte budget.
  it("counts multi-byte characters by their UTF-8 length", () => {
    expect(passwordByteLength("é")).toBe(2);
    expect(passwordByteLength("日本")).toBe(6);
    // A 4-byte astral character that String.length reports as 2.
    expect("🔒".length).toBe(2);
    expect(passwordByteLength("🔒")).toBe(4);
  });
});

describe("validateNewPassword", () => {
  it("accepts an ordinary password", () => {
    expect(validateNewPassword("hunter2!").ok).toBe(true);
  });

  it("rejects empty and non-strings", () => {
    expect(validateNewPassword("").ok).toBe(false);
    expect(validateNewPassword(undefined).ok).toBe(false);
  });

  it("rejects whitespace-only", () => {
    const result = validateNewPassword("     ");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/only spaces/i);
  });

  it(`rejects anything shorter than ${MIN_PASSWORD_LENGTH}`, () => {
    expect(validateNewPassword("abc").ok).toBe(false);
    expect(validateNewPassword("abcd").ok).toBe(true);
  });

  it("uses the supplied label in the message", () => {
    const result = validateNewPassword("", { label: "Owner password" });
    expect(result.error).toMatch(/^Owner password/);
  });

  // Measured in bytes, not characters — the boundary a caller is most likely
  // to get wrong.
  it("accepts exactly the byte limit and rejects one byte past it", () => {
    const atLimit = "a".repeat(MAX_PASSWORD_BYTES);
    expect(passwordByteLength(atLimit)).toBe(MAX_PASSWORD_BYTES);
    expect(validateNewPassword(atLimit).ok).toBe(true);

    expect(validateNewPassword("a".repeat(MAX_PASSWORD_BYTES + 1)).ok).toBe(false);
  });

  it("rejects a short-in-characters but over-long-in-bytes password", () => {
    // 64 two-byte characters = 128 bytes, but String.length is only 64.
    const password = "é".repeat(64);
    expect(password.length).toBeLessThan(MAX_PASSWORD_BYTES);
    const result = validateNewPassword(password);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/128/);
  });
});

describe("validateOpenPassword", () => {
  it("requires something", () => {
    expect(validateOpenPassword("").ok).toBe(false);
    expect(validateOpenPassword(undefined).ok).toBe(false);
  });

  // Deliberately permissive: a file encrypted elsewhere may carry a password
  // this module would refuse to write, and rejecting it would make a valid
  // document permanently un-openable here.
  it("accepts passwords the encrypt side would reject", () => {
    expect(validateOpenPassword("a").ok).toBe(true);
    expect(validateOpenPassword("   ").ok).toBe(true);
    expect(validateOpenPassword("x".repeat(500)).ok).toBe(true);
  });
});

describe("toSecurityPermissions", () => {
  it("grants everything by default", () => {
    const result = toSecurityPermissions(allPermissionsGranted());
    expect(result.copying).toBe(true);
    expect(result.modifying).toBe(true);
    expect(result.annotating).toBe(true);
  });

  // Not a boolean in the spec at revision >= 3 — it's a resolution.
  it("maps allowed printing to highResolution, not true", () => {
    expect(toSecurityPermissions({ printing: true }).printing).toBe("highResolution");
    expect(toSecurityPermissions({ printing: false }).printing).toBe(false);
  });

  it("always grants accessibility and form filling", () => {
    const locked = toSecurityPermissions({
      printing: false,
      copying: false,
      modifying: false,
      annotating: false,
    });
    // Revoking this flag only breaks screen readers, so it is never offered.
    expect(locked.contentAccessibility).toBe(true);
    expect(locked.fillingForms).toBe(true);
  });

  it("ties documentAssembly to modifying", () => {
    expect(toSecurityPermissions({ modifying: true }).documentAssembly).toBe(true);
    expect(toSecurityPermissions({ modifying: false }).documentAssembly).toBe(false);
  });

  it("treats a missing key as granted, so a partial state can't silently revoke", () => {
    const result = toSecurityPermissions({});
    expect(result.copying).toBe(true);
    expect(result.printing).toBe("highResolution");
  });
});

describe("isEveryPermissionGranted", () => {
  it("is true for the default state", () => {
    expect(isEveryPermissionGranted(allPermissionsGranted())).toBe(true);
    expect(isEveryPermissionGranted({})).toBe(true);
  });

  it("is false as soon as one is revoked", () => {
    for (const permission of PERMISSIONS) {
      expect(isEveryPermissionGranted({ [permission.id]: false })).toBe(false);
    }
  });
});

describe("describeProtection", () => {
  it("reports a no-op when nothing is set", () => {
    const result = describeProtection({ userPassword: "", restrict: false, permissions: {} });
    expect(result.tone).toBe("none");
    expect(result.lines.join(" ")).toMatch(/wouldn't protect/i);
  });

  it("reports a password-locked document", () => {
    const result = describeProtection({ userPassword: "secret", restrict: false });
    expect(result.tone).toBe("locked");
    expect(result.lines[0]).toMatch(/password is needed to open/i);
  });

  it("says plainly when no password is needed to open", () => {
    const result = describeProtection({
      userPassword: "",
      restrict: true,
      permissions: { printing: false },
    });
    expect(result.tone).toBe("restricted");
    expect(result.lines[0]).toMatch(/without a password/i);
  });

  // The caveat has to travel with the promise. Permission flags are a request
  // to the reader, not something encryption enforces.
  it("always carries the reader-dependence caveat when restrictions are set", () => {
    const result = describeProtection({
      userPassword: "secret",
      restrict: true,
      permissions: { copying: false },
    });
    expect(result.lines.join(" ")).toMatch(/deterrent, not a guarantee/i);
  });

  it("lists a single revoked permission without a conjunction", () => {
    const result = describeProtection({
      userPassword: "",
      restrict: true,
      permissions: { printing: false },
    });
    expect(result.lines[1]).toMatch(/^Printing will be switched off/);
  });

  it("joins several revoked permissions readably", () => {
    const result = describeProtection({
      userPassword: "",
      restrict: true,
      permissions: { printing: false, copying: false, modifying: false },
    });
    expect(result.lines[1]).toMatch(/printing, copying text and editing/i);
  });

  it("ignores permissions when restrict is off", () => {
    const result = describeProtection({
      userPassword: "",
      restrict: false,
      permissions: { printing: false },
    });
    expect(result.tone).toBe("none");
  });
});

describe("ratePassword", () => {
  it("is silent for an empty password", () => {
    expect(ratePassword("").score).toBe(0);
    expect(ratePassword("").label).toBe("");
  });

  it("rates a short password very weak", () => {
    expect(ratePassword("ab1").label).toBe("Very weak");
  });

  // The lesson the meter should teach: length beats character classes.
  it("rates a long passphrase above a short complex one", () => {
    const passphrase = ratePassword("correct horse battery staple");
    const complex = ratePassword("P@w1x!");
    expect(passphrase.score).toBeGreaterThan(complex.score);
    expect(passphrase.label).toBe("Strong");
  });

  it("gives an actionable hint whenever it isn't strong", () => {
    for (const password of ["abc", "abcdefgh", "abcdefghijk"]) {
      const rating = ratePassword(password);
      expect(rating.score).toBeLessThan(3);
      expect(rating.hint.length).toBeGreaterThan(0);
    }
  });

  it("adds no hint once strong", () => {
    expect(ratePassword("a-very-long-passphrase-indeed").hint).toBe("");
  });
});

describe("describeEncryptionError", () => {
  it("returns null for an unrecognised error so the caller can fall back", () => {
    expect(describeEncryptionError(new Error("something else"))).toBeNull();
    expect(describeEncryptionError(undefined)).toBeNull();
  });

  it("explains a wrong password without suggesting a reader", () => {
    const message = describeEncryptionError(new Error("Password incorrect"));
    expect(message).toMatch(/case-sensitive/i);
    // pdfFile's generic mapper says "open it in a PDF reader and remove the
    // password", which is nonsense inside the tool that removes passwords.
    expect(message).not.toMatch(/PDF reader/i);
  });

  it("recognises a missing password", () => {
    expect(
      describeEncryptionError(new Error("Input document to `PDFDocument.load` is encrypted."))
    ).toMatch(/needs a password/i);
  });
});

describe("UNLOCK_SCOPE_NOTE", () => {
  // The honesty constraint, asserted so it can't be quietly softened into an
  // implication that the tool cracks passwords.
  it("states that the password is required and nothing is cracked", () => {
    expect(UNLOCK_SCOPE_NOTE).toMatch(/you need the password/i);
    expect(UNLOCK_SCOPE_NOTE).toMatch(/does not recover, guess, or crack/i);
  });
});

// ── Round trips through real encryption ──────────────────────────────────────
//
// Per the lesson recorded in CLAUDE.md for placeNumber/toPdfBox: a test that
// recomputes this module's own arithmetic proves nothing. The permission
// mapping and the password rules only mean something if a real document,
// encrypted with them, actually behaves that way — so these drive
// @cantoo/pdf-lib end to end rather than asserting against the helpers.

async function makePdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([300, 300]).drawText("round trip", { x: 20, y: 150, size: 14, font });
  return doc.save();
}

async function encrypt(bytes, options) {
  const doc = await PDFDocument.load(bytes);
  doc.encrypt(options);
  return doc.save();
}

/**
 * The decryption strategy the worker uses, mirrored here so the tests exercise
 * the real thing rather than a simplification of it.
 *
 * Deliberately NOT `load(...).save()`: that preserves the source bytes and
 * leaves `/Encrypt` in the output. See PRESERVED_CATALOG_KEYS for the full
 * account of what was measured.
 */
async function decryptToCleanBytes(encrypted, password) {
  const src = await PDFDocument.load(encrypted, { password });
  const out = await PDFDocument.create();

  const pages = await out.copyPages(src, src.getPageIndices());
  pages.forEach((page) => out.addPage(page));

  const copier = PDFObjectCopier.for(src.context, out.context);
  for (const key of PRESERVED_CATALOG_KEYS) {
    const ref = src.catalog.get(PDFName.of(key));
    if (ref) out.catalog.set(PDFName.of(key), copier.copy(ref));
  }

  return out.save({ useObjectStreams: true });
}

describe("encryption round trip", () => {
  it("locks a document so it can't be opened without the password", async () => {
    const encrypted = await encrypt(await makePdf(), { userPassword: "open-sesame" });

    await expect(PDFDocument.load(encrypted)).rejects.toThrow();
  });

  it("maps a no-password load failure to the right message", async () => {
    const encrypted = await encrypt(await makePdf(), { userPassword: "open-sesame" });

    let message = null;
    try {
      await PDFDocument.load(encrypted);
    } catch (error) {
      message = describeEncryptionError(error);
    }
    expect(message).toMatch(/needs a password/i);
  });

  it("maps a wrong password to the right message", async () => {
    const encrypted = await encrypt(await makePdf(), { userPassword: "open-sesame" });

    let message = null;
    try {
      await PDFDocument.load(encrypted, { password: "not-it" });
    } catch (error) {
      message = describeEncryptionError(error);
    }
    expect(message).toMatch(/didn't work/i);
  });

  it("opens with the correct user password", async () => {
    const encrypted = await encrypt(await makePdf(), { userPassword: "open-sesame" });

    const opened = await PDFDocument.load(encrypted, { password: "open-sesame" });
    expect(opened.getPageCount()).toBe(1);
  });

  it("opens with the owner password too", async () => {
    const encrypted = await encrypt(await makePdf(), {
      userPassword: "user-pw",
      ownerPassword: "owner-pw",
    });

    const opened = await PDFDocument.load(encrypted, { password: "owner-pw" });
    expect(opened.getPageCount()).toBe(1);
  });

  // The whole promise of Unlock PDF: what comes out must open with no password
  // anywhere, in any reader — not merely in this library.
  it("produces a genuinely decrypted file that needs no password", async () => {
    const encrypted = await encrypt(await makePdf(), { userPassword: "open-sesame" });

    const decrypted = await decryptToCleanBytes(encrypted, "open-sesame");

    const reopened = await PDFDocument.load(decrypted);
    expect(reopened.getPageCount()).toBe(1);
    // The assertion that matters, and the one a naive implementation fails:
    // the BYTES must not declare encryption, not merely be loadable here.
    expect(Buffer.from(decrypted).includes("/Encrypt")).toBe(false);
  });

  // Guards the trap this pipeline actually fell into. `load(...).save()` looks
  // like it works — the result reloads without a password — while leaving
  // /Encrypt in the file for every other reader to trip over.
  it("load-then-save is NOT sufficient, which is why the rebuild exists", async () => {
    const encrypted = await encrypt(await makePdf(), { userPassword: "open-sesame" });

    const naive = await (await PDFDocument.load(encrypted, { password: "open-sesame" })).save();

    expect(Buffer.from(naive).includes("/Encrypt")).toBe(true);
  });

  // The owner-password-only case, which is where "unlock" tools overclaim. Such
  // a file is NOT encrypted against reading, which is exactly why every reader
  // opens it without prompting — and why the tool can strip it with no password.
  it("strips owner-only restrictions without needing a password", async () => {
    const restricted = await encrypt(await makePdf(), {
      ownerPassword: "owner-only",
      permissions: toSecurityPermissions({ printing: false, copying: false }),
    });

    const freed = await decryptToCleanBytes(restricted, "");

    expect(Buffer.from(freed).includes("/Encrypt")).toBe(false);
    expect((await PDFDocument.load(freed)).getPageCount()).toBe(1);
  });

  // The cost of the rebuild, and the reason PRESERVED_CATALOG_KEYS exists. A
  // plain copyPages drops form fields silently — a fillable form would come
  // back as a flat picture of one, with nothing to say so.
  it("preserves form fields through the rebuild", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([300, 300]);
    page.drawText("form", { x: 20, y: 200, size: 14, font });
    doc.getForm().createTextField("contract.name").addToPage(page, {
      x: 20,
      y: 60,
      width: 200,
      height: 24,
    });
    doc.getForm().createCheckBox("contract.agree").addToPage(page, {
      x: 240,
      y: 60,
      width: 20,
      height: 20,
    });

    const encrypted = await encrypt(await doc.save(), { userPassword: "open-sesame" });
    const decrypted = await decryptToCleanBytes(encrypted, "open-sesame");

    const reopened = await PDFDocument.load(decrypted);
    expect(reopened.getForm().getFields().map((field) => field.getName()).sort()).toEqual([
      "contract.agree",
      "contract.name",
    ]);
  });

  it("keeps every page of a multi-page document in order", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (let i = 0; i < 6; i++) {
      doc.addPage([300, 300]).drawText(`page ${i}`, { x: 20, y: 150, size: 14, font });
    }

    const encrypted = await encrypt(await doc.save(), { userPassword: "open-sesame" });
    const decrypted = await decryptToCleanBytes(encrypted, "open-sesame");

    expect((await PDFDocument.load(decrypted)).getPageCount()).toBe(6);
  });

  it("writes an /Encrypt dictionary when protecting", async () => {
    const encrypted = await encrypt(await makePdf(), {
      userPassword: "open-sesame",
      permissions: toSecurityPermissions(allPermissionsGranted()),
    });
    expect(Buffer.from(encrypted).includes("/Encrypt")).toBe(true);
  });

  // Proves toSecurityPermissions produces something the library accepts for
  // every combination the UI can generate, rather than throwing on one of the
  // sixteen a user could stumble into.
  it("accepts every permission combination the UI can produce", async () => {
    const bytes = await makePdf();

    for (let mask = 0; mask < 1 << PERMISSIONS.length; mask++) {
      const state = {};
      PERMISSIONS.forEach((permission, index) => {
        state[permission.id] = Boolean(mask & (1 << index));
      });

      const encrypted = await encrypt(bytes, {
        userPassword: "open-sesame",
        ownerPassword: "owner-pw",
        permissions: toSecurityPermissions(state),
      });

      const opened = await PDFDocument.load(encrypted, { password: "open-sesame" });
      expect(opened.getPageCount()).toBe(1);
    }
  });

  it("round-trips a multi-byte password at the byte limit", async () => {
    // 63 two-byte characters = 126 bytes, just inside the spec's budget.
    const password = "é".repeat(63);
    expect(validateNewPassword(password).ok).toBe(true);

    const encrypted = await encrypt(await makePdf(), { userPassword: password });
    const opened = await PDFDocument.load(encrypted, { password });
    expect(opened.getPageCount()).toBe(1);
  });
});
