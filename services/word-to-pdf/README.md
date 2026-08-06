# Word to PDF converter service

LibreOffice Writer behind a small HTTP API. Called only by the site's
`/api/word-to-pdf` route — never exposed to browsers.

## Why this exists

Every tool on WaryTools runs in the browser except two, and this is the second.
Rendering a Word document to PDF means running a Word layout engine: resolving
styles, flowing text through sections, breaking tables across pages,
substituting missing fonts, and paginating the result. A browser has none of
that, and the JS libraries that claim to do it work by converting to HTML
first — which throws away page geometry, headers and footers, and pagination,
producing something that is not a rendering of the document.

## Why LibreOffice, when the sibling service explicitly rejected it

Because the direction is reversed, and the objection does not transfer.

`services/pdf-to-word/` dropped LibreOffice because its PDF **import** produces
a layout replica rather than a document — every text run lands in an
absolutely-positioned textbox, nothing reflows when edited. That is a real and
measured limitation of reading PDFs.

This service does DOCX **export**, which is the opposite operation and
LibreOffice's native strength. It is the same layout engine Writer uses to
render on screen, with PDF as its print target. Fidelity is high because
LibreOffice's whole job is understanding Word documents, and this is the path
essentially every "convert to PDF" service runs.

**Do not read "LibreOffice was rejected" from the sibling README and apply it
here.** It was rejected for import, chosen for export.

The cost is size: a LibreOffice image is roughly 500 MB against pdf2docx's 200,
with a correspondingly slower cold start. There is no small Word layout engine;
that is the price of the feature.

## API

### `POST /convert`

- Header `X-Converter-Secret: <CONVERTER_SECRET>` — required.
- Body: raw document bytes (`.docx`, `.doc`, `.odt`, `.rtf`), max 20 MB.
- Success: `200` with the PDF bytes.
- Failure: JSON `{ error }` — `unauthorized` (401), `not_a_document` /
  `bad_request` / `encrypted` (400), `too_large` (413), `convert_failed` (500),
  `timeout` (504).

### Format detection

A `.docx` is a ZIP, so `PK\x03\x04` identifies it no better than it identifies
a spreadsheet, a slide deck, or a renamed archive. The service reads the first
4 KB and looks for the entry paths that name the format (`word/`,
`opendocument.text`), which sit uncompressed in the ZIP's local file headers.
This mirrors `detectDocumentFormat` in `src/lib/docxFile.js`; changing one means
changing both.

The sniffed format also decides the extension the temp file is written under,
which is load-bearing: LibreOffice picks its import filter partly from the
filename, and a wrong or missing suffix makes it guess — occasionally producing
a PDF of the document's raw XML.

### Things that will break this if changed

- **Every conversion needs its own `-env:UserInstallation` profile.** Without
  it, concurrent conversions share `~/.config/libreoffice` and the second one
  exits silently without producing output. This is the single most common way a
  LibreOffice service passes testing and fails under load. `HOME` is redirected
  per-request too, because soffice writes dotfiles there regardless.
- **`--convert-to pdf:writer_pdf_Export`, not bare `pdf`.** Bare `pdf` lets
  LibreOffice pick an exporter from the input type, which for an ambiguous file
  can select the Draw or Impress filter and render page one as an image.
- **Missing output is the real failure signal.** soffice frequently exits 0
  having produced nothing, so the exit code is not trusted — the output
  directory is scanned, and an empty one is an error. This was confirmed on the
  live container: handing soffice a malformed .docx printed `Error: source file
  could not be loaded` and **still exited 0**. Without the directory scan the
  service would have returned a zero-byte file as a success.
- **`Warning: failed to launch javaldx` on every run is expected.** The image
  has no JRE, and Writer's DOCX-to-PDF path does not need one. Do not "fix" it
  by installing Java — that adds ~200 MB for a warning with no effect on
  output.
- **`fonts-liberation` is not optional.** It supplies the metric-compatible
  substitutes for Arial, Times New Roman, and Courier New. Without them line
  breaks and page counts drift from the original, which is the most visible way
  a converted PDF looks wrong.

