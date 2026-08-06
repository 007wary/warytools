import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { SITE_URL } from "@/lib/siteUrl";
import {
  MAX_UPLOAD_BYTES,
  CONVERSION_TIMEOUT_MS,
  checkUploadSize,
  rejectionMessage,
} from "@/lib/wordToPdfLimits";

// Proxies a Word document to the LibreOffice converter in
// services/word-to-pdf and streams the PDF back.
//
// The second of the site's two routes that accept a user's file (the other is
// /api/pdf-to-word). Both are exceptions to "nothing is uploaded", and the
// tool page and privacy policy say so plainly rather than burying it.
//
// The route is a real boundary here, unlike /api/shorten (where the database
// is). The converter's secret is server-only, so the service is unreachable
// except through this code path, and every check below is therefore the one
// that counts. It still doesn't trust the client: sizes are measured from the
// received body rather than read from a header, and the rate limit is
// enforced in Postgres so it survives a cold start.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Must exceed the converter's own 55s timeout, or Vercel kills the request
// while the container is still working and the user sees a platform error page
// instead of our message.
export const maxDuration = 90;

const CONVERTER_URL = process.env.WORD_CONVERTER_URL;
const CONVERTER_SECRET = process.env.WORD_CONVERTER_SECRET;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
);

const SITE_ORIGIN = new URL(SITE_URL).origin;

// Container signatures, mirroring detectDocumentFormat in src/lib/docxFile.js
// and documentExtension in the service. A .docx is a ZIP, so the header alone
// proves only "archive" — see docxFile.js for the full reasoning.
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OLE2_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
// Spelled as bytes, not as Buffer.from("{\\rtf"): in a JS string literal that
// escape collapses to a carriage return, giving { CR t f — which matches no
// real RTF file and silently rejected every one of them.
const RTF_MAGIC = Buffer.from([0x7b, 0x5c, 0x72, 0x74, 0x66]); // "{\rtf"

function looksLikeDocument(bytes) {
  if (bytes.length === 0) return false;

  if (bytes.subarray(0, OLE2_MAGIC.length).equals(OLE2_MAGIC)) return true;
  if (bytes.subarray(0, RTF_MAGIC.length).equals(RTF_MAGIC)) return true;

  if (bytes.subarray(0, ZIP_MAGIC.length).equals(ZIP_MAGIC)) {
    const head = bytes.subarray(0, 4096);
    // Spreadsheets and decks are refused here rather than forwarded: they are
    // ZIPs the converter would accept and then fail on, at the cost of a
    // container slot and a minute of the user's time.
    if (head.includes(Buffer.from("xl/")) || head.includes(Buffer.from("ppt/"))) {
      return false;
    }
    return true;
  }

  return false;
}

// Same construction as /api/pdf-to-word: a salted hash, not the IP. The
// limiter needs to tell callers apart, not identify them, and for a tool whose
// whole sensitivity is "we briefly hold your document" it would be incoherent
// to durably store the uploader's address next to it.
//
// The "soffice" tag is what gives this tool its own quota rather than sharing
// the PDF converter's. Both spend the same Postgres function, but a different
// tag hashes to a different bucket, so converting three PDFs does not use up
// someone's Word conversions.
function rateLimitBucket(req) {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded
    ? forwarded.split(",")[0].trim()
    : req.headers.get("x-real-ip") || "unknown";

  return createHash("sha256").update(`${SITE_ORIGIN}:soffice:${ip}`).digest("hex").slice(0, 32);
}

