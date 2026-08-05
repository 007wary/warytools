// Short-code alphabet and generation, shared by the API route (creating
// codes) and the /s/[code] route (validating them before a DB lookup), so
// the two can't drift apart. The database mirrors this pattern in the
// `create_short_url` function's check.

// Excludes visually ambiguous characters (0/O, 1/I/l) so a code read off a
// printed page or dictated over a phone doesn't turn into a 404.
export const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export const CODE_LENGTH = 7;

export const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export function isValidShortCode(value) {
  return typeof value === "string" && CODE_PATTERN.test(value);
}

// Codes are generated from a CSPRNG, not Math.random(). Anyone can read any
// row (the redirect has to work for strangers, so reads are public), which
// means a predictable code generator lets someone enumerate other people's
// links. Math.random() is seeded predictably enough that observing a few
// codes can narrow the sequence; crypto.getRandomValues() has no such
// structure. 57^7 ≈ 1.95e12 keeps blind guessing impractical too.
//
// Rejection sampling avoids the modulo bias a plain `% alphabet.length`
// would introduce (256 % 57 != 0, so low characters would appear ~12% more
// often and shrink the effective keyspace).
export function generateCode(length = CODE_LENGTH, randomBytes = defaultRandomBytes) {
  const limit = Math.floor(256 / CODE_ALPHABET.length) * CODE_ALPHABET.length;
  let code = "";

  while (code.length < length) {
    const bytes = randomBytes(length);
    for (let i = 0; i < bytes.length && code.length < length; i++) {
      if (bytes[i] < limit) {
        code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
      }
    }
  }

  return code;
}

function defaultRandomBytes(n) {
  const buf = new Uint8Array(n);
  // Available in the browser, in Node 19+, and on the Vercel edge runtime.
  crypto.getRandomValues(buf);
  return buf;
}
