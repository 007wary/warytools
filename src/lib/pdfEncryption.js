// Shared rules for the two encryption tools: Unlock PDF and Protect PDF.
//
// Both directions of the PDF standard security handler live here because they
// are one feature with two faces, and the things that are easy to get wrong —
// what a password field will accept, what "remove the password" honestly means,
// which permission flags a reader actually honours — are identical on both
// sides. Keeping them together means the copy and the validation can't drift
// into telling a user two different stories.
//
// This module is deliberately dependency-free and pure so it can be tested in
// node: the encryption itself happens in the PDF worker (@cantoo/pdf-lib), and
// per CLAUDE.md, logic that guards a user input belongs in src/lib/ or it can't
// be covered at all.
//
// ── The honesty constraint that shapes this whole file ───────────────────────
//
// There are two different passwords in the PDF spec, and conflating them is how
// a tool ends up lying to people:
//
//   - A USER password (the "open" password) encrypts the content. Without it
//     the bytes cannot be read by anyone, including us.
//   - An OWNER password (the "permissions" password) leaves the content
//     readable by every conforming reader and merely *asks* them not to print
//     or copy. It is a request, not a lock.
//
// So Unlock PDF requires the user to supply the password. It does not, and must
// not imply it can, crack or recover anything — see UNLOCK_SCOPE_NOTE. What it
// genuinely does is decrypt a file you can already open and write it back out
// without encryption, which is the real, common need: a file you have the
// password for that you're tired of typing, or that a downstream tool refuses.
//
// The owner-password case is the one worth being precise about, because it is
// where "unlock" tools usually overclaim. Stripping owner-only restrictions
// requires no password at all — the content was never encrypted to begin with,
// which is exactly why every PDF reader opens such a file without prompting.
// Saying so plainly is more useful than implying a feat was performed.

/**
 * Catalog entries carried across when a document is rebuilt to strip encryption.
 *
 * ── Why a rebuild is needed at all ───────────────────────────────────────────
 *
 * Removing encryption is NOT "load with the password, then save". @cantoo's
 * `save()` preserves the source file's bytes and appends to them, so the output
 * still begins with the original document and still carries the trailer's
 * `/Encrypt 9 0 R` pointing at the old standard-security dictionary. This was
 * measured, not assumed: the re-saved file reloads without a password *in this
 * library* (it knows the content is already decrypted), while the bytes on disk
 * still declare themselves encrypted. Readers that trust that declaration
 * prompt for a password which no longer opens anything.
 *
 * None of the obvious escapes work — `save({ rewrite: true })`,
 * `useObjectStreams: false`, deleting the orphaned security dict, and clearing
 * `context.trailerInfo.Encrypt` were each tried and each still emitted
 * `/Encrypt`. The only route that yields a genuinely clean file is copying the
 * pages into a NEW document, whose context never had encryption.
 *
 * ── Why this list exists ─────────────────────────────────────────────────────
 *
 * `copyPages` into a fresh document is precisely the pattern CLAUDE.md warns
 * about, because it silently drops everything that hangs off the catalog rather
 * than off a page — bookmarks, form fields, named destinations. That was
 * confirmed here too: a document with a text field came back with zero fields.
 *
 * So the catalog entries are copied across explicitly with PDFObjectCopier,
 * which deep-copies the object graph into the new context. With `AcroForm`
 * carried over, the same test document keeps its fields. This is the difference
 * between a tool that quietly ruins a fillable form and one that doesn't.
 *
 * Order is irrelevant; absence is normal and skipped.
 */
