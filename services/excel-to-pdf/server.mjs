// XLSX -> PDF conversion service. Node stdlib only, no dependencies.
//
// This runs behind the site's /api/excel-to-pdf route, never exposed to the
// browser directly. It exists because rendering a workbook to PDF means running
// a spreadsheet layout engine — column widths, merged cells, number formats,
// conditional formatting, charts, frozen panes, print ranges — and a browser
// has none.
//
// Why LibreOffice here: same reason as services/word-to-pdf and
// services/powerpoint-to-pdf, and the same non-contradiction with
// services/pdf-to-word. That service rejected LibreOffice for PDF *import*,
// where it produces absolutely-positioned textboxes instead of flowing content.
// This one needs XLSX *export*, which is the same layout engine Calc renders
// with on screen, with PDF as its print target. Do not generalise "LibreOffice
// was rejected" from that README here.
//
// ---------------------------------------------------------------------------
// THE ONE REAL DIFFERENCE FROM THE OTHER TWO LIBREOFFICE SERVICES
// ---------------------------------------------------------------------------
//
// Those two invoke `soffice --convert-to` and are done. This one runs a Basic
// macro (convert.bas) instead, because the command line cannot express the
// decision this format requires: a spreadsheet has no page geometry of its own,
// so scaling and orientation have to be applied to the document's page styles
// before export, and headless LibreOffice exposes no other interface for that.
//
// The consequence worth knowing before touching this file: **the macro is not
// optional and the service will not start without it.** Same treatment as
// convert.py on the pdf2docx service, and for the same reason — a container
// built without it starts cleanly, health-checks green, and fails every
// conversion.
//
// Threat model is identical to the other three converters', and the mitigations
// are load-bearing rather than ceremony:
//   - a shared secret, so only our site can spend our CPU
//   - a hard byte cap enforced while streaming, so a huge body is dropped
//     rather than buffered
//   - a container check, so non-spreadsheets never reach the parser at all
//   - an option allowlist, since option tags are interpolated into a macro call
//   - one isolated temp dir AND one isolated LibreOffice profile per request
//   - a kill timeout, since a malformed file can hang soffice indefinitely
//   - a concurrency gate, since parallel conversions exhaust container memory
//
// Deploy notes are in README.md.

