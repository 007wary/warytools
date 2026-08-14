import { describe, expect, it } from "vitest";
import { adsAllowedInCsp, cspReportingEnabled, sentryCspReportUri } from "./cspReporting.mjs";
import { adsEnabled } from "./adsense";

// This file exists because the report-uri gate shipped broken twice and neither
// version had a test. next.config.mjs reads process.env at module scope, so
// securityHeaders.test.js — which imports the config — can only ever observe
// the environment the test runner happens to have. The branches that matter are
// the ones that only occur on a Vercel preview, so they were untestable there
// and went unverified through two attempted fixes.

// The environment shapes that actually occur, including the one that broke it.
const PRODUCTION = { VERCEL_ENV: "production", VERCEL_URL: "x.vercel.app", VERCEL: "1" };
const PREVIEW_FULL = { VERCEL_ENV: "preview", VERCEL_URL: "x.vercel.app", VERCEL: "1" };
const PREVIEW_BARE = {}; // the real failure: a preview build exposing none of them
const SELF_HOSTED = {};

describe("cspReportingEnabled", () => {
  it("reports on production", () => {
    expect(cspReportingEnabled(PRODUCTION)).toBe(true);
  });

  it("stays silent on a preview that exposes VERCEL_ENV", () => {
    expect(cspReportingEnabled(PREVIEW_FULL)).toBe(false);
  });

  // The regression test. Both shipped versions of this gate returned true here,
  // which is what produced the *.vercel.app reports of 2026-08-13 and -08-14.
  //
  // Reintroducing either breaks this:
  //   `!vercelEnv || vercelEnv === "production"`            -> true
  //   `onVercel(VERCEL_ENV||VERCEL_URL||VERCEL) && ...`     -> true
  it("stays silent when a preview build exposes NO Vercel variables", () => {
    expect(cspReportingEnabled(PREVIEW_BARE)).toBe(false);
  });

  it("does not infer 'on Vercel' from VERCEL_URL or VERCEL", () => {
    // A gate that infers Vercel-ness from these and then demands a positive
    // "production" would return false here too — but for the wrong reason, and
    // it would return TRUE for PREVIEW_BARE above. Pinned so the distinction
    // between the two shapes stays visible.
    expect(cspReportingEnabled({ VERCEL_URL: "x.vercel.app" })).toBe(false);
    expect(cspReportingEnabled({ VERCEL: "1" })).toBe(false);
  });

  it("treats any non-production VERCEL_ENV as non-reporting", () => {
    for (const env of ["preview", "development", "staging", ""]) {
      expect(cspReportingEnabled({ VERCEL_ENV: env })).toBe(false);
    }
  });

  it("is silent by default off production, self-hosted included", () => {
    // Deliberate: a self-hosted deploy cannot be distinguished from a bare
    // preview, and only one of the two should report. Costs a lost report on a
    // host the operator controls; avoids an unfixable flood.
    expect(cspReportingEnabled(SELF_HOSTED)).toBe(false);
  });

  it("honours the explicit opt-in", () => {
    expect(cspReportingEnabled({ CSP_REPORT_URI_ENABLED: "1" })).toBe(true);
    // Opt-in must be exact — a stray "true"/"0" should not silently enable it.
    expect(cspReportingEnabled({ CSP_REPORT_URI_ENABLED: "true" })).toBe(false);
    expect(cspReportingEnabled({ CSP_REPORT_URI_ENABLED: "0" })).toBe(false);
  });
});

describe("sentryCspReportUri", () => {
  const DSN = "https://abc123@o4511638510174208.ingest.de.sentry.io/4511836022833232";

  it("derives the security endpoint from the DSN", () => {
    expect(sentryCspReportUri(DSN)).toBe(
      "https://o4511638510174208.ingest.de.sentry.io/api/4511836022833232/security/?sentry_key=abc123",
    );
  });

  it("returns null rather than a broken URL", () => {
    // A malformed endpoint would drop every report while looking configured,
    // which is worse than having no directive at all.
    expect(sentryCspReportUri(undefined)).toBeNull();
    expect(sentryCspReportUri("")).toBeNull();
    expect(sentryCspReportUri("not-a-url")).toBeNull();
    expect(sentryCspReportUri("https://o123.ingest.sentry.io/456")).toBeNull(); // no key
    expect(sentryCspReportUri("https://abc@o123.ingest.sentry.io/")).toBeNull(); // no project
  });
});

describe("adsAllowedInCsp", () => {
  // The CSP and the component must agree. A policy that closes the ad hosts
  // while adsense.js renders the tag yields slots that are present and
  // permanently empty — reported as zero impressions, with nothing in any log.
  it("matches adsEnabled() for every environment shape", () => {
    for (const env of [PRODUCTION, PREVIEW_FULL, PREVIEW_BARE, SELF_HOSTED,
                       { VERCEL_ENV: "development" }, { VERCEL_ENV: "staging" }]) {
      expect(adsAllowedInCsp(env)).toBe(adsEnabled(env.VERCEL_ENV));
    }
  });

  it("closes ad hosts on a preview that exposes VERCEL_ENV", () => {
    expect(adsAllowedInCsp(PREVIEW_FULL)).toBe(false);
  });

  it("keeps ad hosts open for a self-hosted build", () => {
    expect(adsAllowedInCsp(SELF_HOSTED)).toBe(true);
  });
});