function reject(reason, status) {
  return NextResponse.json(
    { error: rejectionMessage(reason) },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req) {
  // Input validation runs before the converter-availability check, not after.
  // Ordering it the other way round would mean a malformed request takes a
  // different path depending on whether the container happens to be
  // configured — so the validation below would be untested in exactly the
  // environment where it matters, and a bad request would be reported as our
  // outage rather than as their error.

  // Cheap pre-check on the advertised length so an oversized upload is refused
  // before we read it. Content-Length is client-supplied and unreliable, so
  // this is an optimisation only — the authoritative check is on the received
  // bytes below, and the converter enforces its own cap independently.
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) {
    return reject("too_large", 413);
  }

  let bytes;
  try {
    bytes = Buffer.from(await req.arrayBuffer());
  } catch {
    return reject("unreadable", 400);
  }

  const size = checkUploadSize(bytes.length);
  if (!size.ok) {
    return reject(size.reason, size.reason === "too_large" ? 413 : 400);
  }

  // Keeps non-documents away from a large parsing codebase entirely rather
  // than relying on it to fail safely.
  if (!looksLikeDocument(bytes)) {
    return reject("not_a_document", 400);
  }

  // A missing deploy degrades rather than breaking: without these the tool is
  // simply unavailable, with a message that says so, instead of a stack trace.
  // Checked after validation (so a bad request is still a 400) but before the
  // quota spend, so an outage doesn't burn quota nobody got a conversion for.
  if (!CONVERTER_URL || !CONVERTER_SECRET) {
    return reject("unavailable", 503);
  }

  // Quota is consumed before the expensive work, so a caller who is over
  // budget costs us a single Postgres round-trip instead of a conversion.
  try {
    const { data: allowed, error } = await supabase.rpc("consume_pdf_conversion_quota", {
      p_bucket: rateLimitBucket(req),
    });

    if (error) {
      // Fail closed. If the limiter is unreachable we cannot tell an ordinary
      // user from someone hammering the endpoint, and the thing being
      // protected is a container that falls over under load.
      Sentry.captureException(error);
      return reject("unavailable", 503);
    }

    if (allowed === false) {
      return NextResponse.json(
        { error: rejectionMessage("rate_limited") },
        { status: 429, headers: { "Retry-After": "600", "Cache-Control": "no-store" } }
      );
    }
  } catch (error) {
    Sentry.captureException(error);
    return reject("unavailable", 503);
  }

  // AbortController rather than relying on fetch's default: without an explicit
  // timeout a hung converter holds the serverless function until the platform
  // kills it, which surfaces to the user as a generic 504 with no explanation.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONVERSION_TIMEOUT_MS);

  try {
    const response = await fetch(`${CONVERTER_URL}/convert`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Converter-Secret": CONVERTER_SECRET,
      },
      body: bytes,
      signal: controller.signal,
    });

    if (!response.ok) {
      let code = "convert_failed";
      try {
        const body = await response.json();
        code = body?.error || code;
      } catch {
        // Non-JSON error body (a platform-level 502 while the machine is
        // starting) — the status is all we have to go on.
      }

      if (response.status === 504 || code === "timeout") return reject("timeout", 504);
      if (response.status === 413) return reject("too_large", 413);

      // The converter distinguishes a password-protected file from one it
      // could not identify. Passing those through rather than flattening them
      // to "unreadable" is the difference between advice the user can act on
      // and a dead end.
      if (code === "encrypted") return reject("encrypted", 400);
      if (code === "not_a_document") return reject("not_a_document", 400);

      if (response.status === 400) return reject("unreadable", 400);

      // A 401 means our own secret is wrong — an operator error the user can
      // do nothing about, so it's reported to us and shown as unavailability.
      if (response.status === 401) {
        Sentry.captureMessage("Word converter rejected our secret", "error");
        return reject("unavailable", 503);
      }

      Sentry.captureMessage(`Word conversion failed: ${code}`, "error");
      return reject("convert_failed", 502);
    }

    const pdf = Buffer.from(await response.arrayBuffer());

    // A converter that returns 200 with an empty or implausibly small body has
    // failed in a way it didn't report. This is a real LibreOffice failure
    // mode, not a hypothetical: soffice exits 0 having written nothing more
    // than once, and handing that to the user would produce a file no reader
    // opens.
    if (pdf.length < 1024 || !pdf.subarray(0, 1024).includes(Buffer.from("%PDF-"))) {
      Sentry.captureMessage("Word converter returned something that is not a PDF", "error");
      return reject("convert_failed", 502);
    }

    return new NextResponse(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.length),
        // The download filename is applied client-side from the original file
        // name; sending it here would mean reflecting a user-controlled string
        // into a response header.
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error?.name === "AbortError") return reject("timeout", 504);

    Sentry.captureException(error);
    return reject("unavailable", 503);
  } finally {
    clearTimeout(timer);
  }
}
