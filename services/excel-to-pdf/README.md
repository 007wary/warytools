# Excel to PDF converter service

LibreOffice Calc behind a small HTTP API. Called only by the site's
`/api/excel-to-pdf` route — never exposed to browsers.

## Why this exists

Almost every tool on WaryTools runs in the browser. This one cannot. Rendering a
workbook to PDF means running a spreadsheet layout engine — resolving column
widths and merged cells, applying number formats and conditional formatting,
laying out charts and frozen panes, honouring print ranges — and a browser has
none.

**Why LibreOffice, when `services/pdf-to-word` removed it and says so at
length:** direction. That service needed PDF *import*, where LibreOffice
produces a layout replica rather than a document — every text run lands in an
absolutely positioned textbox. This service needs XLSX *export*, which is its
native strength: the same layout engine Calc renders with on screen, with PDF as
its print target. The siblings `services/word-to-pdf` and
`services/powerpoint-to-pdf` run LibreOffice for exactly the same reason in
their own directions.

**Do not consolidate this with the other two LibreOffice services.** They are
deliberately separate services with separate secrets on separate hosts, so a
compromise of one is not a compromise of the others.

That makes this the site's *fourth* tool that uploads, which is why the tool
page, the privacy policy, the homepage, `/about`, `/pdf`, and `llms.txt` all say
so explicitly. Adding a fifth means auditing that copy again.

## The one real difference from the sibling services: the macro

`services/word-to-pdf` and `services/powerpoint-to-pdf` invoke
`soffice --convert-to` and are done. **This service runs a LibreOffice Basic
macro instead** (`convert.bas`), and that is the single most important thing to
understand before changing anything here.

A `.docx` has a page size. A `.pptx` has a slide size. Both formats already
carry the geometry they should be rendered at, so "convert to PDF" is
unambiguous and those services correctly expose no settings at all.

**A spreadsheet has no page.** A sheet is an unbounded grid, and a PDF is a
stack of fixed rectangles, so something has to decide where the grid gets cut.
The command line cannot express that decision — `--convert-to pdf` takes no
scaling or orientation argument — so it falls through to the document's page
style, which for a workbook nobody set up for printing means Calc's default:
portrait, 100% scale, columns sliced into page-width strips.

That default is what produces the most-complained-about output in this whole
category: an ordinary 12-column budget comes back as a 4-page PDF with columns
9–12 orphaned onto their own sheet, stripped of the row labels that made them
mean anything. Fixing it means setting page-style properties before export, and
a Basic macro is the only interface headless LibreOffice offers for that.

Consequences:

- **`convert.bas` must be in the image.** `server.mjs` refuses to start without
  it. Same trap that bit `services/pdf-to-word` with `convert.py`: the service
  execs a file the image was built without, so it builds fine, health-checks
  green, and fails every conversion.
- **The profile must be created by LibreOffice before the macro is written
  into it.** This is the single least obvious thing about this service, and
  getting it wrong is what kept Excel to PDF broken from the day it shipped
  until 2026-08-14. `installMacro()` therefore runs
  `soffice --headless --terminate_after_init` against the throwaway profile
  *first*, and only then writes the module and its index files.

  LibreOffice will not load a Basic library out of a profile directory it did
  not initialise itself. Write a perfectly well-formed `user/basic/Standard`
  into a bare `mkdtemp` directory and it is simply ignored: the macro resolves
  to nothing, `soffice` exits **0** having produced no PDF, and no log line
  anywhere says why.

  Established by elimination inside the deployed image, and worth recording
  because four plausible explanations are wrong:

  | tried | result |
  | --- | --- |
  | hand-built profile + `macro:///…` | never runs |
  | same layout, after `--terminate_after_init` | **runs** |
  | module named `Module1` vs `Convert` | no difference |
  | plain `--convert-to`, no macro at all | converts fine |

  That last row is the one to remember when reading a failure here: Calc, its
  filters and `convert.bas` can all be present and correct while every macro
  conversion still produces nothing. The storage form (`.bas` vs `.xba`), the
  `xlink:href` in `script.xlc`, and the profile's macro security level were
  each tested and made no difference.

