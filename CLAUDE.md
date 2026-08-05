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

`npm test` runs the vitest suite (`npm run test:watch` for watch mode) — 367 tests across eighteen files, covering the pure-logic helpers in `src/lib/` (`calculatorMath`, `calculatorInput`, `calculatorFormat`, `calculatorUrlState`, `unitConversions`, `dateMath`, `imageFile`, `imageValidation`, `imageResampling`, `formatBytes`, `pdfPageRange`, `pdfFile`, `pdfWorkerProtocol`, `urlShortenerValidation`, `siteUrl`, `sitemapRoutes`) plus `src/app/robots`. There are no component or end-to-end tests; UI and file-processing behaviour is only verified by `npm run build` and manual checks.

Because there is no component-level coverage, **logic that guards a user input belongs in a `src/lib/` module, not inline in a client component** — that's the only way it can be tested at all. `pdfPageRange.js` exists for exactly this reason.

`postinstall` runs `scripts/copy-pdf-worker.mjs`, which copies `pdf.worker.min.mjs` from `node_modules/pdfjs-dist` into `public/` — re-run `npm install` (or the script directly) if that file goes missing after bumping `pdfjs-dist`.

## Architecture

**WaryTools** is a Next.js App Router site (`next@16`, React 19, Turbopack) offering free, mostly client-side PDF/image/calculator/URL-shortener tools. No custom backend — the only server-side piece is Supabase, used solely by the URL shortener.

### Tool registry drives everything

[src/lib/tools.js](src/lib/tools.js) is the single source of truth for every tool: slug, title, description, href, icon. `categories` (grouped) and `allTools` (flat) are exported and consumed by the navbar, homepage grid, hub pages, footer, and the generated `sitemap.js`. **Adding or changing a tool means editing this file first** — the rest of the site reacts to it. Icons are referenced by string name and resolved at render time through [src/components/ToolIcon.js](src/components/ToolIcon.js) against `lucide-react`, keeping `tools.js` a plain data module with no JSX (so it's safely importable from server components and `sitemap.js`/`robots.js`).

### Per-tool page pair

Every tool route follows the same split:

- `page.js` — server component; owns `metadata` (title/description) and static page copy, renders the client component.
- `<Name>Client.js` — `"use client"` component with all interactivity and processing logic.

Hub pages (`/pdf`, `/image`, `/calculators`) render `<HubHeader>` + a grid of `<ToolCard>` sourced from the matching `categories` entry in `tools.js` — no per-tool markup duplicated there.

### Client-side file processing

PDF and image tools do all processing in the browser — no file ever hits a server:

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

### URL shortener (the one server-touching tool)

The only feature with real backend state. [src/lib/supabaseClient.js](src/lib/supabaseClient.js) creates a public anon Supabase client (RLS-gated) used directly from client components — no API routes. Flow:

- `src/app/url-shortener/UrlShortenerClient.js` inserts into the `short_urls` table (`short_code`, `long_url`, `clicks`) and mirrors created links into `localStorage` for session history (not an account system — just avoids losing links on refresh).
- `src/app/s/[code]/page.js` is a dynamic server route that looks up the code, increments `clicks` best-effort, and redirects — this is the one page that isn't purely static.

Requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (see `.env.local.example`); optional `NEXT_PUBLIC_SITE_URL` for `sitemap.js`/`robots.js` (defaults to `https://wary.tools`).

### Styling and design tokens

No CSS framework/utility classes — components use inline `style` objects directly (Tailwind is installed as a devDependency but not the primary styling approach in practice; check `globals.css` before assuming otherwise). Shared visual tokens live in [src/lib/theme.js](src/lib/theme.js): `colors` for neutrals/semantic colors, `categoryColors` for the per-category accent (pdf=red, image=violet, calculators=cyan, url-shortener=green) used consistently across `ToolCard`, hub pages, the footer, and the navbar so each tool category reads as a distinct identity.
