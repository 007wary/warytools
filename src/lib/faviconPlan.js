// What a favicon set actually contains, and the markup that wires it up.
//
// The scope call this file encodes: the tool outputs a *set*, not a file.
// Handing back one 32x32 .ico is what most "favicon generators" do, and it
// leaves the user with a browser tab icon and nothing for an iPhone home
// screen, an Android install prompt, or a high-DPI tab. They then go looking
// for a second tool. The zip below is the whole job, and the HTML snippet is
// the part people get wrong even when they have the right files.
//
// Kept as plain data + pure functions so it can be tested and so page.js can
// import it without pulling in canvas code.

// The pixel sizes that earn their place, and why each one is here. This list
// is deliberately short: every extra file is another line of <head> for a
// diminishing return, and the modern guidance has converged on far fewer
// icons than the 20-file sets that were standard a decade ago.
export const ICON_SIZES = [
  {
    size: 16,
    filename: "favicon-16x16.png",
    purpose: "Browser tab and bookmark bar at 1x.",
  },
  {
    size: 32,
    filename: "favicon-32x32.png",
    purpose: "Browser tab at 2x, and Windows taskbar shortcuts.",
  },
  // No standalone favicon-48x48.png. 48px matters — Chrome's desktop shortcut
  // and the Windows desktop both reach for it — but it is already carried
  // inside favicon.ico (see ICO_SIZES), which is where Windows actually reads
  // it from. Shipping it a second time as a loose PNG meant a file nothing in
  // headSnippet() referenced and no browser ever requested: one more thing to
  // upload, silently unused. The rule this encodes is that every file in the
  // zip must be reachable from the markup or by a documented fixed filename
  // (favicon.ico, apple-touch-icon.png, the manifest's own icon entries) —
  // asserted by the "produces no file the markup never references" test.
  {
    size: 180,
    filename: "apple-touch-icon.png",
    // Fixed name, not a size-suffixed one: iOS looks for exactly this path at
    // the site root even with no <link> tag, so the filename is load-bearing.
    // 180 is the iPhone Retina size and iOS downscales it for everything else.
    purpose: "iOS home screen. iOS looks for this exact filename.",
  },
  {
    size: 192,
    filename: "android-chrome-192x192.png",
    purpose: "Android home screen and the PWA install prompt.",
  },
  {
    size: 512,
    filename: "android-chrome-512x512.png",
    // Required by the manifest for the Android splash screen. Without a 512,
    // Chrome refuses to show the install prompt at all — a silent failure
    // people chase for hours.
    purpose: "Android splash screen. Chrome requires it to offer installation.",
  },
];

// The sizes packed inside favicon.ico. Multi-size rather than a lone 32x32
// because Windows picks per context — 16 in the tab, 32 in the taskbar, 48 on
// the desktop — and an .ico holding one size makes it upscale the others.
// Capped at 48: a 256px entry roughly triples the .ico's size to serve a
// context (the Windows "extra large icons" view) that a website's favicon
// never actually reaches.
export const ICO_SIZES = [16, 32, 48];

export const ICO_FILENAME = "favicon.ico";
export const MANIFEST_FILENAME = "site.webmanifest";

/**
 * Every PNG the generator renders, largest first.
 *
 * Rendering order matters for quality, not just tidiness: each size is drawn
 * from the source image directly rather than from the previous step, so this
 * is purely the order files land in the zip. Largest-first puts the icons
 * someone is most likely to inspect at the top of the archive listing.
 */
export function pngPlan() {
  return [...ICON_SIZES].sort((a, b) => b.size - a.size);
}

/** Every distinct pixel size that has to be rasterised, including the .ico's. */
export function allRenderSizes() {
  const sizes = new Set([...ICON_SIZES.map((icon) => icon.size), ...ICO_SIZES]);
  return [...sizes].sort((a, b) => a - b);
}

/**
 * The `<head>` markup for the generated set.
 *
 * Three deliberate omissions, because this snippet is copied verbatim and
 * every line in it has to still be correct in five years:
 *
 *   - No `<link rel="shortcut icon">`. "shortcut" was never a real relation;
 *     it's an IE-era artifact that modern parsers ignore.
 *   - No `msapplication-*` meta tags or browserconfig.xml. That's the Windows
 *     8 pinned-tile feature, which is gone.
 *   - No `sizes` attribute on the apple-touch-icon. iOS ignores it when only
 *     one is offered, and it invites people to prune the file it names.
 *
 * @param {object} [options]
 * @param {string} [options.themeColor] Hex colour for the address bar.
 * @returns {string}
 */
