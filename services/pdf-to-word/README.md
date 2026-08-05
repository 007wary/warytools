# PDF to Word converter service

pdf2docx behind a small HTTP API. Called only by the site's `/api/pdf-to-word`
route — never exposed to browsers.

## Why this exists

Every other tool on WaryTools runs in the browser. This one cannot. Producing a
real `.docx` means reconstructing paragraphs, headings, and tables from glyphs
positioned at coordinates — PDFs have no concept of a paragraph — and no
browser library does that analysis.

**Why pdf2docx and not LibreOffice**, which this service originally used:
LibreOffice's PDF import produces a layout replica, not a document. Every text
run lands in an absolutely positioned textbox — measured on a real affidavit,
its output had 9 textboxes and zero flowing paragraphs, so blocks that shared
vertical space rendered stacked on top of each other and nothing reflowed when
edited. That is a known LibreOffice limitation, not a misconfiguration. On the
same file, pdf2docx produces 0 textboxes and 9 flowing paragraphs in correct
reading order.

That makes this tool the site's one exception to "nothing is uploaded", which
is why the tool page and the privacy policy both say so explicitly.

## API

### `POST /convert`

- Header `X-Converter-Secret: <CONVERTER_SECRET>` — required.
- Body: raw PDF bytes, max 20 MB.
- Success: `200` with the `.docx` bytes.
- Failure: JSON `{ error }` — `unauthorized` (401), `not_a_pdf` /
  `bad_request` / `encrypted` / `empty` (400), `too_large` (413),
  `convert_failed` (500), `timeout` (504).

### `GET /health`

`200` with `{ ok, active, queued }`. Used by the platform health check.

## Deploy (Hugging Face Spaces — free, no card)

The current deployment target. Spaces gives free Docker hosting with 16 GB of
RAM and never asks for a payment method. Note this option was not usable in
practice: Docker Spaces now require a paid plan.

Two tradeoffs to know: a Space sleeps after roughly 48 hours idle and takes
~30s to wake, and free Spaces are publicly listed. Neither is a problem for
this service — the secret still gates `/convert`, so a stranger finding the
Space cannot use it — but if the cold start becomes annoying, moving to Fly
(below) is a one-line env var change on the site.

1. Create a Space at <https://huggingface.co/new-space>:
   - **SDK**: Docker → Blank
   - **Hardware**: CPU basic (free)
   - **Visibility**: Public (private Spaces need a paid plan; the secret is
     what protects this, not obscurity)

2. Push these files to the Space repo. `SPACE_README.md` must be renamed to
   `README.md` — Spaces reads its YAML front-matter to find `app_port`:

   ```bash
   git clone https://huggingface.co/spaces/<user>/<space-name> hf-space
   cd hf-space
   cp ../Dockerfile ../server.mjs .
   cp ../SPACE_README.md README.md
   git add -A && git commit -m "Add PDF converter" && git push
   ```

3. Set the secret: Space → **Settings** → **Variables and secrets** →
   **New secret**, named `CONVERTER_SECRET`. Use the same value you put in
   Vercel as `PDF_CONVERTER_SECRET`.

4. Wait for the build (first one takes a few minutes), then check it:

   ```bash
   curl https://<user>-<space-name>.hf.space/health
   ```

   `{"ok":true,"active":0,"queued":0}` means it's live. That hostname is your
   `PDF_CONVERTER_URL`.

## Deploy (Fly.io — paid, faster)

```bash
cd services/pdf-to-word

fly launch --no-deploy --copy-config --name warytools-pdf-converter

# Generate a secret and set it on BOTH sides. These must match exactly.
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
| `PDF_CONVERTER_URL` | `https://warytools-pdf-converter.fly.dev` |
| `PDF_CONVERTER_SECRET` | the same secret set above |

Neither is `NEXT_PUBLIC_` — both are server-only. A converter secret in the
browser bundle would be no secret at all.

Until both are set, `/api/pdf-to-word` returns a clean "temporarily
unavailable" message rather than failing hard, so a missing deploy degrades
instead of breaking the page.

## Running locally

```bash
docker build -t pdf-converter .
docker run --rm -p 8080:8080 -e CONVERTER_SECRET=dev-secret pdf-converter

# In .env.local:
#   PDF_CONVERTER_URL=http://localhost:8080
#   PDF_CONVERTER_SECRET=dev-secret
```

Smoke test:

```bash
curl -sS -X POST http://localhost:8080/convert \
  -H "X-Converter-Secret: dev-secret" \
  --data-binary @sample.pdf \
  -o out.docx && file out.docx
```

## Operational notes

- **Scale to zero** is on. The first request after an idle period pays a cold
  start of roughly 10–20s. The client UI's timeout accounts for this; don't
  lower it without testing a cold start.
- **Concurrency is capped at 2 per machine** (`MAX_CONCURRENT` in
  `server.mjs`). PyMuPDF holds the whole document model in memory and parallel
  conversions are what get the container OOM-killed. Raising it means raising
  the VM memory too.
- **The pdf2docx version is pinned.** A conversion engine changing under us
  silently changes every user's output, and this one is the whole product.
- **Nothing is persisted.** Each request gets its own temp directory, removed
  in a `finally` on every path including errors. Logs record failure codes
  only, never filenames or content.
