// Speculative warmup for the four scale-to-zero converter containers.
//
// WHY THIS EXISTS
//
// All four converters run `min_machines_running = 0` (see each service's
// fly.toml), which is the right trade for bursty traffic: an always-on machine
// bills continuously to serve occasional conversions. The cost is a cold start,
// and it is not small — measured on the first real deploy of the Word converter,
// a cold request is ~30s end to end, of which ~12s is soffice warming before the
// port even opens. The user is looking at a spinner for that entire time with
// nothing to explain it.
//
// The fix is not an always-on machine and not an external cron pinger. Both
// spend money continuously to solve a problem that only exists at the moment
// someone actually converts something. Instead this fires a health check at the
// container the instant a user PICKS A FILE — which is a genuine statement of
// intent, and buys the seconds the user spends reviewing the filename and
// reaching for the Convert button. Fly's `auto_start_machines` boots the machine
// on that request, so by the time the real upload lands the container is warm or
// most of the way there.
//
// The trade is a machine-second or two per file selection that never becomes a
// conversion. That is bounded by the rate limit below and is far cheaper than
// keeping four LibreOffice containers resident around the clock.
//
// WHY THE TARGETS ARE NAMED HERE AND NOT PASSED IN
//
// The converter URLs and secrets are server-only, deliberately not
// NEXT_PUBLIC_ (see CLAUDE.md). A client that could name an arbitrary warmup
// target would be a free "start Wary's containers" button for anyone reading the
// bundle, and worse, an open proxy for probing arbitrary hosts from our server.
// So the client sends a short opaque KEY, and this module is the only place that
// maps a key onto a URL. An unknown key resolves to nothing and the route
// refuses it.

/**
 * The warmable converters, keyed by the token the client is allowed to send.
 *
 * Keys are deliberately short and opaque-ish rather than being the env var
 * names: the client bundle is public, and there is no reason to publish our
 * internal variable naming alongside it.
 *
 * Note these are read at call time rather than captured at module scope. The
 * routes that import this are statically analysed during the build, when the
 * env vars may legitimately be absent — the same constraint that makes every
 * Supabase client here a function rather than a module-scope constant.
 */
const CONVERTERS = {
  "pdf-to-word": () => process.env.PDF_CONVERTER_URL,
  "word-to-pdf": () => process.env.WORD_CONVERTER_URL,
  "powerpoint-to-pdf": () => process.env.POWERPOINT_CONVERTER_URL,
  "excel-to-pdf": () => process.env.EXCEL_CONVERTER_URL,
};

/** Every valid warmup key. Exported for the route's validation and for tests. */
export const WARMUP_KEYS = Object.freeze(Object.keys(CONVERTERS));

/**
 * How long to wait for the container before giving up.
 *
 * Deliberately SHORTER than a cold boot takes (~30s). We are not waiting for the
 * machine to become healthy — Fly starts it on the inbound request whether or
 * not we stay to watch. Holding a Vercel function open for 30s to observe a boot
 * we already triggered would bill us twice for one warmup. Five seconds is
 * enough to catch a machine that was already warm and report it.
 */
export const WARMUP_TIMEOUT_MS = 5000;

/**
 * Resolve a client-supplied key to a converter's health URL.
 *
 * @param {string} key
 * @returns {string | null} The /health URL, or null if the key is unknown or
 *   that converter is not configured in this environment.
 */
export function warmupTargetFor(key) {
  // Guard the prototype chain explicitly: a key of "constructor" or
  // "__proto__" would otherwise resolve to an inherited function and be called
  // as though it were a configured converter.
  if (!Object.prototype.hasOwnProperty.call(CONVERTERS, key)) return null;

  const base = CONVERTERS[key]();
  if (!base) return null;

  try {
    // Parsed rather than concatenated so a malformed env var fails here, where
    // it is a clean null, rather than inside fetch as an unhandled throw.
    return new URL("/health", base).toString();
  } catch {
    return null;
  }
}
