# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Role

On this project, Claude acts as product head, lead developer, design head, and analyst combined. That means decisions about what to build, how to build it, how it should look, and whether it's working are all Claude's to reason through — not just implement on request. When asked for a tool or feature, think through scope, UX, and naming before writing code, the way an owner would, not just a contractor executing a spec. Flag tradeoffs proactively (e.g. bundle size, browser-only feasibility, SEO impact) rather than waiting to be asked.

## Commands

```bash
npm run dev      # start dev server (Turbopack)
npm run build    # production build (Turbopack)
npm run start    # run the production build
npm run lint     # ESLint (flat config, eslint-config-next)
```

`npm test` runs the vitest suite (`npm run test:watch` for watch mode) — 452 tests across twenty files, covering the pure-logic helpers in `src/lib/` (`calculatorMath`, `calculatorInput`, `calculatorFormat`, `calculatorUrlState`, `unitConversions`, `dateMath`, `imageFile`, `imageValidation`, `imageResampling`, `formatBytes`, `pdfPageRange`, `pdfFile`, `pdfToWordLimits`, `pdfWorkerProtocol`, `urlShortenerValidation`, `shortCode`, `siteUrl`, `sitemapRoutes`, `toolRanking`) plus `src/app/robots`. There are no component or end-to-end tests; UI and file-processing behaviour is only verified by `npm run build` and manual checks.

Because there is no component-level coverage, **logic that guards a user input belongs in a `src/lib/` module, not inline in a client component** — that's the only way it can be tested at all. `pdfPageRange.js` exists for exactly this reason.

`postinstall` runs `scripts/copy-pdf-worker.mjs`, which copies `pdf.worker.min.mjs` from `node_modules/pdfjs-dist` into `public/` — re-run `npm install` (or the script directly) if that file goes missing after bumping `pdfjs-dist`.

## Architecture

**WaryTools** is a Next.js App Router site (`next@16`, React 19, Turbopack) offering free, mostly client-side PDF/image/calculator/URL-shortener tools. Two features touch a server: the URL shortener (Supabase) and PDF to Word (a pdf2docx container in `services/pdf-to-word/`). Everything else runs in the browser.

### Tool registry drives everything

