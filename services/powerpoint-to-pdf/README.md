# PowerPoint to PDF converter service

LibreOffice Impress behind a small HTTP API. Called only by the site's
`/api/powerpoint-to-pdf` route — never exposed to browsers.

## Why this exists

Almost every tool on WaryTools runs in the browser. This one cannot. Rendering a
deck to PDF means running a presentation layout engine — resolving slide
masters and placeholder inheritance, applying theme fonts and colours, laying
out grouped shapes and embedded charts, and mapping slide dimensions onto a page
— and a browser has none.

**Why LibreOffice, when `services/pdf-to-word` removed it and says so at
length:** direction. That service needed PDF *import*, where LibreOffice
produces a layout replica rather than a document — every text run lands in an
absolutely positioned textbox. This service needs PPTX *export*, which is its
native strength: the same layout engine Impress renders with on screen, with PDF
as its print target. The sibling `services/word-to-pdf` runs LibreOffice for
exactly the same reason in the Word direction.

**Do not consolidate this with `services/word-to-pdf`.** They are deliberately
separate services with separate secrets on separate hosts, so a compromise of
one is not a compromise of both.

That makes this the site's *third* tool that uploads, which is why the tool
page, the privacy policy, the homepage, `/about`, `/pdf`, and `llms.txt` all say
so explicitly. Adding a fourth means auditing that copy again.

## API

### `POST /convert`

- Header `X-Converter-Secret: <CONVERTER_SECRET>` — required.
- Header `X-Source-Format: ppt` — optional; set by the route when it has
  sniffed a legacy OLE2 presentation. See "Legacy formats" below.
- Body: raw presentation bytes, max 20 MB.
- Success: `200` with the PDF bytes.
- Failure: JSON `{ error }` — `unauthorized` (401), `not_a_presentation` /
  `bad_request` / `encrypted` (400), `too_large` (413), `convert_failed` (500),
  `timeout` (504).

### `GET /health`

`200` with `{ ok, active, queued }`. Used by the platform health check.

## Legacy formats and the `X-Source-Format` header

A `.docx`, `.pptx`, and `.xlsx` are all ZIPs, and the entry paths inside them
(`word/`, `ppt/`, `xl/`) tell them apart cheaply. The legacy binaries do not
have that luxury: **`.doc`, `.ppt`, and `.xls` share one identical OLE2 header**
(`D0 CF 11 E0`), and distinguishing them for real means walking the compound-file
directory for a stream name — a parser, not a sniff.

So for OLE2 input this service accepts the format only when the caller says it
is a presentation, via `X-Source-Format: ppt`. The route sets that from the
filename extension (see `src/lib/pptxFile.js`). Without the header an OLE2 body
is refused, because guessing `ppt` for every legacy Office file would feed `.doc`
and `.xls` uploads to the Impress filter and return nonsense instead of an
honest error.

The header is trusted only as far as it needs to be: the service is unreachable
except through our own route, and the worst a wrong value can do is pick the
wrong import filter for a file the sender already owns.

## Boot checks

The service refuses to start — rather than starting and failing every request —
in three cases:

1. `CONVERTER_SECRET` is unset. An open converter is a free CPU faucet attached
   to a bill we pay.
2. `soffice` is not runnable. The image was built without LibreOffice.
3. **LibreOffice runs but cannot export a presentation.** This is the one worth
   knowing about. This image differs from `services/word-to-pdf` essentially by
   one package name, and a `libreoffice-writer` build reports a healthy
   `--version`, passes `/health`, converts `.docx` happily, and fails *every*
   `.pptx`. So `server.mjs` converts a tiny generated `.fodp` at boot and
   requires a real PDF back before it binds the port.

Check 3 costs a couple of seconds of startup and turns a silent
production-wide outage into a deploy that visibly refuses to go live.

## Deploy (Fly.io)