### `GET /health`

`200` with `{ ok, active, queued }`. Used by the platform health check.

## Deploy (Fly.io)

```bash
cd services/word-to-pdf

fly launch --no-deploy --copy-config --name warytools-word-converter

# Generate a secret and set it on BOTH sides. These must match exactly.
# Use a DIFFERENT value from the PDF converter's: two services sharing one
# secret means a compromise of either is a compromise of both.
fly secrets set CONVERTER_SECRET="$(openssl rand -hex 32)"

fly deploy

# Cap horizontal scale. fly.toml has no max-machines key, so without this a
# burst can start machines you did not budget for. One is enough here.
fly scale count 1

fly status          # note the hostname
```

Then set the two variables in the Vercel project (Production + Preview):

| Variable | Value |
| --- | --- |
| `WORD_CONVERTER_URL` | `https://warytools-word-converter.fly.dev` |
| `WORD_CONVERTER_SECRET` | the same secret set above |

Neither is `NEXT_PUBLIC_` — both are server-only. A converter secret in the
browser bundle would be no secret at all.

Until both are set, `/api/word-to-pdf` returns a clean "temporarily
unavailable" message rather than failing hard, so a missing deploy degrades
instead of breaking the page.

## Deploy (Hugging Face Spaces)

Same shape as the PDF converter — see `services/pdf-to-word/README.md` for the
full walkthrough. Rename `SPACE_README.md` to `README.md` in the Space repo so
Spaces reads its front-matter for `app_port`, and set `CONVERTER_SECRET` as a
Space secret.

Note the caveat recorded there applies here too: Docker Spaces now require a
paid plan, so Fly is the practical target.

## Running locally

```bash
docker build -t word-converter .
docker run --rm -p 8081:7860 -e CONVERTER_SECRET=dev-secret word-converter

# In .env.local:
#   WORD_CONVERTER_URL=http://localhost:8081
#   WORD_CONVERTER_SECRET=dev-secret
```

Port 8081 rather than 8080 so this can run alongside the PDF converter without
a collision.

Smoke test:

```bash
curl -sS -X POST http://localhost:8081/convert \
  -H "X-Converter-Secret: dev-secret" \
  --data-binary @sample.docx \
  -o out.pdf && file out.pdf
```

`out.pdf: PDF document` means it works. Check the page count against the
original — a one-page PDF from a ten-page document means a font or filter
problem, not a success.

## Verified on deploy

Measured against the live Fly deployment (LibreOffice 7.4.7.2, image 198 MB):

- Cold request end to end: **~30s**, of which ~12s is soffice warming before
  the port opens. A warm request is a few seconds.
- A 1.4 KB two-paragraph `.docx` converts to a valid 8.5 KB single-page
  PDF 1.6, with both paragraphs present and text selectable (verified by
  extracting the text back out with pdf.js).
- `fly deploy` created **two** machines on the first deploy despite
  `min_machines_running = 0`. `fly scale count 1` is a required step, not a
  tidy-up.
- **There is no python3 in this image.** Debugging on the machine has to use
  `node`, which is present because the server needs it.

A caution for anyone building a test `.docx` on Windows: PowerShell's
`Compress-Archive` writes entry names with **backslashes**, which the ZIP spec
forbids and LibreOffice refuses to load. A fixture built that way fails with
`source file could not be loaded` and looks exactly like a broken converter.
Build fixtures with forward-slash entry names.

## Operational notes

- **Scale to zero** is on. The first request after an idle period pays a cold
  start of roughly 30s — longer than the PDF converter, because the image is
  larger and soffice warms more slowly. The client UI's timeout accounts for
  this; don't lower it without testing a cold start.
- **Concurrency is capped at 2 per machine** (`MAX_CONCURRENT` in
  `server.mjs`). Each conversion is a separate soffice process with its own
  profile, and parallel conversions are what get the container OOM-killed.
  Raising it means raising the VM memory too.
- **Nothing is persisted.** Each request gets its own temp directory holding
  both the document and the LibreOffice profile, removed in a `finally` on
  every path including errors. Logs record failure codes only, never filenames
  or content.