export function headSnippet({ themeColor = "#ffffff" } = {}) {
  return [
    `<link rel="icon" href="/${ICO_FILENAME}" sizes="any">`,
    `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">`,
    `<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">`,
    `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`,
    `<link rel="manifest" href="/${MANIFEST_FILENAME}">`,
    `<meta name="theme-color" content="${escapeHtmlAttribute(themeColor)}">`,
  ].join("\n");
}

/**
 * The web app manifest.
 *
 * Only the fields that do something for an icon set. A manifest is JSON served
 * to a parser, so the name is JSON-escaped by `JSON.stringify` rather than by
 * hand — the site name is user input and lands in a file the user publishes.
 *
 * The name fields are OMITTED when blank rather than emitted empty, and that
 * distinction is load-bearing. Chrome requires a non-empty `name` or
 * `short_name` before it will offer to install a site, and `"name": ""`
 * satisfies neither — it reads as "present and empty", which is a declared
 * answer rather than an absent one. Since the site name is an optional field in
 * the UI, emitting it empty meant the default path shipped a manifest that
 * silently disqualified itself from the install prompt this set exists to
 * enable, with nothing in any tool or log to say why. Same class of failure as
 * the missing 512px icon documented above: Chrome declines quietly.
 *
 * @param {object} [options]
 * @param {string} [options.name] Site name shown under the home-screen icon.
 * @param {string} [options.themeColor]
 * @param {string} [options.backgroundColor]
 * @returns {string} Pretty-printed JSON.
 */
export function manifestJson({
  name = "",
  themeColor = "#ffffff",
  backgroundColor = "#ffffff",
} = {}) {
  const trimmed = String(name || "").trim();

  return `${JSON.stringify(
    {
      ...(trimmed ? { name: trimmed, short_name: trimmed } : {}),
      icons: [
        { src: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
        {
          src: "/android-chrome-512x512.png",
          sizes: "512x512",
          type: "image/png",
          // "any maskable" lets Android crop the icon into whatever shape the
          // launcher uses. Declaring it maskable-only would be a lie unless the
          // artwork respects the safe zone, and declaring neither loses the
          // adaptive-icon treatment entirely.
          purpose: "any maskable",
        },
      ],
      theme_color: themeColor,
      background_color: backgroundColor,
      display: "standalone",
    },
    null,
    2
  )}\n`;
}

/**
 * The README that ships in the zip.
 *
 * Included because the files alone don't say where to put them, and "the site
 * root, not /images/" is the single most common reason a correctly generated
 * favicon doesn't appear.
 */
export function readmeText({ name = "" } = {}) {
  const trimmed = String(name || "").trim();
  const heading = trimmed ? `Favicons for ${trimmed}` : "Favicons";

  return `${heading}
${"=".repeat(heading.length)}

1. Upload every file in this zip to the ROOT of your website, so they sit at
   https://yoursite.com/favicon.ico — not inside /images/ or /assets/.
   iOS looks for /apple-touch-icon.png at the root by name, so moving that one
   breaks the home-screen icon even if the <link> tag points somewhere else.

2. Paste the block from ${"`"}head.html${"`"} into your page's <head>.

3. Hard-refresh to check it (Ctrl+F5, or Cmd+Shift+R on a Mac). Browsers cache
   favicons aggressively and will keep showing an old one — or the blank globe
   — long after the new file is live. A private window is the quickest way to
   see the truth.

Files
-----
${[...pngPlan()]
  .map((icon) => `  ${icon.filename.padEnd(28)}${icon.purpose}`)
  .join("\n")}
  ${ICO_FILENAME.padEnd(28)}Legacy and Windows. Contains ${ICO_SIZES.join(", ")}px.
  ${MANIFEST_FILENAME.padEnd(28)}Android install prompt and home-screen naming.
  head.html${" ".repeat(19)}The markup to paste. Not a file to upload.

Generated with wary.tools/image/favicon — everything ran in your browser.
`;
}

/** Minimal attribute escaping for values interpolated into the HTML snippet. */
function escapeHtmlAttribute(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// A hex colour is the only free-text field that reaches the manifest and the
// meta tag, so it's validated rather than trusted. Accepts #rgb and #rrggbb,
// normalising to the long lowercase form so the two files never disagree.
const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * @param {string} value
 * @param {string} fallback
 * @returns {string} A `#rrggbb` colour.
 */
export function normaliseHexColor(value, fallback = "#ffffff") {
  const text = String(value ?? "").trim();
  const match = HEX_PATTERN.exec(text);
  if (!match) return fallback;

  const digits = match[1].toLowerCase();
  if (digits.length === 3) {
    return `#${digits[0]}${digits[0]}${digits[1]}${digits[1]}${digits[2]}${digits[2]}`;
  }
  return `#${digits}`;
}
