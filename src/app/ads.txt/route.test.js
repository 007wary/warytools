import { describe, it, expect } from "vitest";
import { GET } from "./route";
import { ADSENSE_PUBLISHER_ID } from "@/lib/adsense";

async function body() {
  return (await GET()).text();
}

describe("ads.txt", () => {
  it("declares Google as an authorized direct seller", async () => {
    // The exact four-field record Google looks for. Asserted as a whole line
    // rather than field-by-field because the spec fixes the order, and a
    // reordered-but-complete line is a file that parses and verifies nothing.
    expect(await body()).toBe(
      `google.com, ${ADSENSE_PUBLISHER_ID}, DIRECT, f08c47fec0942fa0\n`
    );
  });

  it("uses the bare publisher id, not the ca- prefixed form", async () => {
    // The single most common way to ship an ads.txt that looks correct and
    // leaves the "earnings at risk" warning in place.
    const text = await body();
    expect(text).toContain("pub-5519794416240476");
    expect(text).not.toContain("ca-pub-");
  });

  it("serves as text/plain", async () => {
    // Crawlers may reject other content types outright.
    const res = await GET();
    expect(res.headers.get("Content-Type")).toMatch(/^text\/plain/);
  });

  it("ends with a newline", async () => {
    // Parsers treat the file as newline-delimited records; an unterminated
    // final line is tolerated unevenly across them.
    expect(await body()).toMatch(/\n$/);
  });

  it("serves ads.txt regardless of environment", async () => {
    // Unlike the tag itself, this file is inert — it authorises a seller, it
    // does not request an ad. Gating it on VERCEL_ENV would only create a way
    // for production to serve an empty one.
    const res = await GET();
    expect(res.status).toBe(200);
  });
});
