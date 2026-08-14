import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { isRateLimitDbConfigured, rateLimitDb } from "@/lib/rateLimitDb";
import { SITE_URL } from "@/lib/siteUrl";
import {
  WARMUP_KEYS,
  WARMUP_TIMEOUT_MS,
  warmupTargetFor,
} from "@/lib/converterWarmup";

// Wakes a scale-to-zero converter container ahead of a real conversion.
//
// See src/lib/converterWarmup.js for why this exists and why the target is
// named by an opaque key rather than a URL. In short: the converter URLs and
// secrets are server-only, so the browser must not be able to name a host — a
// route that forwarded an arbitrary target would be an open proxy for probing
// hosts from our infrastructure, which is a far worse bug than a slow tool.
//
// This route deliberately sends NO secret. /health is the one converter
// endpoint that needs none, and warming is not a privileged operation — the
// point is merely to make Fly's auto_start_machines boot the machine. Keeping
// the secret out of this path means a flaw here cannot become a way to spend
// conversion capacity.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Short by design. We trigger the boot and leave; we do not wait for it. See
// WARMUP_TIMEOUT_MS for why staying to watch would bill us twice.
export const maxDuration = 15;

const SITE_ORIGIN = new URL(SITE_URL).origin;

// Same salted-hash construction as the converter routes, with its own tag.
//
// The tag matters as much here as it does there: sharing "soffice" would mean a
// user's file selections ate the quota for their actual conversions, so picking
// a file five times would lock someone out of the tool they were about to use —
// turning a latency optimisation into a denial of service against ourselves.
function rateLimitBucket(req) {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded
    ? forwarded.split(",")[0].trim()
    : req.headers.get("x-real-ip") || "unknown";

  return createHash("sha256")
    .update(`${SITE_ORIGIN}:warmup:${ip}`)
    .digest("hex")
    .slice(0, 32);
}

// Every response is 202 with no body detail, whatever happened.
//
// A warmup is advisory: the client cannot act on the outcome, and the
// conversion that follows reports its own errors properly. Returning distinct
// statuses would leak which converters are configured and which are already
// warm — a free reconnaissance signal for no user benefit.
function accepted() {
  return new NextResponse(null, {
    status: 202,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(req) {
  let key;
  try {
    const body = await req.json();
    key = typeof body?.key === "string" ? body.key : null;
  } catch {
    return accepted();
  }

  if (!key || !WARMUP_KEYS.includes(key)) return accepted();

  // Fails CLOSED, like the converter routes: an unenforceable limit must not
  // silently become no limit. A warmup is cheap, but "cheap" times unbounded is
  // how a free tool acquires a bill nobody approved.
  if (!isRateLimitDbConfigured()) return accepted();

  try {
    const { data: allowed, error } = await rateLimitDb().rpc(
      "consume_pdf_conversion_quota",
      { p_bucket: rateLimitBucket(req) }
    );
    if (error || !allowed) return accepted();
  } catch {
    return accepted();
  }

  const target = warmupTargetFor(key);
  if (!target) return accepted();

  // Fire and forget, with a timeout. We do not await the boot: Fly starts the
  // machine on the inbound connection regardless of whether we stay to watch,
  // and every second spent waiting is a second of Vercel function time billed
  // to observe something already in motion.
  //
  // Errors are swallowed entirely rather than reported. A failed warmup is a
  // non-event — the conversion still works, it is just slower — and wiring it
  // to Sentry would turn every cold container into noise on a path whose whole
  // premise is that the container is asleep.
  try {
    await fetch(target, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(WARMUP_TIMEOUT_MS),
    });
  } catch {
    // Intentionally ignored — see above.
  }

  return accepted();
}