```bash
cd services/powerpoint-to-pdf

fly launch --no-deploy --copy-config --name warytools-powerpoint-converter

# Generate a secret and set it on BOTH sides. These must match exactly, and
# must DIFFER from the other two converters' secrets.
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
| `POWERPOINT_CONVERTER_URL` | `https://warytools-powerpoint-converter.fly.dev` |
| `POWERPOINT_CONVERTER_SECRET` | the same secret set above |

Neither is `NEXT_PUBLIC_` — both are server-only. A converter secret in the
browser bundle would be no secret at all.

Until both are set, `/api/powerpoint-to-pdf` returns a clean "temporarily
unavailable" message rather than failing hard, so a missing deploy degrades
instead of breaking the page.

## Deploy (Hugging Face Spaces)

Same shape as the sibling services: push `Dockerfile` and `server.mjs`, rename
`SPACE_README.md` to `README.md` (Spaces reads its YAML front-matter for
`app_port`), and set `CONVERTER_SECRET` under **Settings → Variables and
secrets**.

Note Docker Spaces now require a paid plan, which is why Fly is the documented
primary target.

```bash
git clone https://huggingface.co/spaces/<user>/<space-name> hf-space
cd hf-space
cp ../Dockerfile ../server.mjs .
cp ../SPACE_README.md README.md
git add -A && git commit -m "Add PowerPoint converter" && git push
```

## Running locally

```bash
docker build -t powerpoint-converter .
docker run --rm -p 8080:8080 -e CONVERTER_SECRET=dev-secret -e PORT=8080 powerpoint-converter

# In .env.local:
#   POWERPOINT_CONVERTER_URL=http://localhost:8080
#   POWERPOINT_CONVERTER_SECRET=dev-secret
```

Smoke test:

```bash
curl -sS -X POST http://localhost:8080/convert \
  -H "X-Converter-Secret: dev-secret" \
  --data-binary @deck.pptx \
  -o out.pdf && file out.pdf
```

A legacy `.ppt` needs the format header:

```bash
curl -sS -X POST http://localhost:8080/convert \
  -H "X-Converter-Secret: dev-secret" \
  -H "X-Source-Format: ppt" \
  --data-binary @old-deck.ppt \
  -o out.pdf && file out.pdf
```

## Operational notes

- **Scale to zero** is on. The first request after an idle period pays a cold
  start of roughly 30–40s (image pull, soffice warm-up, Impress probe). The
  client UI's timeout accounts for this; don't lower it without testing a cold
  start.
- **Verified live on first deploy.** A two-slide .pptx converted to a valid
  PDF-1.6 with two pages and correct, selectable text; the boot probe passed;
  a missing or wrong secret returned 401; and both a PDF and an unlabelled OLE2
  body were refused with `not_a_presentation`. Built image was ~189 MB.
- **`fly deploy` created two machines** despite `min_machines_running = 0`,
  exactly as fly.toml warns. `fly scale count 1` is part of the deploy steps
  above and is not optional — skipping it doubles the bill.
- **Concurrency is capped at 2 per machine** (`MAX_CONCURRENT` in `server.mjs`).
  LibreOffice holds the whole document model in memory, and decks are mostly
  images — parallel conversions are what get the container OOM-killed. Raising
  it means raising the VM memory too; they are one decision.
- **Every conversion gets its own `-env:UserInstallation` profile and `HOME`.**
  Concurrent conversions sharing one LibreOffice profile make the second exit
  silently without output. This is the single most common way a LibreOffice
  service passes testing and fails under load.
- **soffice exits 0 having produced nothing**, routinely. The exit code is not
  the success signal — the output directory is scanned, and an empty one is the
  failure.
- **The PDF export filter is named explicitly** (`pdf:impress_pdf_Export`). Bare
  `pdf` lets LibreOffice pick a filter from the input type; the Writer exporter
  in particular reflows slides into a document and destroys the layout.
- **`fonts-liberation` is not an optional image-size saving.** Slide text sits in
  fixed-size placeholders rather than reflowing, so a wider substitute font
  overflows or clips — more visible here than in a Word document.
- **Nothing is persisted.** Each request gets its own temp directory, removed in
  a `finally` on every path including errors. Logs record failure codes only,
  never filenames or content.