- **The module is stored as `Convert.xba`, not `Convert.bas`.** `script.xlb`
  names an element and LibreOffice resolves that to `<name>.xba`, an XML
  container holding the Basic source. A raw `.bas` beside the index is never
  read. This was not the cause of the outage above — the profile init was — but
  the two were fixed together rather than leaving the wrong on-disk format in
  place. `moduleXml()` escapes the source, since `convert.bas` contains `<`,
  `>` and `&`, and an unescaped `<` ends the element early and yields a module
  that parses as empty.

- **The `.xlb`/`.xlc` index files are still required**, and still not
  sufficient. Without them the macro invocation silently does nothing and the
  conversion *succeeds* with Calc's defaults — the exact output this service
  exists to prevent, with nothing in any log to explain it. `server.mjs` probes
  for this specifically at boot, which is why the boot check asserts an `ok`
  status token and not merely the existence of a PDF.

## API

### `POST /convert`

- Header `X-Converter-Secret: <CONVERTER_SECRET>` — required.
- Header `X-Source-Format: xls` — optional; set by the route when it has
  sniffed a legacy OLE2 workbook. See "Legacy formats" below.
- Header `X-Conversion-Options: scaling=fit-width;orientation=auto;sheets=all`
  — optional; every value is validated against a fixed allowlist here as well
  as in the route, and anything unrecognised falls back to the default. See
  "Options" below.
- Body: raw spreadsheet bytes, max 20 MB.
- Success: `200` with the PDF bytes.
- Failure: JSON `{ error }` — `unauthorized` (401), `not_a_spreadsheet` /
  `bad_request` / `encrypted` / `no_content` / `unreadable` (400), `too_large`
  (413), `convert_failed` (500), `timeout` (504).

### `GET /health`

`200` with `{ ok, active, queued }`. Used by the platform health check.

## Options

Three, all with allowlisted values. The full reasoning behind each default lives
in `src/lib/excelToPdfLimits.js`; the short version:

| Option | Values | Default | Why that default |
| --- | --- | --- | --- |
| `scaling` | `fit-width`, `fit-page`, `original` | `fit-width` | Caps the axis that causes orphaned columns while letting rows flow down as many pages as they need. `fit-page` sounds tidier but shrinks a 500-row ledger to illegibility. |
| `orientation` | `auto`, `landscape`, `portrait` | `auto` | Resolves to landscape. Spreadsheets are predominantly wide; forcing portrait is the other half of the orphaned-columns problem. |
| `sheets` | `all`, `first` | `all` | A default that adds pages is recoverable by the reader; one that silently drops them is not. |

**The allowlist is a security boundary, not just validation.** These tags are
interpolated into a `macro:///...` invocation on the soffice command line. The
route normalises them before they reach the wire and this service re-validates
them against its own copy of the lists — the second lock is what holds if the
first is ever loosened.

## Legacy formats and the `X-Source-Format` header

A `.docx`, `.pptx`, and `.xlsx` are all ZIPs, and the entry paths inside them
(`word/`, `ppt/`, `xl/`) tell them apart cheaply. The legacy binaries do not
have that luxury: `.doc`, `.ppt`, and `.xls` are all OLE2 compound files sharing
the identical `D0 CF 11 E0` header, and distinguishing them for real means
walking the compound-file directory for a stream name — a parser, not a sniff.

So the client sends its declared extension, the route sniffes what it can and
forwards `X-Source-Format`, and an OLE2 body arriving here with no such
declaration is **refused**. Guessing `xls` for every legacy Office file would
feed `.doc` uploads to the Calc import filter and return nonsense instead of an
honest error.

## `.xlsb` is refused, deliberately

A binary workbook is a ZIP carrying the same `xl/` entries as a `.xlsx`, so it
sniffs as OOXML. LibreOffice reads it only partially and frequently renders
blank or truncated sheets — a technically successful PDF with missing data,
which is the worst available outcome and the same class of silent failure as
HEIC in `imageValidation.js` and scanned PDFs in `services/pdf-to-word`.