export const PRESERVED_CATALOG_KEYS = [
  // Form fields. The one with teeth — losing it turns a fillable form into a
  // flat picture of a form, with nothing to indicate what happened.
  "AcroForm",
  // Bookmarks / the outline tree.
  "Outlines",
  // Named destinations, which internal links resolve through. Dropping this
  // leaves the links present but pointing nowhere.
  "Names",
  // "Open at page 3 / at this zoom".
  "OpenAction",
  // Roman-numeral front matter and similar labelling.
  "PageLabels",
  // Page layout and display preferences.
  "ViewerPreferences",
  // Embedded attachments live under Names, but the spec also allows a
  // collection dict for portfolios.
  "Collection",
  // Document-level structure tree — what screen readers use for reading order.
  // Dropping it degrades accessibility silently, so it travels with the rest.
  "StructTreeRoot",
  "MarkInfo",
  "Lang",
];

/**
 * Longest password we accept.
 *
 * Revision 6 (AES-256) hashes the UTF-8 password truncated to 127 bytes, so
 * anything past that is silently ignored by the spec itself — a user who typed
 * a 200-character passphrase would get a file that opens with the first 127
 * bytes, which is a surprise nobody wants at the moment they are locked out.
 * Refusing up front is honest; silently truncating is not.
 */
export const MAX_PASSWORD_BYTES = 127;

/**
 * Shortest password we'll write.
 *
 * Not a security threshold — a 4-character password is weak whatever we do —
 * but a guard against the empty/1-character slip, where someone tabs through
 * the field and ships a document they believe is protected. The strength meter
 * carries the actual message about weak passwords.
 */
export const MIN_PASSWORD_LENGTH = 4;

/**
 * The scope note shown on Unlock PDF, in the page prose AND the client.
 *
 * Exported rather than inlined so the two can't drift, and so the test suite can
 * assert the tool never renders without it.
 */
export const UNLOCK_SCOPE_NOTE =
  "This removes encryption from a PDF you can already open — you need the password. It does not recover, guess, or crack a password you don't have.";

/**
 * Byte length of a password as the PDF spec measures it.
 *
 * `String.length` counts UTF-16 code units, which undercounts every non-ASCII
 * character — an emoji or an accented passphrase can pass a `.length <= 127`
 * check and still overflow the spec's 127-BYTE budget. Measuring in UTF-8 is
 * what the revision-6 algorithm actually does.
 *
 * @param {string} password
 * @returns {number}
 */
export function passwordByteLength(password) {
  if (typeof password !== "string" || password === "") return 0;
  // TextEncoder is available in browsers, workers, and node >= 11.
  return new TextEncoder().encode(password).length;
}

/**
 * Validates a password the user is about to ENCRYPT with.
 *
 * Deliberately stricter than the unlock side: here we are writing a password
 * into a document someone may need years from now, so an unrepresentable or
 * accidentally-empty one is a trap. On the unlock side we validate almost
 * nothing, because the correct password is whatever the file was built with and
 * second-guessing it would lock out legitimate users.
 *
 * @param {string} password
 * @param {{label?: string}} [options]
 * @returns {{ok: true} | {ok: false, error: string}}
 */
