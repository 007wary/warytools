import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Per-instance sliding window. Resets on cold start and isn't shared across
// serverless instances — a speed bump against scripted abuse, not a hard cap.
// For durable enforcement, add a Supabase-side rate limit (see CLAUDE.md note).
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;
const hits = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  timestamps.push(now);
  hits.set(ip, timestamps);

  if (hits.size > 5000) {
    for (const [key, arr] of hits) {
      if (arr.every((t) => now - t >= WINDOW_MS)) hits.delete(key);
    }
  }

  return timestamps.length > MAX_PER_WINDOW;
}

function getClientIp(req) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://warytools.com";
const SITE_ORIGIN = new URL(SITE_URL).origin;

function isValidHttpUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  // Block shortening our own /s/ links — prevents redirect chains/loops
  // and stops the shortener being used to obscure other short links.
  // Mirrors the client-side check in UrlShortenerClient.js.
  if (url.origin === SITE_ORIGIN && url.pathname.startsWith("/s/")) {
    return false;
  }

  return true;
}

// Must match the character class enforced by the "short_urls" RLS insert
// policy, which excludes visually ambiguous characters (0, 1, I, O, l).
function generateCode(length = 7) {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function POST(req) {
  const ip = getClientIp(req);

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many links created. Please wait a minute and try again." },
      { status: 429 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const longUrl = typeof body?.url === "string" ? body.url.trim() : "";

  if (!longUrl || longUrl.length > 2048 || !isValidHttpUrl(longUrl)) {
    return NextResponse.json(
      { error: "Please enter a valid http:// or https:// URL." },
      { status: 400 }
    );
  }

  let shortCode = "";
  let inserted = null;
  for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
    shortCode = generateCode();
    const { data, error } = await supabase
      .from("short_urls")
      .insert({ short_code: shortCode, long_url: longUrl, clicks: 0 })
      .select()
      .single();

    if (!error) {
      inserted = data;
      break;
    }
    // 23505 = unique_violation on short_code; retry with a new code.
    if (error.code !== "23505") {
      Sentry.captureException(error, { extra: { shortCode } });
      return NextResponse.json(
        { error: "Could not create short link. Please try again." },
        { status: 500 }
      );
    }
  }

  if (!inserted) {
    Sentry.captureMessage("Exhausted short-code retry attempts", "error");
    return NextResponse.json(
      { error: "Could not create short link. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ shortCode: inserted.short_code, longUrl: inserted.long_url });
}
