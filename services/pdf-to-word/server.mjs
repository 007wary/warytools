// PDF -> DOCX conversion service. Node stdlib only, no dependencies.
//
// This runs behind the site's /api/pdf-to-word route, never exposed to the
// browser directly. It exists because DOCX reconstruction needs real layout
// analysis (grouping positioned glyphs back into paragraphs, headings, and
// tables) and no browser library does that.
//
// Threat model: every request body is a file from a stranger, handed to a large
// C++ codebase that has had parser CVEs. The mitigations below are load-bearing,
// not ceremony:
//   - a shared secret, so only our site can spend our CPU
//   - a hard byte cap enforced while streaming, so a huge body is dropped
//     rather than buffered
//   - a magic-byte check, so non-PDFs never reach the parser at all
//   - one isolated temp dir per request, removed in a finally
//   - a kill timeout, since a malformed file can hang the parser indefinitely
//   - a concurrency gate, since parallel conversions exhaust container memory
//
// Deploy notes are in README.md.

import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 7860 matches the Dockerfile default and what Hugging Face Spaces routes to.
// Every platform we deploy on sets PORT explicitly, so this fallback only
// applies when running the file directly — but it should still agree with the
// image, or local testing checks a different port than production serves.
const PORT = Number(process.env.PORT) || 7860;

// Must match PDF_CONVERTER_SECRET on the Next.js side. Absent means the service
// refuses to start rather than starting open — a converter that anyone can post
// to is a free CPU faucet attached to a bill we pay.
const SECRET = process.env.CONVERTER_SECRET;
if (!SECRET) {
  console.error("CONVERTER_SECRET is not set. Refusing to start an unauthenticated converter.");
  process.exit(1);
}

// Resolved relative to this file rather than hardcoded to /app, so the service
// runs the same way from a checkout as it does in the image.
//
// Checked at boot, not at first use. A missing convert.py used to be invisible
// until someone uploaded a document: the process started, /health answered
// {ok:true}, the platform marked the deploy healthy, and every conversion
// failed with a generic convert_failed. That is exactly the shape of outage
// that survives a deploy unnoticed, so it is now a startup failure — the same
// treatment CONVERTER_SECRET gets above, and for the same reason.
// fileURLToPath rather than import.meta.dirname: the image installs Node from
// Debian bookworm's apt, which is Node 18, and dirname only exists from 20.11.
// It would read as undefined there and throw inside path.join at boot.
const CONVERTER_SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "convert.py"
);
if (!existsSync(CONVERTER_SCRIPT)) {
  console.error(
    `convert.py is missing at ${CONVERTER_SCRIPT}. The image was built without it; ` +
      `see README.md ("Deploy"). Refusing to start a converter that cannot convert.`
  );
  process.exit(1);
}

// Mirrors MAX_UPLOAD_BYTES in src/lib/pdfToWordLimits.js. Duplicated rather
// than imported because this service deploys separately — but it is the
// authoritative one, since the route's copy is only as trustworthy as the route.
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

// The converter can hang rather than error on some malformed input. Slightly under
// the route's own timeout so the failure surfaces here, with the process
// actually killed, instead of the route walking away from a live conversion.
const CONVERT_TIMEOUT_MS = 55_000;

// The converter holds the whole document model in memory; a handful of large
// conversions at once is what gets the container OOM-killed. Queueing is the
// right answer over failing, since waiting briefly beats a 503.
const MAX_CONCURRENT = 2;
let active = 0;
const queue = [];

const PDF_MAGIC = Buffer.from("%PDF-");

function acquireSlot() {
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve) => queue.push(resolve));
}

function releaseSlot() {
  const next = queue.shift();
  if (next) next();
  else active--;
}

/**
 * Constant-time secret comparison.
 *
 * A plain === leaks the secret's prefix through response timing, which is
 * exactly the kind of thing that is only theoretically exploitable until it
 * isn't. Lengths are compared first because timingSafeEqual throws on a
 * mismatch — that length leak is unavoidable and harmless.
 */
function secretMatches(provided) {
  if (typeof provided !== "string") return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(SECRET);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Reads the request body with a hard ceiling.
 *
 * Enforced per-chunk while streaming rather than by trusting Content-Length:
 * that header is client-supplied and a lie is free.
 *
 * On overflow we stop accumulating immediately (so memory is bounded by the
 * limit, not by what the client chooses to send) but deliberately do NOT
 * destroy the socket. Destroying it drops the connection before the 413 is
 * written, so the caller sees a generic network failure and the user is told
 * "check your connection" for what is really "your file is too big". Instead
 * the remaining bytes are drained and discarded so the response can be
 * delivered on a still-open socket.
 */
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let overflowed = false;

    req.on("data", (chunk) => {
      total += chunk.length;

      if (overflowed) {
        // Draining costs bandwidth, so it isn't unlimited: past a modest
        // multiple of the cap the sender isn't an honest client with a big
        // file, and dropping the socket is the right answer after all.
        if (total > limit * 2) req.destroy();
        return;
      }

      if (total > limit) {
        overflowed = true;
        chunks.length = 0; // Release what we already buffered.
        return;
      }

      chunks.push(chunk);
    });

    req.on("end", () => {
      if (overflowed) {
        reject(Object.assign(new Error("too_large"), { code: "too_large" }));
        return;
      }
      resolve(Buffer.concat(chunks));
    });

    req.on("error", reject);
  });
}

