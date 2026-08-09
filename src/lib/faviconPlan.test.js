import { describe, it, expect } from "vitest";
import {
  ICON_SIZES,
  ICO_SIZES,
  ICO_FILENAME,
  MANIFEST_FILENAME,
  pngPlan,
  allRenderSizes,
  headSnippet,
  manifestJson,
  readmeText,
  normaliseHexColor,
} from "./faviconPlan";
import { MAX_ICO_SIZE } from "./icoEncoder";

describe("the icon set", () => {
  it("gives every icon a unique filename and a stated purpose", () => {
    const filenames = ICON_SIZES.map((icon) => icon.filename);
    expect(new Set(filenames).size).toBe(filenames.length);

    ICON_SIZES.forEach((icon) => {
      expect(icon.purpose.length).toBeGreaterThan(0);
      expect(Number.isInteger(icon.size)).toBe(true);
      expect(icon.size).toBeGreaterThan(0);
    });
  });

  // iOS fetches /apple-touch-icon.png by that exact name even when no <link>
  // tag names it, so renaming this file silently breaks the home-screen icon
  // for anyone who trusted the convention over the markup.
  it("keeps the apple-touch-icon at its fixed conventional filename", () => {
    const apple = ICON_SIZES.find((icon) => icon.filename === "apple-touch-icon.png");
    expect(apple).toBeDefined();
    expect(apple.size).toBe(180);
  });

  // Chrome will not offer the install prompt without a 512px manifest icon,
  // and it says nothing when it declines to.
  it("includes the 192 and 512 sizes Android requires", () => {
    const sizes = ICON_SIZES.map((icon) => icon.size);
    expect(sizes).toContain(192);
    expect(sizes).toContain(512);
  });

  it("keeps every .ico size within what the format can express", () => {
    ICO_SIZES.forEach((size) => {
      expect(size).toBeLessThanOrEqual(MAX_ICO_SIZE);
    });
  });

  it("plans PNGs largest first, losing none of them", () => {
    const plan = pngPlan();
    expect(plan).toHaveLength(ICON_SIZES.length);

    const sizes = plan.map((icon) => icon.size);
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
  });

  it("renders every size the PNGs and the .ico need, deduplicated and ascending", () => {
    const rendered = allRenderSizes();

    [...ICON_SIZES.map((icon) => icon.size), ...ICO_SIZES].forEach((size) => {
      expect(rendered).toContain(size);
    });

    expect(new Set(rendered).size).toBe(rendered.length);
    expect(rendered).toEqual([...rendered].sort((a, b) => a - b));
  });
});

describe("headSnippet", () => {
  it("references files the generator actually produces", () => {
    const html = headSnippet();

    // Every href in the snippet must name a file in the zip. A snippet that
    // points at a file the tool never wrote is a 404 the user only finds in
    // production.
    const hrefs = [...html.matchAll(/href="\/([^"]+)"/g)].map((match) => match[1]);
    const produced = new Set([
      ...ICON_SIZES.map((icon) => icon.filename),
      ICO_FILENAME,
      MANIFEST_FILENAME,
    ]);

    expect(hrefs.length).toBeGreaterThan(0);
    hrefs.forEach((href) => expect(produced.has(href)).toBe(true));
  });

  it("omits the dead IE and Windows 8 markup", () => {
    const html = headSnippet();

    expect(html).not.toMatch(/shortcut icon/i);
    expect(html).not.toMatch(/msapplication/i);
    expect(html).not.toMatch(/browserconfig/i);
  });

  it("escapes a colour that tries to close the attribute", () => {
    const html = headSnippet({ themeColor: '"><script>alert(1)</script>' });

    expect(html).not.toMatch(/<script>/);
    expect(html).toContain("&quot;");
  });
});

describe("manifestJson", () => {
  it("produces valid JSON naming the two Android icons", () => {
    const parsed = JSON.parse(manifestJson({ name: "Acme" }));

    expect(parsed.name).toBe("Acme");
    expect(parsed.short_name).toBe("Acme");
    expect(parsed.icons.map((icon) => icon.src)).toEqual([
      "/android-chrome-192x192.png",
      "/android-chrome-512x512.png",
    ]);
    expect(parsed.icons[1].purpose).toBe("any maskable");
  });

  it("stays valid JSON when the site name carries quotes or newlines", () => {
    const json = manifestJson({ name: 'He said "hi"\nthen left' });
    expect(() => JSON.parse(json)).not.toThrow();
    expect(JSON.parse(json).name).toBe('He said "hi"\nthen left');
  });

  it("trims the name and tolerates it being absent", () => {
    expect(JSON.parse(manifestJson({ name: "  Acme  " })).name).toBe("Acme");
    expect(JSON.parse(manifestJson()).name).toBe("");
  });

  it("carries the colours through", () => {
    const parsed = JSON.parse(
      manifestJson({ themeColor: "#101010", backgroundColor: "#f0f0f0" })
    );

    expect(parsed.theme_color).toBe("#101010");
    expect(parsed.background_color).toBe("#f0f0f0");
  });
});

describe("readmeText", () => {
  it("names every file in the zip", () => {
    const text = readmeText({ name: "Acme" });

    ICON_SIZES.forEach((icon) => expect(text).toContain(icon.filename));
    expect(text).toContain(ICO_FILENAME);
    expect(text).toContain(MANIFEST_FILENAME);
  });

  it("leads with the root-directory instruction and the cache caveat", () => {
    const text = readmeText();

    expect(text).toMatch(/root/i);
    expect(text).toMatch(/cache/i);
  });
});

describe("normaliseHexColor", () => {
  it("expands shorthand and lowercases", () => {
    expect(normaliseHexColor("#FFF")).toBe("#ffffff");
    expect(normaliseHexColor("#AbC")).toBe("#aabbcc");
    expect(normaliseHexColor("#1A2B3C")).toBe("#1a2b3c");
  });

  it("accepts a missing hash", () => {
    expect(normaliseHexColor("1a2b3c")).toBe("#1a2b3c");
  });

  it("falls back rather than emitting anything unvalidated", () => {
    // These land in a JSON file and an HTML attribute the user publishes, so
    // "nearly a colour" has to become the fallback, not pass through.
    ["", "  ", "red", "#12345", "#1234567", "rgb(0,0,0)", null, undefined, "#12g"].forEach(
      (value) => {
        expect(normaliseHexColor(value, "#000000")).toBe("#000000");
      }
    );
  });
});