import { createServer } from "node:http";
import { execFile, execFileSync } from "node:child_process";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { mkdtemp, rm, writeFile, readFile, mkdir, readdir, copyFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// 7860 matches the Dockerfile default and what Hugging Face Spaces routes to.
// Every platform we deploy on sets PORT explicitly, so this fallback only
// applies when running the file directly — but it should still agree with the
// image, or local testing checks a different port than production serves.
const PORT = Number(process.env.PORT) || 7860;

// Must match EXCEL_CONVERTER_SECRET on the Next.js side. Absent means the
// service refuses to start rather than starting open — a converter that anyone
// can post to is a free CPU faucet attached to a bill we pay.
const SECRET = process.env.CONVERTER_SECRET;
if (!SECRET) {
  console.error("CONVERTER_SECRET is not set. Refusing to start an unauthenticated converter.");
  process.exit(1);
}

// The binary this service is entirely built around. The failure it guards
// against: an image built without it starts cleanly, health-checks green, and
// fails every conversion. Verified at boot so that is a startup failure instead
// of a silent outage.
const SOFFICE = process.env.SOFFICE_PATH || "soffice";

// The macro that does the actual page setup. Its absence is checked at boot for
// exactly the reason services/pdf-to-word checks for convert.py: server.mjs
// invokes it, so an image built without it converts nothing while reporting
// itself healthy. This was missed once already on that service.
const MACRO_SOURCE = path.join(HERE, "convert.bas");

try {
  await access(MACRO_SOURCE);
} catch {
  console.error(
    `convert.bas is missing from ${HERE}. The image was built without it — see ` +
      `README.md ("Deploy"): the Dockerfile must COPY it alongside server.mjs. ` +
      `Refusing to start a converter that cannot convert.`
  );
  process.exit(1);
}

try {
  // --version is the cheapest invocation that proves the binary exists and can
  // actually start. Checked at boot, not at first use: a missing soffice
  // otherwise stays invisible until someone uploads a workbook, because the
  // process starts, /health answers {ok:true}, and the platform marks the
  // deploy healthy.
  execFileSync(SOFFICE, ["--version"], { stdio: "ignore", timeout: 30_000 });
} catch {
  console.error(
    `LibreOffice ("${SOFFICE}") is not runnable. The image was built without it, or ` +
      `SOFFICE_PATH points at the wrong binary; see README.md ("Deploy"). ` +
      `Refusing to start a converter that cannot convert.`
  );
  process.exit(1);
}

// Mirrors MAX_UPLOAD_BYTES in src/lib/excelToPdfLimits.js. Duplicated rather
// than imported because this service deploys separately — but it is the
// authoritative one, since the route's copy is only as trustworthy as the route.
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

// soffice can hang rather than error on some malformed input. Slightly under
// the route's own timeout so the failure surfaces here, with the process
// actually killed, instead of the route walking away from a live conversion.
const CONVERT_TIMEOUT_MS = 55_000;

// LibreOffice holds the whole document model in memory, and each conversion
// starts a fresh soffice process with its own profile. Calc's cost is driven by
// cell count and formula recalculation rather than by file size — a 2 MB
// workbook with a hundred thousand formulas is heavier than a 10 MB one that is
// mostly an embedded image — so this stays at 2, matching the Impress service.
// Queueing beats failing, since waiting briefly is better than a 503.
const MAX_CONCURRENT = 2;
let active = 0;
const queue = [];

// Container signatures. Mirrors detectSpreadsheetFormat in src/lib/xlsxFile.js
// — see that file for why a ZIP header alone is not enough to identify a .xlsx,
// why OLE2 needs the extension, and why .xlsb is refused rather than converted.
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OLE2_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

// The option allowlists, mirroring src/lib/excelToPdfLimits.js.
//
// **This service must be safe on its own terms**, which for these values means
// more than matching the route's validation: these tags are interpolated into a
// macro invocation on the soffice command line, so an unvalidated value here
// would be an argument-injection vector. The route already normalises them and
// a client cannot reach this service directly — this is the second lock, and
// the one that holds if the first is ever loosened.
const SCALING_MODES = new Set(["fit-width", "fit-page", "original"]);
const ORIENTATIONS = new Set(["auto", "landscape", "portrait"]);
const SHEET_SELECTIONS = new Set(["all", "first"]);

const DEFAULT_OPTIONS = { scaling: "fit-width", orientation: "auto", sheets: "all" };

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
 * Parses and validates the options header.
 *
 * Mirrors decodeOptions in src/lib/excelToPdfLimits.js, including its
 * tolerance: an unreadable value becomes the default rather than an error,
 * because refusing a good workbook over a malformed setting the user never
 * typed is the wrong trade. What it does NOT do is pass anything through — every
 * returned value comes from the Sets above, which is what makes it safe to
 * interpolate into the macro call.
 */
function parseOptions(header) {
  const parsed = { ...DEFAULT_OPTIONS };

  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim().toLowerCase();

    if (key === "scaling" && SCALING_MODES.has(value)) parsed.scaling = value;
    else if (key === "orientation" && ORIENTATIONS.has(value)) parsed.orientation = value;
    else if (key === "sheets" && SHEET_SELECTIONS.has(value)) parsed.sheets = value;
  }

  return parsed;
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
 * the filename, and handing it a bare name or the wrong suffix makes it guess —
 * occasionally wrongly, producing a one-page PDF containing the workbook's raw
 * XML. The name we write is ours, never the client's (see convert()), so this
 * is how the format survives the handoff.
 *
 * `hint` carries the sniffed format the route already determined, used only for
 * OLE2 — where, as xlsxFile.js explains, the bytes genuinely cannot distinguish
 * a .xls from a .doc. The route sends it in a header it controls; a client
 * cannot reach this service directly, and the worst a wrong hint can do is pick
 * the wrong import filter for a file the sender already owns.
 *
 * Returns null for anything we do not accept, so a non-spreadsheet never
 * reaches the parser at all.
 */
function spreadsheetExtension(body, hint = "") {
  if (body.length === 0) return null;

  if (body.subarray(0, OLE2_MAGIC.length).equals(OLE2_MAGIC)) {
    // Only accepted when something upstream identified it as a spreadsheet.
    // Guessing "xls" for every OLE2 file would send .doc and .ppt uploads to
    // the Calc filter and produce nonsense rather than an honest refusal.
    return hint === "xls" ? "xls" : null;
  }

  if (body.subarray(0, ZIP_MAGIC.length).equals(ZIP_MAGIC)) {
    // Same scan window as the browser-side check. The entry paths live
    // uncompressed in the ZIP's local file headers, so they are readable
    // without unzipping.
    const head = body.subarray(0, 4096);

    // .xlsb first, before the generic xl/ match it would otherwise satisfy.
    // LibreOffice reads binary workbooks only partially and often renders blank
    // sheets, so this is refused rather than converted — a technically
    // successful PDF with missing data is the worst available outcome.
    if (head.includes(Buffer.from("xl/workbook.bin"))) return null;

    if (head.includes(Buffer.from("xl/"))) return "xlsx";
    if (head.includes(Buffer.from("opendocument.spreadsheet"))) return "ods";
    if (head.includes(Buffer.from("word/"))) return null;
    if (head.includes(Buffer.from("ppt/"))) return null;

    // An unidentified ZIP. The browser side lets these through when the
    // extension claims .xlsx, on the grounds that the converter is the real
    // authority — so honour that here and let soffice decide.
    return "xlsx";
  }

  return null;
}

/**
 * Installs convert.bas into a per-request LibreOffice profile.
 *
 * The macro has to live inside the profile soffice is started with, and each
 * request gets its own profile (see the note on -env:UserInstallation below),
 * so it is copied in per request rather than baked into the image once. That
 * costs one file copy and buys the isolation guarantee — a shared profile is
 * the single most common way a LibreOffice service passes testing and fails
 * under load.
 *
 * The script.xlb/dialog.xlb index files are required: LibreOffice will not
 * discover a .bas that is not indexed by its library descriptor, and the
 * failure mode is a macro invocation that silently does nothing and exports
 * with Calc's defaults — i.e. exactly the orphaned-column output this whole
 * service exists to prevent, with nothing in any log to explain it.
 */
async function installMacro(profileDir) {
  const basicDir = path.join(profileDir, "user", "basic", "Standard");
  await mkdir(basicDir, { recursive: true });

  await copyFile(MACRO_SOURCE, path.join(basicDir, "Convert.bas"));

  await writeFile(
    path.join(basicDir, "script.xlb"),
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<!DOCTYPE library:library PUBLIC "-//OpenOffice.org//DTD OfficeDocument 1.0//EN" "library.dtd">\n` +
      `<library:library xmlns:library="http://openoffice.org/2000/library" library:name="Standard" library:readonly="false" library:passwordprotected="false">\n` +
      ` <library:element library:name="Convert"/>\n` +
      `</library:library>\n`
  );

  await writeFile(
    path.join(basicDir, "dialog.xlb"),
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<!DOCTYPE library:library PUBLIC "-//OpenOffice.org//DTD OfficeDocument 1.0//EN" "library.dtd">\n` +
      `<library:library xmlns:library="http://openoffice.org/2000/library" library:name="Standard" library:readonly="false" library:passwordprotected="false"/>\n`
  );

  // The profile-level index that names Standard as an available library.
  const libsDir = path.join(profileDir, "user", "basic");
  await writeFile(
    path.join(libsDir, "script.xlc"),
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<!DOCTYPE library:libraries PUBLIC "-//OpenOffice.org//DTD OfficeDocument 1.0//EN" "libraries.dtd">\n` +
      `<library:libraries xmlns:library="http://openoffice.org/2000/library" xmlns:xlink="http://www.w3.org/1999/xlink">\n` +
      ` <library:library library:name="Standard" xlink:href="$(USER)/basic/Standard/script.xlb/" xlink:type="simple" library:link="false"/>\n` +
      `</library:libraries>\n`
  );

  await writeFile(
    path.join(libsDir, "dialog.xlc"),
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<!DOCTYPE library:libraries PUBLIC "-//OpenOffice.org//DTD OfficeDocument 1.0//EN" "libraries.dtd">\n` +
      `<library:libraries xmlns:library="http://openoffice.org/2000/library" xmlns:xlink="http://www.w3.org/1999/xlink"/>\n`
  );
}

function runConverter(inputPath, outputPath, profileDir, options) {
  return new Promise((resolve, reject) => {
    // Every value here is either a path we generated or a tag from the Sets
    // above. Nothing user-controlled reaches this string, which is what makes
    // the macro invocation safe to assemble by concatenation.
    const macro =
      `macro:///Standard.Convert.ConvertToPdf(` +
      `"${pathToFileURL(inputPath).href}",` +
      `"${pathToFileURL(outputPath).href}",` +
      `"${options.scaling}",` +
      `"${options.orientation}",` +
      `"${options.sheets}")`;

    const child = execFile(
      SOFFICE,
      [
        // A private profile per request. Without it, concurrent conversions
        // share ~/.config/libreoffice and the second one silently exits without
        // producing output — the single most common way a LibreOffice service
        // appears to work under test and fails under load. Here it carries the
        // macro too, so it is doubly per-request.
        `-env:UserInstallation=file://${profileDir}`,
        "--headless",
        "--norestore",
        // Refuses any document that would otherwise prompt — most importantly a
        // password-protected one, which without this hangs waiting for input
        // that will never come until the kill timeout fires.
        "--nolockcheck",
        "--nodefault",
        "--nofirststartwizard",
        macro,
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
        // The caller treats the status file and the missing output as the real
        // failure signals.
        const detail = String(stderr || stdout || error.message || "").toLowerCase();
        const code =
          detail.includes("password") || detail.includes("encrypted")
            ? "encrypted"
            : "convert_failed";

        reject(Object.assign(new Error(code), { code }));
      }
    );

    child.on("error", reject);
  });
}

/**
 * Reads the token convert.bas wrote beside the output file.
 *
 * A missing status file is not itself a failure — it means the macro did not
 * reach its own exit path, and the presence or absence of a real PDF is still
 * the authoritative signal. This only refines *why* nothing was produced, so an
 * empty workbook gets a different message from a damaged one.
 */
async function readStatus(outputPath) {
  try {
    const raw = await readFile(`${outputPath}.status`, "utf8");
    return raw.trim().split(/\s+/)[0] || "";
  } catch {
    return "";
  }
}

async function convert(body, extension, options) {
  // One directory per request, so two concurrent conversions can never read
  // each other's output — which, with predictable names, would mean handing one
  // user another user's spreadsheet.
  const workDir = await mkdtemp(path.join(tmpdir(), "xls2pdf-"));

  try {
    // The input filename is ours, never the client's. A user-supplied name is a
    // path-traversal and shell-metacharacter vector for no benefit; the download
    // name is applied by the Next.js route instead. Only the extension is taken
    // from the sniffed format, so soffice picks the right import filter.
    const stem = randomUUID();
    const inputPath = path.join(workDir, `${stem}.${extension}`);
    await writeFile(inputPath, body);

    const outDir = path.join(workDir, "out");
    const profileDir = path.join(workDir, "profile");
    await mkdir(outDir);
    await mkdir(profileDir);

    await installMacro(profileDir);

    // Unlike the --convert-to services, the output path is ours to choose,
    // because the macro is told where to write. That removes the
    // scan-the-directory-and-guess step those services need.
    const outputPath = path.join(outDir, `${stem}.pdf`);

    await runConverter(inputPath, outputPath, profileDir, options);

    const status = await readStatus(outputPath);

    // A status the macro reported explicitly takes precedence, since it knows
    // things the filesystem cannot show: an empty workbook and a damaged one
    // both produce no PDF, and they need different messages.
    if (status && status !== "ok") {
      const known = ["encrypted", "no_content", "unreadable"];
      const code = known.includes(status) ? status : "convert_failed";
      throw Object.assign(new Error(status), { code });
    }

    const produced = (await readdir(outDir)).filter((name) => name.toLowerCase().endsWith(".pdf"));

    if (produced.length === 0) {
      // The characteristic LibreOffice failure: exit 0, no output. Treated as a
      // real failure rather than an empty success, or the user downloads a
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

/**
 * Verifies the *Calc* module and the macro pipeline, end to end, at boot.
 *
 * Worth its own check for the same reason the Impress service probes its
 * filter, plus one more that is specific to this service. Two distinct silent
 * failures are covered:
 *
 *   - A libreoffice-writer-only image satisfies the --version check above,
 *     reports a perfectly good version, and fails every .xlsx. These images
 *     differ from their siblings by essentially one package name, which makes
 *     that a realistic mistake rather than a hypothetical.
 *   - The macro not being discoverable in the profile. That one is worse: the
 *     conversion *succeeds*, producing a PDF with Calc's default pagination —
 *     the orphaned-column output this service exists to prevent — with nothing
 *     in any log to say the macro never ran.
 *
 * So the probe converts a real (tiny) spreadsheet through the real code path
 * and requires both a PDF and an "ok" status back. Anything less refuses to
 * bind the port, turning a silent site-wide degradation into a deploy that
 * visibly won't go live.
 */
async function verifyCalcPipeline() {
  const dir = await mkdtemp(path.join(tmpdir(), "xls2pdf-boot-"));

  try {
    // The smallest thing Calc will open: a .fods (flat ODF spreadsheet), which
    // is plain XML and needs no ZIP construction.
    const probe = path.join(dir, "probe.fods");
    await writeFile(
      probe,
      `<?xml version="1.0" encoding="UTF-8"?>` +
        `<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"` +
        ` xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"` +
        ` xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"` +
        ` office:version="1.2" office:mimetype="application/vnd.oasis.opendocument.spreadsheet">` +
        `<office:body><office:spreadsheet><table:table table:name="Sheet1">` +
        `<table:table-row><table:table-cell office:value-type="string">` +
        `<text:p>probe</text:p></table:table-cell></table:table-row>` +
        `</table:table></office:spreadsheet></office:body></office:document>`
    );

    const outDir = path.join(dir, "out");
    const profileDir = path.join(dir, "profile");
    await mkdir(outDir);
    await mkdir(profileDir);
    await installMacro(profileDir);

    const outputPath = path.join(outDir, "probe.pdf");
    await runConverter(probe, outputPath, profileDir, DEFAULT_OPTIONS);

    const produced = (await readdir(outDir)).filter((name) => name.toLowerCase().endsWith(".pdf"));
    if (produced.length === 0) return { ok: false, reason: "no_pdf" };

    // The status file is what proves the *macro* ran, as opposed to some other
    // path having produced a PDF. Without this assertion the probe would pass
    // on a container where the macro is silently never found.
    const status = await readStatus(outputPath);
    if (status !== "ok") return { ok: false, reason: "macro_not_run" };

    return { ok: true };
  } catch (error) {
    // The thrown detail is carried out rather than discarded.
    //
    // This branch used to be a bare `catch {}` returning only "error", which
    // the boot handler then reported with the no_pdf wording — "the Calc
    // module is missing or its filters are unavailable". That message is a
    // guess, and when it is wrong it sends the reader to rebuild the image
    // over a package that was never missing. It cost a real debugging session
    // on the first deploy of this service: soffice was present, the Calc
    // filters were present, convert.bas was present, and the log still said
    // the module was missing.
    //
    // runConverter() already classifies what it can (timeout, encrypted,
    // convert_failed) and attaches it as `code`, so the useful signal existed
    // and was being thrown away one frame below where it was needed.
    return { ok: false, reason: "error", detail: error?.code || error?.message || String(error) };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
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

  // Cheapest possible reject: a non-spreadsheet never gets near LibreOffice.
  // The route checks this too, but this service must be safe on its own terms.
  const hint = String(req.headers["x-source-format"] || "").toLowerCase();
  const extension = spreadsheetExtension(body, hint);
  if (!extension) {
    sendJson(res, 400, { error: "not_a_spreadsheet" });
    return;
  }

  const options = parseOptions(req.headers["x-conversion-options"]);

  await acquireSlot();

  try {
    const pdf = await convert(body, extension, options);

    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Length": pdf.length,
      "Cache-Control": "no-store",
    });
    res.end(pdf);
  } catch (error) {
    // encrypted and no_content are facts about the user's file, not faults on
    // our side, so they travel as 4xx with their own codes. Flattening them into
    // convert_failed would tell someone with a password-protected workbook that
    // our converter broke, when what they need to hear is "remove the password".
    const known = ["timeout", "encrypted", "no_content", "unreadable"];
    const code = known.includes(error.code) ? error.code : "convert_failed";

    const status = { timeout: 504, encrypted: 400, no_content: 400, unreadable: 400 }[code] ?? 500;

    // Logged without the filename or any cell content — we have no reason to
    // know what people are converting, and a log is a place data leaks from.
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

// Gated on the pipeline probe rather than run alongside it: binding the port
// first would let the platform health-check pass and mark the deploy live while
// we are still deciding whether this container can convert anything.
const probe = await verifyCalcPipeline();
if (!probe.ok) {
  if (probe.reason === "macro_not_run") {
    console.error(
      "LibreOffice converted a spreadsheet, but convert.bas did not run — the macro " +
        "was not discoverable in the generated profile. This is the dangerous " +
        "failure: conversions would SUCCEED while silently ignoring the scaling and " +
        "orientation settings, producing exactly the sliced-column output this " +
        "service exists to prevent. Check installMacro() and the .xlb/.xlc index " +
        "files. Refusing to start."
    );
  } else if (probe.reason === "error") {
    // Distinct from the no_pdf branch below, which is the "wrong module in the
    // image" diagnosis. Reaching HERE means the pipeline threw rather than
    // quietly producing nothing, so the module is almost certainly fine and
    // the detail is the thing worth reading. Printing the Writer-only-image
    // message here would be a confident wrong answer — the failure this
    // codebase repeatedly designs against.
    console.error(
      `The Calc boot probe threw before producing a PDF: ${probe.detail}. ` +
        "This is NOT the missing-module case (that one produces no PDF without " +
        "throwing) — soffice was reachable and something in the run failed. " +
        "`convert_failed` most often means the macro invocation itself was " +
        "rejected; `timeout` means soffice hung, which on a first boot usually " +
        "means too little memory for the profile warm-up. Refusing to start."
    );
  } else {
    console.error(
      "LibreOffice is runnable but could not export a spreadsheet to PDF — the Calc " +
        "module is missing or its filters are unavailable. A Writer-only image does " +
        "exactly this. Install libreoffice-calc (see Dockerfile). Refusing to start " +
        "a converter that cannot convert."
    );
  }
  process.exit(1);
}

server.listen(PORT, () => {
  console.log(`Excel converter listening on ${PORT} (max ${MAX_CONCURRENT} concurrent)`);
});

// Fly/Railway send SIGTERM on deploy. Draining rather than dropping means an
// in-flight conversion finishes instead of failing for whoever is waiting.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 30_000).unref();
  });
}