The `xl/workbook.bin` check therefore runs **before** the generic `xl/` match in
all three places that sniff (client, route, service). Reordering them accepts
the file and hands the user blank pages.

## `.csv` is refused, deliberately

Not an oversight, and it has its own error message rather than falling into the
generic bucket. A CSV has no column widths, no fonts, and no page setup — every
PDF we could produce from one would be an invention rather than a rendering of
what the user saw. The message tells them to open it in Excel and save as
`.xlsx` first.

## Deploy

Same shape as the sibling services. The environment variable the Next.js side
needs is `EXCEL_CONVERTER_URL` and `EXCEL_CONVERTER_SECRET` — a **fourth**
distinct secret, deliberately not shared with the other three converters.

```bash
fly apps create warytools-excel-converter    # fly.toml is checked in already
fly secrets set CONVERTER_SECRET="$(openssl rand -hex 32)" --app warytools-excel-converter
fly deploy --app warytools-excel-converter
fly scale count 1 --app warytools-excel-converter   # NOT optional — see fly.toml
```

Two things that came up deploying this for real on 2026-08-14:

- **`bom` runs out of capacity.** Both the initial deploy and the redundant
  second machine Fly creates for HA failed with "no capacity available in bom".
  `fly deploy --regions lhr` gets the deploy through; the running machine can
  still end up in `bom` afterwards, which is what is wanted. The `fly scale
  count 1` step then trims the HA spare, as it always did.
- **Keep the secret you generate.** It has to be pasted into Vercel as
  `EXCEL_CONVERTER_SECRET` below, and `fly secrets` cannot read it back — a
  lost value means setting a fresh one on both sides.

Then on the Next.js side (Vercel project settings, both server-only — a
converter secret in the browser bundle would be no secret at all):

```
EXCEL_CONVERTER_URL=https://warytools-excel-converter.fly.dev
EXCEL_CONVERTER_SECRET=<the same value>
```

With them unset the route returns a clean "temporarily unavailable", so dev and
previews work without the container.

### Verifying a deploy

`GET /health` proves the process is up but **not** that it can convert — that is
the whole reason the boot probe exists. The meaningful check is that the
container reached `listen`, because it refuses to bind the port unless a real
test spreadsheet converted *and* the macro reported back:

```bash
fly logs | grep "Excel converter listening"
```

If instead you see one of the three refusal messages, read which one it is
before changing anything — they have genuinely different causes and the wrong
guess sends you rebuilding the image over a package that was never missing:

- **"could not export a spreadsheet to PDF — the Calc module is missing"** —
  the probe produced no PDF and nothing threw. A Writer-only image does exactly
  this. Verify with `--convert-to` inside the container before believing it,
  because until 2026-08-14 this message was *also* printed for the profile-init
  bug above, where Calc was entirely fine.
- **"the Calc boot probe threw"** — the run failed rather than quietly
  producing nothing, and the message carries the real code (`convert_failed`,
  `timeout`, `encrypted`). Read that code; the module is almost certainly fine.
- **"convert.bas did not run — the macro was not discoverable"** — a PDF came
  back but the macro's status token did not. This is the dangerous one: without
  the boot check it would ship as conversions that succeed while silently
  ignoring every option.

The fastest way to tell a macro problem from a Calc problem is to run both
inside the container: `soffice --convert-to pdf:calc_pdf_Export` converting a
`.fods` while `macro:///Standard.Convert.Ping` does not is the exact signature
of the profile-init bug.

**A working conversion is not proof the macro ran.** Calc will happily produce
a PDF with its own defaults, which is what this service exists to avoid. The
end-to-end check is that the *options change the output* — on a wide workbook,
`scaling=original;orientation=portrait` must produce more pages than the
default `fit-width`. If both give the same page count, the macro is being
ignored no matter how healthy everything looks.
