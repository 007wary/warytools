// DOCX -> PDF conversion service. Node stdlib only, no dependencies.
//
// This runs behind the site's /api/word-to-pdf route, never exposed to the
// browser directly. It exists because rendering a Word document to PDF means
// running a Word layout engine — styles, sections, headers and footers, table
// breaks, font substitution, pagination — and a browser has none.
//
// Why LibreOffice here, when services/pdf-to-word explicitly rejected it:
// direction. That service needed PDF *import*, where LibreOffice produces
// absolutely-positioned textboxes instead of flowing paragraphs. This one
// needs DOCX *export*, which is its native strength — the same layout engine
// Writer renders with on screen, and PDF is simply its print target. Do not
// generalise "LibreOffice was rejected" from that README to this service.
//
// Threat model is identical to the PDF converter's, and the mitigations are
// load-bearing rather than ceremony:
//   - a shared secret, so only our site can spend our CPU
//   - a hard byte cap enforced while streaming, so a huge body is dropped
//     rather than buffered
//   - a container check, so non-documents never reach the parser at all
//   - one isolated temp dir AND one isolated LibreOffice profile per request
//   - a kill timeout, since a malformed file can hang soffice indefinitely
//   - a concurrency gate, since parallel conversions exhaust container memory
//
// Deploy notes are in README.md.

import { createServer } from "node:http";
import { execFile, execFileSync } from "node:child_process";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { mkdtemp, rm, writeFile, readFile, mkdir, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// 7860 matches the Dockerfile default and what Hugging Face Spaces routes to.
// Every platform we deploy on sets PORT explicitly, so this fallback only
// applies when running the file directly — but it should still agree with the
// image, or local testing checks a different port than production serves.
const PORT = Number(process.env.PORT) || 7860;

// Must match WORD_CONVERTER_SECRET on the Next.js side. Absent means the
// service refuses to start rather than starting open — a converter that anyone
// can post to is a free CPU faucet attached to a bill we pay.
const SECRET = process.env.CONVERTER_SECRET;
if (!SECRET) {
  console.error("CONVERTER_SECRET is not set. Refusing to start an unauthenticated converter.");
  process.exit(1);
}

// The binary this service is entirely built around. Unlike the PDF converter
// (which execs a convert.py we ship in the repo, and therefore checks for at
// boot) this one depends on a package installed by the Dockerfile. The failure
// it guards against is the same though: an image built without it starts
// cleanly, health-checks green, and fails every conversion. Verified at boot
// so that is a startup failure instead of a silent outage.
const SOFFICE = process.env.SOFFICE_PATH || "soffice";

try {
  // --version is the cheapest invocation that proves the binary exists and can
  // actually start. Checked at boot, not at first use: a missing soffice
  // otherwise stays invisible until someone uploads a document, because the
  // process starts, /health answers {ok:true}, and the platform marks the
  // deploy healthy. That is exactly the shape of outage that survives a deploy
  // unnoticed — the same treatment CONVERTER_SECRET gets above.
  execFileSync(SOFFICE, ["--version"], { stdio: "ignore", timeout: 30_000 });
} catch {
  console.error(
    `LibreOffice ("${SOFFICE}") is not runnable. The image was built without it, or ` +
      `SOFFICE_PATH points at the wrong binary; see README.md ("Deploy"). ` +
      `Refusing to start a converter that cannot convert.`
  );
  process.exit(1);
}

// Mirrors MAX_UPLOAD_BYTES in src/lib/wordToPdfLimits.js. Duplicated rather
// than imported because this service deploys separately — but it is the
// authoritative one, since the route's copy is only as trustworthy as the route.
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

// soffice can hang rather than error on some malformed input. Slightly under
// the route's own timeout so the failure surfaces here, with the process
// actually killed, instead of the route walking away from a live conversion.
const CONVERT_TIMEOUT_MS = 55_000;

// LibreOffice holds the whole document model in memory, and each conversion
// starts a fresh soffice process with its own profile. A handful at once is
// what gets the container OOM-killed. Queueing beats failing, since waiting
// briefly is better than a 503.
const MAX_CONCURRENT = 2;
let active = 0;
const queue = [];

// Container signatures. Mirrors detectDocumentFormat in src/lib/docxFile.js —
// see that file for why a ZIP header alone is not enough to identify a .docx.
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OLE2_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
// Spelled as bytes, not as Buffer.from("{\\rtf"): in a JS string literal that
// escape collapses to a carriage return, giving { CR t f — which matches no
// real RTF file and silently rejected every one of them.
const RTF_MAGIC = Buffer.from([0x7b, 0x5c, 0x72, 0x74, 0x66]); // "{\rtf"

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

/**
 * Identifies the container and returns the extension to write it under.
 *
 * The extension matters to LibreOffice: it picks an import filter partly from
 * the filename, and handing it a bare name or the wrong suffix makes it guess
 * — occasionally wrongly, producing a one-page PDF containing the document's
 * raw XML. The name we write is ours, never the client's (see convert()), so
 * this is how the format survives the handoff.
 *
 * Returns null for anything we do not accept, so a non-document never reaches
 * the parser at all.
 */
function documentExtension(body) {
  if (body.length === 0) return null;

  if (body.subarray(0, OLE2_MAGIC.length).equals(OLE2_MAGIC)) return "doc";
  if (body.subarray(0, RTF_MAGIC.length).equals(RTF_MAGIC)) return "rtf";

  if (body.subarray(0, ZIP_MAGIC.length).equals(ZIP_MAGIC)) {
    // Same scan window as the browser-side check. The entry paths live
    // uncompressed in the ZIP's local file headers, so they are readable
    // without unzipping.
    const head = body.subarray(0, 4096);
    if (head.includes(Buffer.from("word/"))) return "docx";
    if (head.includes(Buffer.from("opendocument.text"))) return "odt";
    if (head.includes(Buffer.from("xl/"))) return null;
    if (head.includes(Buffer.from("ppt/"))) return null;

    // An unidentified ZIP. The browser side lets these through when the
    // extension claims .docx, on the grounds that the converter is the real
    // authority — so honour that here and let soffice decide.
    return "docx";
  }

  return null;
}

function runConverter(inputPath, outDir, profileDir) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      SOFFICE,
      [
        // A private profile per request. Without it, concurrent conversions
        // share ~/.config/libreoffice and the second one silently exits
        // without producing output — the single most common way a LibreOffice
        // service appears to work under test and fails under load.
        `-env:UserInstallation=file://${profileDir}`,
        "--headless",
        "--norestore",
        // Refuses any document that would otherwise prompt — most importantly
        // a password-protected one, which without this hangs waiting for input
        // that will never come until the kill timeout fires.
        "--nolockcheck",
        "--nodefault",
        "--nofirststartwizard",
        "--convert-to",
        // PDF export with the writer filter named explicitly. Bare "pdf" makes
        // LibreOffice choose a filter from the input type, which for an
        // ambiguous file can select the Draw or Impress exporter and produce a
        // PDF of the document's first page as an image.
        "pdf:writer_pdf_Export",
        "--outdir",
        outDir,
        inputPath,
      ],
      {
        timeout: CONVERT_TIMEOUT_MS,
        killSignal: "SIGKILL",
        maxBuffer: 1024 * 1024,
        // HOME must point somewhere writable and per-request too: soffice
        // writes stray dotfiles there regardless of UserInstallation.
        env: { ...process.env, HOME: profileDir },
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve();
          return;
        }

        // execFile surfaces a timeout kill as a signal, not an exit code.
        if (error.killed || error.signal === "SIGKILL") {
          reject(Object.assign(new Error("timeout"), { code: "timeout" }));
          return;
        }

        // LibreOffice's exit codes are not informative (it frequently exits 0
        // having produced nothing), so the message is all there is to go on.
        // The caller treats a missing output file as the real failure signal.
        const detail = String(stderr || stdout || error.message || "").toLowerCase();
        const code = detail.includes("password") || detail.includes("encrypted")
          ? "encrypted"
          : "convert_failed";

        reject(Object.assign(new Error(code), { code }));
      }
    );

    child.on("error", reject);
  });
}