// Failure tokens convert.py writes to stderr, mapped to the codes this
// service reports. Anything unrecognised is a generic failure.
const PYTHON_ERROR_CODES = {
  encrypted: "encrypted",
  empty: "empty",
  failed: "convert_failed",
};

function runConverter(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "python3",
      [CONVERTER_SCRIPT, inputPath, outputPath],
      { timeout: CONVERT_TIMEOUT_MS, killSignal: "SIGKILL", maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (!error) {
          // Exit 0 with a "partial" token means pages were dropped. It is a
          // success — the user gets a document — but a qualified one, so the
          // flag travels to the route and on to the UI. Swallowing it here
          // would present an incomplete document as a clean conversion.
          const token = String(stderr || "").trim().split("\n").pop();
          resolve({ partial: token === "partial" });
          return;
        }

        // execFile surfaces a timeout kill as a signal, not an exit code.
        if (error.killed || error.signal === "SIGKILL") {
          reject(Object.assign(new Error("timeout"), { code: "timeout" }));
          return;
        }

        const failureToken = String(stderr || "").trim().split("\n").pop();
        const code = PYTHON_ERROR_CODES[failureToken] || "convert_failed";
        reject(Object.assign(new Error(failureToken || error.message), { code }));
      }
    );

    child.on("error", reject);
  });
}

async function convert(pdfBuffer) {
  // One directory per request, so two concurrent conversions can never read
  // each other's output — which, with predictable names, would mean handing
  // one user another user's document.
  const workDir = await mkdtemp(path.join(tmpdir(), "pdf2docx-"));

  try {
    // The input filename is ours, never the client's. A user-supplied name is
    // a path-traversal and shell-metacharacter vector for no benefit; the
    // download name is applied by the Next.js route instead.
    const inputPath = path.join(workDir, `${randomUUID()}.pdf`);
    await writeFile(inputPath, pdfBuffer);

    // Output path is ours too, so there is no directory scan to do — unlike
    // LibreOffice, which derived the name itself and changed how between
    // versions, pdf2docx writes exactly where it is told.
    const outputPath = path.join(workDir, `${randomUUID()}.docx`);

    const { partial } = await runConverter(inputPath, outputPath);

    const docx = await readFile(outputPath).catch(() => null);
    if (!docx || docx.length === 0) {
      throw Object.assign(new Error("no output produced"), { code: "convert_failed" });
    }

    return { docx, partial };
  } finally {
    // Always, on every path. The whole privacy claim for this tool is that the
    // file does not outlive the request, and a leaked temp dir on an error path
    // would quietly make that false.
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, { ok: true, active, queued: queue.length });
    return;
  }

  if (req.method !== "POST" || req.url !== "/convert") {
    sendJson(res, 404, { error: "not_found" });
    return;
  }

  if (!secretMatches(req.headers["x-converter-secret"])) {
    // Deliberately says nothing about why. An unauthenticated caller learns
    // only that this endpoint exists.
    sendJson(res, 401, { error: "unauthorized" });
    return;
  }

  let body;
  try {
    body = await readBody(req, MAX_UPLOAD_BYTES);
  } catch (error) {
    if (error.code === "too_large") sendJson(res, 413, { error: "too_large" });
    else sendJson(res, 400, { error: "bad_request" });
    return;
  }

  // Cheapest possible reject: a non-PDF never gets near the parser. The route
  // checks this too, but this service must be safe on its own terms.
  if (body.length === 0 || !body.subarray(0, 1024).includes(PDF_MAGIC)) {
    sendJson(res, 400, { error: "not_a_pdf" });
    return;
  }

  await acquireSlot();

  try {
    const { docx, partial } = await convert(body);

    res.writeHead(200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Length": docx.length,
      // Signals a conversion that dropped one or more unparseable pages. A
      // header rather than a body field because the body is the document
      // itself; the route reads this and turns it into a visible caveat.
      "X-Conversion-Partial": partial ? "1" : "0",
      "Cache-Control": "no-store",
    });
    res.end(docx);
  } catch (error) {
    // encrypted/empty are facts about the user's file, not faults on our side,
    // so they travel as 4xx with their own code. Flattening them into
    // convert_failed would tell someone with a password-protected PDF that our
    // converter broke, when what they need to hear is "remove the password".
    const known = ["timeout", "encrypted", "empty"];
    const code = known.includes(error.code) ? error.code : "convert_failed";

    const status = { timeout: 504, encrypted: 400, empty: 400 }[code] ?? 500;

    // Logged without the filename or any document content — we have no reason
    // to know what people are converting, and a log is a place data leaks from.
    console.error(`Conversion failed: ${code}`);
    sendJson(res, status, { error: code });
  } finally {
    releaseSlot();
  }
});

// Comfortably above the conversion timeout. Node's default 2-minute socket
// timeout would otherwise cut off a slow-but-succeeding conversion.
server.requestTimeout = 90_000;
server.headersTimeout = 20_000;

server.listen(PORT, () => {
  console.log(`PDF converter listening on ${PORT} (max ${MAX_CONCURRENT} concurrent)`);
});

// Fly/Railway send SIGTERM on deploy. Draining rather than dropping means an
// in-flight conversion finishes instead of failing for whoever is waiting.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 30_000).unref();
  });
}