[src/lib/tools.js](src/lib/tools.js) is the single source of truth for every tool: slug, title, description, href, icon. `categories` (grouped) and `allTools` (flat) are exported and consumed by the navbar, homepage grid, hub pages, footer, and the generated `sitemap.js`. **Adding or changing a tool means editing this file first** — the rest of the site reacts to it. Icons are referenced by string name and resolved at render time through [src/components/ToolIcon.js](src/components/ToolIcon.js) against `lucide-react`, keeping `tools.js` a plain data module with no JSX (so it's safely importable from server components and `sitemap.js`/`robots.js`).

### Per-tool page pair

Every tool route follows the same split:

- `page.js` — server component; owns `metadata` (title/description) and static page copy, renders the client component.
- `<Name>Client.js` — `"use client"` component with all interactivity and processing logic.

Hub pages (`/pdf`, `/image`, `/calculators`) render `<HubHeader>` + a grid of `<ToolCard>` sourced from the matching `categories` entry in `tools.js` — no per-tool markup duplicated there.

### Client-side file processing

PDF and image tools do all processing in the browser — no file hits a server, with the single documented exception of PDF to Word (see below):

- PDF tools use `pdf-lib` for manipulation and `pdfjs-dist` (via [src/lib/pdfjs.js](src/lib/pdfjs.js)) for rendering/reading. The pdf.js worker is a static file at `public/pdf.worker.min.mjs`, kept in sync with `pdfjs-dist` by the `postinstall` script — never hand-edit or manually copy it.
- Image tools use `<canvas>` for resize/compress/convert; shared helpers (`loadImage`, `canvasToBlob`, `outputFormats`) live in [src/lib/imageFile.js](src/lib/imageFile.js). `formatBytes` lives in [src/lib/formatBytes.js](src/lib/formatBytes.js) — it's shared with the PDF compressor, so it isn't image-specific (`imageFile.js` re-exports it for convenience).
- Always go through `canvasToBlob` rather than calling `canvas.toBlob` directly: the raw callback yields `null` when encoding fails (large pages, memory pressure), and `URL.createObjectURL(null)` throws. The helper rejects with a real error instead.
- Any `URL.createObjectURL` needs a matching revoke on **unmount and on file re-select**, not just on explicit reset — otherwise blobs live for the lifetime of the tab.
- Shared UI across these tools: [FileDropzone](src/components/FileDropzone.js) (drag/drop + click-to-browse), [DownloadButton](src/components/DownloadButton.js) (triggers a client-side blob download), [WarningBanner](src/components/WarningBanner.js) (non-blocking caveats).

**Numeric `<input>` gotcha:** `Number("")` is `0`, so storing a number input's value as a number makes a *cleared field* indistinguishable from a deliberate zero. Hold the raw string in state and validate on submit. The `min`/`max` attributes only constrain the spinner arrows — they validate nothing. This caused real bugs in both Split PDF and Resize Image.

### The PDF pipeline

All five PDF tools share one pipeline. Adding or changing a PDF tool means working through these modules rather than hand-rolling logic in the client:

- **Accepting a file** — [src/lib/pdfFile.js](src/lib/pdfFile.js). Never check `file.type === "application/pdf"`: Windows without a PDF handler and most Android file providers report an *empty* type for a valid PDF, and that check rejected all of them. `validatePdfFile()` / `validatePdfFiles()` sniff the `%PDF-` magic bytes from a `Blob.slice` (cheap — a wrong file never gets fully read), enforce `MAX_PDF_BYTES`, and flag `isLarge` for a warning. `describePdfError()` maps a pdf-lib failure onto an actionable message — encrypted, out-of-memory, and damaged all need different responses from the user.
- **Doing the work** — [src/workers/pdf.worker.js](src/workers/pdf.worker.js), driven by `usePdfWorker()` in [src/lib/pdfWorkerClient.js](src/lib/pdfWorkerClient.js) with the message contract in [src/lib/pdfWorkerProtocol.js](src/lib/pdfWorkerProtocol.js). pdf-lib's parse/save are synchronous and CPU-bound; on the main thread they froze the tab (no scrolling, no spinner, no cancel) for the seconds a large merge takes. **Any new pdf-lib operation belongs in the worker as a new `op`**, not inline in a client. The worker is instantiated via `new Worker(new URL("../workers/pdf.worker.js", import.meta.url), { type: "module" })` — that exact shape is load-bearing, since it's what lets the bundler find and split the worker chunk (a string path works in dev and 404s in production). It also keeps pdf-lib out of the page bundle entirely.
- **Buffer ownership** — bytes are *transferred* to the worker, not copied, so the sender's `ArrayBuffer` is detached afterwards. Tools keep the document in a `bytesRef` and pass `bytes.slice(0)` when they need to run a second operation on the same file; passing the original would leave the next run with a zero-length buffer.
- **Page previews** — `usePdfThumbnails()` in [src/lib/pdfThumbnails.js](src/lib/pdfThumbnails.js) plus [PdfPageThumbnail](src/components/PdfPageThumbnail.js). Renders lazily via `IntersectionObserver` as pages scroll in, and ties every async render to a generation token so switching files mid-render cancels the old loop instead of racing it. Rendering a whole document up front is what made the old Reorder tool unusable on large PDFs.
- **Shared tool UI** — [PdfFileHeader](src/components/PdfFileHeader.js), [ProgressBar](src/components/ProgressBar.js), [ErrorBanner](src/components/ErrorBanner.js) (`role="alert"`, so errors are actually announced), and the button styles in [ToolButton.js](src/components/ToolButton.js).

**Reordering gotcha:** apply a drag reorder on `drop`, never on `dragover`. Mutating the list on every `dragover` event makes the dragged item jump out from under the pointer and the list flicker through orders the user never chose. Any reorderable list also needs the keyboard path (space to grab, arrows to move, escape to cancel) — drag-and-drop alone is unusable with a keyboard or screen reader.

### The image pipeline

The three image tools share a pipeline built the same way as the PDF one, with its own worker so a visitor to an image tool never downloads `pdf-lib` (and vice versa):

- **Accepting a file** — [src/lib/imageValidation.js](src/lib/imageValidation.js). Same rule as PDFs: never trust `file.type`. `validateImageFile()` sniffs magic bytes (note that WebP identifies itself at offset 8 after the RIFF size field, and AVIF/HEIC at offset 8 after `ftyp`). It also detects **HEIC specifically** — no browser can decode it via canvas, it's the iPhone camera default, and the old tools accepted it and then failed with a generic error; now it returns instructions instead. `checkPixelBudget()` guards the canvas pixel ceiling, past which canvas silently yields a *blank image* rather than throwing.
- **Doing the work** — [src/workers/image.worker.js](src/workers/image.worker.js) via `useImageBatch()` in [src/lib/useImageBatch.js](src/lib/useImageBatch.js). Decoding uses `createImageBitmap(blob, { imageOrientation: "from-image" })` — **that option is what applies EXIF orientation**; without it every portrait phone photo comes out sideways, which is what the old `<img>`+canvas path did. Drawing and encoding happen on `OffscreenCanvas`. Batch files are processed sequentially, not in parallel: each decoded bitmap can be hundreds of MB, and decoding twenty at once gets the worker killed.
- **Downscaling** — always go through `planDownscaleSteps()` in [src/lib/imageResampling.js](src/lib/imageResampling.js), never a single `drawImage` to the target size. Browsers filter bilinearly from a 2×2 neighbourhood, so a one-shot 4000px→150px draw never reads most source pixels and produces visibly aliased output. The helper plans a halving schedule (`2000 → 1000 → 500 → 250 → 150`) so every step stays within what bilinear handles correctly.
- **Output formats** — [src/lib/imageFormats.js](src/lib/imageFormats.js) probes what the browser can actually *encode* before offering it. Canvas encoders don't throw on an unsupported type, they silently return PNG, so an unprobed AVIF option hands the user a `.avif` file containing PNG bytes. The worker re-checks the returned blob's type for the same reason.
- **Batch results** — each worker output carries the **index** of its source file. Matching results by array position breaks the moment one file fails (every later result shifts onto the wrong source), and matching by filename breaks when a batch has two files with the same name.

`imageFile.js` still holds `canvasToBlob`/`getCappedDimensions`, used by the PDF thumbnail renderer — it predates this split and isn't the entry point for the image tools.

**`DownloadButton` accepts an async `getBlob`**, so a handler can build its output lazily (zipping a batch) without blocking the click.

### The calculator pipeline

The seven calculators share a pipeline in the same spirit as the PDF and image ones — all logic in tested `src/lib/` modules, all UI on shared primitives. They ship no third-party dependency at all (no math parser, no charting library); everything below is plain functions plus `Intl`.

- **Reading an input** — [src/lib/calculatorInput.js](src/lib/calculatorInput.js). `parseNumber()` returns a discriminated `{ok} | {empty} | {error}` rather than a bare number, because a calculator has to tell "nothing typed yet" (stay quiet) apart from "typed something invalid" (show an error) — a distinction `Number()` + `isNaN` cannot express. **Never guard an input with `!Number.isNaN()`**: it accepts `Infinity`, which then renders as the literal string "Infinity" in a result. Only `Number.isFinite` means "a usable number". `parseFields()` does the same for a whole form, and `sanitizeNumericInput()` strips the `1,234.56` / `₹1,234` shapes people paste out of spreadsheets and invoices.
- **Doing the work** — [src/lib/calculatorMath.js](src/lib/calculatorMath.js) and [src/lib/dateMath.js](src/lib/dateMath.js). Every function guards its result and throws `CalculationError` rather than returning `Infinity`/`NaN`: valid-looking inputs still overflow (compound interest at a high rate over a long term), and the client turns that throw into an actionable message. `loanEmi()` special-cases a zero rate, where the standard EMI formula is `0/0`.
- **Showing the answer** — [src/lib/calculatorFormat.js](src/lib/calculatorFormat.js). One place, so the site doesn't mix conventions. Money is ₹ with `en-IN` lakh/crore grouping (`₹12,34,567.89`), which is what the GST tool's Indian slabs imply. **Don't format a general number with a fixed `maximumFractionDigits`** — it renders a real `0.0000001` conversion result as `0`; `formatNumber()` falls back to significant digits, and to exponential below `1e-9`.
- **Shareable state** — [src/lib/calculatorUrlState.js](src/lib/calculatorUrlState.js) via `useCalculatorState()` in [src/lib/useCalculatorState.js](src/lib/useCalculatorState.js). Inputs round-trip through the query string, so "18% GST on ₹4,999" is a link. Two load-bearing details: writes use `history.replaceState` (these fire per keystroke — `pushState` would make Back walk through every character typed), and **the URL is read in an effect, never during render**. These pages are statically prerendered and serve byte-identical HTML with or without query params, so reading `location.search` during the hydration render — including from a lazy `useState` initialiser — mismatches the server markup. `decodeState` validates every param against a schema, since a URL is untrusted input.
- **Shared tool UI** — [src/components/calculator/](src/components/calculator/): `ModeToggle` (a real `role="radiogroup"` with arrow-key navigation — three calculators previously each carried a copy of a plain-`<button>` version that told a screen reader nothing about which mode was active), `NumberField`, `DateField`, and `ResultPanel`. Errors go through the existing [ErrorBanner](src/components/ErrorBanner.js) so they're announced.

**Numeric input gotcha (again):** `NumberField` is `type="text"` with `inputMode="decimal"`, not `type="number"`. `type="number"` silently changes the value when the wheel scrolls over a focused field, gives a keypad without a decimal key on several Android keyboards, and discards pasted `1,234.56` outright.

**Results are live, not click-to-calculate.** Age and date-difference used to compute on a button press, which left a stale answer on screen whenever a date changed afterwards. Every calculator now recomputes as you type, which is also why `ResultPanel` is an `<output>` with `aria-live="polite"`: an answer that merely appears in the DOM is invisible to a screen reader.

### PDF to Word (the one tool that uploads a file)

`/pdf/to-word` is the deliberate exception to everything above. Producing a real `.docx` means reconstructing paragraphs, headings, and tables from glyphs positioned at coordinates — a PDF has no concept of a paragraph — and no browser library does that analysis. So the file goes to a pdf2docx container in [services/pdf-to-word/](services/pdf-to-word/), proxied by [src/app/api/pdf-to-word/route.js](src/app/api/pdf-to-word/route.js). (It ran LibreOffice originally; that emits absolutely-positioned textboxes rather than flowing paragraphs, so nothing reflowed when edited. Don't switch back.)

**Because this breaks the site's core privacy promise, the copy is part of the feature, not decoration.** The tool page says it uploads *before* the file picker (not after), `/privacy` has a dedicated section, and the blanket "nothing is ever uploaded" claims on the homepage, `/about`, `/pdf`, and `llms.txt` were narrowed to stay accurate. Per-tool copy on the other tools was left alone — those claims are still true. If you add another server-touching tool, that copy audit is part of the work.

Rules specific to this tool:

- **Limits live in [src/lib/pdfToWordLimits.js](src/lib/pdfToWordLimits.js)** (20 MB, 200 pages, scan detection, error copy) and are tested. Both the client and the route import them, so the message a user sees is identical on both sides of the network. The client's copy is a courtesy; the route's is the one that counts.
- **A scanned PDF is refused, not converted.** It has no text layer, so the converter would return a `.docx` full of page images and zero editable words — worse than a refusal, because the user pays the upload and the wait to learn nothing. `looksScanned()` samples the first few pages' text client-side, so the check that saves the round trip happens *before* the round trip. Same principle as HEIC in `imageValidation.js`.
- **Validation runs before the converter-availability check** in the route. The other order means a malformed request takes a different path depending on whether the container happens to be configured — so the validation would be untested in exactly the environment where it matters.
- **Rate limiting is durable, in Postgres** (`consume_pdf_conversion_quota`, 5 per 10 minutes), not in-memory. A conversion costs real CPU on a container we pay for, and a serverless in-memory counter resets on every cold start. It fails *closed*: if the limiter is unreachable the request is refused, because an unreachable limiter can't tell an ordinary user from someone hammering the endpoint.
- **`PDF_CONVERTER_URL` / `PDF_CONVERTER_SECRET` are server-only** — deliberately not `NEXT_PUBLIC_`. A converter secret in the browser bundle would be no secret at all. With them unset the route returns a clean "temporarily unavailable", so dev and previews work without the container.
- **pdf.js must be imported dynamically** (`await import("@/lib/pdfjs")`), never at module scope. It touches `DOMMatrix` on evaluation, which doesn't exist in Node, and these pages are statically prerendered — a top-level import fails the build outright. `pdfThumbnails.js` does the same thing for the same reason.
- **A dropped page is never silently dropped.** pdf2docx defaults to `ignore_page_error: True`, which skips unparseable pages and still reports success — a 40-page contract returns as 38 pages with nothing saying so. `convert.py` runs strict first and retries leniently only on failure, signalling the degraded result as `partial` on stderr → `X-Conversion-Partial` header → a warning banner instead of the success panel. For a document someone is about to sign and send, a quiet omission is the worst available failure.
- **`convert.py`'s stderr is a protocol, not a log.** `server.mjs` reads the *last line* of stderr as the result token, so anything else written there breaks it. pdf2docx calls `logging.basicConfig()` at import and logs to stderr, so `_silence_library_logging()` runs *after* the import and removes the handlers — setting a level beforehand is overridden and lets `[INFO] Terminated in 0.04s.` be read as the token.
- **Don't tune the pdf2docx settings from the names alone.** Two obvious-looking wins were measured and rejected: `delete_end_line_hyphen` strips the hyphen but keeps the line break (`compre\nhensive`), and `extract_stream_table` only affects `extract_tables()`, which the DOCX path never calls. Both are documented in `convert.py` with what was measured; verify against the pinned version before adding more.
- **The deploy must copy `convert.py`.** `server.mjs` execs it, so a Space or image built without it builds fine, health-checks green, and fails every conversion. It was missed once already in the LibreOffice→pdf2docx migration, which is why the service now refuses to start when the script is absent.

### URL shortener (the other server-touching tool)

The only feature with *persistent* backend state (the converter above holds a file only for the length of a request). [src/lib/supabaseClient.js](src/lib/supabaseClient.js) creates a public anon Supabase client (RLS-gated). Flow:

- `src/app/url-shortener/UrlShortenerClient.js` POSTs to `/api/shorten` and mirrors created links into `localStorage` for session history (not an account system — just avoids losing links on refresh). It reads click counts back through the `get_short_url_clicks` RPC, passing only the codes it already holds.
- `src/app/api/shorten/route.js` validates, generates a code, and calls the `create_short_url` RPC.
- `src/app/s/[code]/page.js` is a dynamic server route that resolves the code and counts the click in a single `lookup_short_url` RPC, then redirects.

**The database is the security boundary, not the API route.** The anon key ships in the browser bundle, so anything the `anon` role is allowed to do directly against PostgREST is allowed to *everyone* — an API route that "validates first" enforces nothing on its own. `anon` therefore has **no INSERT** on `short_urls`; creation only happens through `create_short_url`, a `SECURITY DEFINER` function that re-checks the code pattern, the scheme, the length, embedded credentials, and private-address targets, and applies a durable per-window rate limit via the `short_url_rate_limit` table. (The previous in-route in-memory limiter reset on every cold start and wasn't shared across serverless instances, so it could never be more than a speed bump.) `/api/shorten` duplicates those checks only to produce a better error message.

Three rules follow from that:

- **Any new read or write must go through a `SECURITY DEFINER` function**, not an RLS policy — otherwise it's callable directly with the public key. `anon` has **no table privileges at all** on `short_urls`; the only three doors are `create_short_url`, `lookup_short_url`, and `get_short_url_clicks`. This is stricter than it looks and deliberately so: the table previously carried a `USING (true)` SELECT policy, which despite its "readable by code" name allowed `GET /rest/v1/short_urls?select=*` to dump every link on the service. **A read policy that doesn't filter by code is an enumeration hole, not a read policy** — so reads name a code, and a row that isn't named can't come back.
- **Validation rules live in [src/lib/urlShortenerValidation.js](src/lib/urlShortenerValidation.js) and are mirrored in `is_shortenable_url` in the database**, which `create_short_url` calls. Changing one means changing both; the JS side is the tested one. The mirror is not optional decoration — `create_short_url` is callable directly via PostgREST, so when `/api/shorten` is bypassed the SQL copy is the *only* gate. It drifted once already: the original regex missed IPv6 ULA/link-local, IPv4-mapped IPv6, CGNAT, decimal/hex-encoded IPs, private TLDs, and dotless hosts, all of which the JS side rejected.
- **Short codes come from `crypto.getRandomValues`**, via [src/lib/shortCode.js](src/lib/shortCode.js) — never `Math.random()`. Anyone who knows a code can resolve it (the redirect has to work for strangers), so a predictable generator would let someone guess other people's links. Note the keyspace only buys anything while bulk reads stay closed — an unguessable code is worthless next to a table someone can scan, which is why the two rules above exist. The alphabet excludes `0/O/1/I/l` so a code read off paper doesn't 404, and generation uses rejection sampling rather than `% alphabet.length`, which would bias toward early characters and shrink the real keyspace.

Two URL shapes are rejected that a naive `new URL()` check accepts: **embedded credentials** (`https://google.com@evil.example` reads as Google but goes elsewhere — a shortener that accepts these becomes phishing infrastructure, and the short link hides the giveaway) and **private/local targets** (`localhost`, RFC1918, `169.254.169.254`, `.local`), which are useless to anyone else and turn the redirector into an SSRF pivot for whatever follows our redirects.

Requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (see `.env.local.example`); optional `NEXT_PUBLIC_SITE_URL` for `sitemap.js`/`robots.js` (defaults to `https://wary.tools`).

### Styling and design tokens

No CSS framework/utility classes — components use inline `style` objects directly (Tailwind is installed as a devDependency but not the primary styling approach in practice; check `globals.css` before assuming otherwise). Shared visual tokens live in [src/lib/theme.js](src/lib/theme.js): `colors` for neutrals/semantic colors, `categoryColors` for the per-category accent (pdf=red, image=violet, calculators=cyan, url-shortener=green) used consistently across `ToolCard`, hub pages, the footer, and the navbar so each tool category reads as a distinct identity.