async function convert(body, extension) {
  // One directory per request, so two concurrent conversions can never read
  // each other's output — which, with predictable names, would mean handing
  // one user another user's document.
  const workDir = await mkdtemp(path.join(tmpdir(), "word2pdf-"));

  try {
    // The input filename is ours, never the client's. A user-supplied name is
    // a path-traversal and shell-metacharacter vector for no benefit; the
    // download name is applied by the Next.js route instead. Only the
    // extension is taken from the sniffed format, so soffice picks the right
    // import filter.
    const stem = randomUUID();
    const inputPath = path.join(workDir, `${stem}.${extension}`);
    await writeFile(inputPath, body);

    const outDir = path.join(workDir, "out");
    const profileDir = path.join(workDir, "profile");
    await mkdir(outDir);
    await mkdir(profileDir);

    await runConverter(inputPath, outDir, profileDir);

    // Unlike pdf2docx, soffice derives the output name itself and has changed
    // how across versions, so the directory is scanned rather than assumed.
    // The stem is a UUID we chose and the directory holds exactly one
    // conversion, so there is nothing else here to confuse it with.
    const produced = (await readdir(outDir)).filter((name) => name.toLowerCase().endsWith(".pdf"));

    if (produced.length === 0) {
      // The characteristic LibreOffice failure: exit 0, no output. Treated as
      // a real failure rather than an empty success, or the user downloads a
      // zero-byte file.
      throw Object.assign(new Error("no output produced"), { code: "convert_failed" });
    }

    const pdf = await readFile(path.join(outDir, produced[0]));
    if (pdf.length === 0) {
      throw Object.assign(new Error("empty output"), { code: "convert_failed" });
    }

    return pdf;
  } finally {
    // Always, on every path. The whole privacy claim for this tool is that the
    // file does not outlive the request, and a leaked temp dir on an error path
    // would quietly make that false. The LibreOffice profile goes with it,
    // which also matters: soffice caches document fragments in there.
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

  // Cheapest possible reject: a non-document never gets near LibreOffice. The
  // route checks this too, but this service must be safe on its own terms.
  const extension = documentExtension(body);
  if (!extension) {
    sendJson(res, 400, { error: "not_a_document" });
    return;
  }

  await acquireSlot();

  try {
    const pdf = await convert(body, extension);

    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Length": pdf.length,
      "Cache-Control": "no-store",
    });
    res.end(pdf);
  } catch (error) {
    // encrypted is a fact about the user's file, not a fault on our side, so
    // it travels as a 4xx with its own code. Flattening it into convert_failed
    // would tell someone with a password-protected document that our converter
    // broke, when what they need to hear is "remove the password".
    const known = ["timeout", "encrypted"];
    const code = known.includes(error.code) ? error.code : "convert_failed";

    const status = { timeout: 504, encrypted: 400 }[code] ?? 500;

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
  console.log(`Word converter listening on ${PORT} (max ${MAX_CONCURRENT} concurrent)`);
});

// Fly/Railway send SIGTERM on deploy. Draining rather than dropping means an
// in-flight conversion finishes instead of failing for whoever is waiting.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 30_000).unref();
  });
}