export function validateNewPassword(password, { label = "Password" } = {}) {
  if (typeof password !== "string" || password.length === 0) {
    return { ok: false, error: `${label} is required.` };
  }

  // A password of only spaces is almost certainly an accident, and it is
  // impossible to communicate to whoever has to open the file later.
  if (password.trim().length === 0) {
    return { ok: false, error: `${label} can't be only spaces.` };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `${label} must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  const bytes = passwordByteLength(password);
  if (bytes > MAX_PASSWORD_BYTES) {
    return {
      ok: false,
      error: `${label} is too long — the PDF standard allows ${MAX_PASSWORD_BYTES} bytes, and this is ${bytes}. Accented characters and emoji count as more than one byte each.`,
    };
  }

  return { ok: true };
}

/**
 * Validates the password supplied to OPEN an encrypted file.
 *
 * Only rejects the empty string. Anything else is plausibly the real password,
 * and a file encrypted by another tool may well carry something this module
 * would refuse to *write* — rejecting it here would make a valid document
 * permanently un-openable by us for no reason.
 *
 * @param {string} password
 * @returns {{ok: true} | {ok: false, error: string}}
 */
export function validateOpenPassword(password) {
  if (typeof password !== "string" || password.length === 0) {
    return { ok: false, error: "Enter the PDF's password." };
  }
  return { ok: true };
}

/**
 * The permission switches Protect PDF exposes.
 *
 * A deliberately trimmed subset of the eight the spec defines. `fillingForms`
 * and `contentAccessibility` are always granted and never shown:
 *
 *   - Revoking contentAccessibility blocks screen readers. Adobe deprecated the
 *     flag for exactly that reason, and offering a switch whose only real effect
 *     is to break the document for blind users would be indefensible.
 *   - fillingForms without `modifying` is a confusing combination that mostly
 *     produces documents people can't use as intended.
 *
 * `documentAssembly` is likewise implied by `modifying` rather than given its
 * own switch — separating them yields eight combinations users can't reason
 * about, to control something readers honour inconsistently anyway.
 *
 * Order here is the order rendered.
 */
export const PERMISSIONS = [
  {
    id: "printing",
    label: "Printing",
    description: "Allow the document to be printed.",
  },
  {
    id: "copying",
    label: "Copying text",
    description: "Allow text and images to be selected and copied out.",
  },
  {
    id: "modifying",
    label: "Editing",
    description: "Allow page content to be changed, and pages added or removed.",
  },
  {
    id: "annotating",
    label: "Comments",
    description: "Allow notes, highlights, and other annotations to be added.",
  },
];

/** Every permission granted — the default, and what an owner password overrides. */
export function allPermissionsGranted() {
  return PERMISSIONS.reduce((acc, permission) => {
    acc[permission.id] = true;
    return acc;
  }, {});
}

/**
 * Turns the UI's flat switch state into the SecurityOptions shape.
 *
 * Two translations happen here that the caller shouldn't have to know:
 *
 *   - `printing` is not a boolean in the spec at revision >= 3. It is a
 *     resolution: 'highResolution' or 'lowResolution'. Passing `true` gets
 *     coerced somewhere unhelpful, so allowed printing is stated explicitly as
 *     high resolution — a "you may print, but only badly" default would be a
 *     strange thing to impose without asking.
 *   - `documentAssembly` follows `modifying`, per the note on PERMISSIONS.
 *
 * @param {Record<string, boolean>} state
 * @returns {object} SecurityOptions.permissions
 */
export function toSecurityPermissions(state = {}) {
  const modifying = state.modifying !== false;

  return {
    printing: state.printing !== false ? "highResolution" : false,
    copying: state.copying !== false,
    modifying,
    annotating: state.annotating !== false,
    // Always granted — see PERMISSIONS on why these aren't switches.
    fillingForms: true,
    contentAccessibility: true,
    documentAssembly: modifying,
  };
}

/**
 * True when the user has left every permission granted.
 *
 * Worth knowing because it changes what the tool should SAY. With everything
 * allowed and no user password, `encrypt()` still writes an /Encrypt dictionary,
 * but the document opens freely and restricts nothing — the user has performed
 * a no-op they may believe is protection. The client uses this to require at
 * least one of {a user password, a revoked permission} before enabling the
 * button, rather than handing back a file that does nothing.
 *
 * @param {Record<string, boolean>} state
 * @returns {boolean}
 */
export function isEveryPermissionGranted(state = {}) {
  return PERMISSIONS.every((permission) => state[permission.id] !== false);
}

/**
 * Describes what the chosen settings will actually do, in plain words.
 *
 * This exists because the user password / owner password distinction is the
 * single most misunderstood thing about PDF security, and a summary generated
 * from the real settings is far harder to misread than two checkboxes and some
 * static help text.
 *
 * @param {{userPassword: string, restrict: boolean, permissions: Record<string, boolean>}} settings
 * @returns {{tone: "locked"|"restricted"|"none", lines: string[]}}
 */
export function describeProtection({ userPassword = "", restrict = false, permissions = {} } = {}) {
  const hasUserPassword = userPassword.length > 0;
  const revoked = restrict
    ? PERMISSIONS.filter((permission) => permissions[permission.id] === false)
    : [];

  const lines = [];

  if (hasUserPassword) {
    lines.push("A password is needed to open this PDF. Without it the contents can't be read.");
  } else {
    lines.push("Anyone can open this PDF without a password.");
  }

  if (revoked.length > 0) {
    const names = revoked.map((permission) => permission.label.toLowerCase());
    const joined =
      names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
    lines.push(
      `${sentenceCase(joined)} will be switched off in PDF readers that honour these settings.`
    );
    // The caveat has to travel with the promise, not sit in a FAQ. Permission
    // flags are not enforced by encryption — they are a request, and plenty of
    // software ignores them.
    lines.push(
      "These restrictions rely on the PDF reader to respect them. They're a deterrent, not a guarantee — some software ignores them."
    );
  }

  if (!hasUserPassword && revoked.length === 0) {
    return { tone: "none", lines: ["This wouldn't protect the PDF in any way."] };
  }

  return { tone: hasUserPassword ? "locked" : "restricted", lines };
}

/**
 * Rates a password so the user gets feedback before committing to it.
 *
 * Not a security oracle and not presented as one: it's a nudge against the
 * four-digit-PIN reflex on a document that may be emailed around. Scoring is
 * deliberately simple and offline — length dominates, because it genuinely does.
 *
 * @param {string} password
 * @returns {{score: 0|1|2|3, label: string, hint: string}}
 */
export function ratePassword(password) {
  if (typeof password !== "string" || password.length === 0) {
    return { score: 0, label: "", hint: "" };
  }

  const classes =
    (/[a-z]/.test(password) ? 1 : 0) +
    (/[A-Z]/.test(password) ? 1 : 0) +
    (/[0-9]/.test(password) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(password) ? 1 : 0);

  // Length carries more weight than character classes: "correct horse battery
  // staple" beats "P@w1" by an enormous margin, and a meter that says otherwise
  // teaches the wrong lesson.
  if (password.length >= 16 || (password.length >= 12 && classes >= 3)) {
    return { score: 3, label: "Strong", hint: "" };
  }

  if (password.length >= 12 || (password.length >= 8 && classes >= 3)) {
    return {
      score: 2,
      label: "Reasonable",
      hint: "A longer passphrase of a few words would be stronger still.",
    };
  }

  if (password.length >= 8) {
    return {
      score: 1,
      label: "Weak",
      hint: "Short passwords are quick to break offline. Try a passphrase of three or four words.",
    };
  }

  return {
    score: 1,
    label: "Very weak",
    hint: "This would take moments to break. Use a passphrase of three or four words instead.",
  };
}

/**
 * Maps an encryption/decryption failure onto something the user can act on.
 *
 * The wrong-password case is the one that matters: describePdfError() in
 * pdfFile.js turns anything mentioning "password" into "open it in a reader and
 * remove the password", which is actively wrong advice inside a tool whose whole
 * job is that removal — and useless when the real problem is a typo. So this
 * runs first and pdfFile's mapper is the fallback.
 *
 * @param {unknown} error
 * @returns {string|null} Null when unrecognised, so the caller can fall back.
 */
export function describeEncryptionError(error) {
  const message = String(error?.message || error || "").toLowerCase();

  if (message.includes("password incorrect") || message.includes("incorrect password")) {
    return "That password didn't work. Check for typos — PDF passwords are case-sensitive.";
  }

  // pdf-lib's own guard when a file is encrypted and no password was supplied.
  if (message.includes("is encrypted")) {
    return "This PDF needs a password to open. Enter it above and try again.";
  }

  if (message.includes("unsupported") && message.includes("encrypt")) {
    return "This PDF uses an encryption scheme this tool doesn't support. It may use a certificate or a corporate policy rather than a password.";
  }

  return null;
}

function sentenceCase(text) {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
