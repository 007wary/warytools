---
title: WaryTools Excel Converter
emoji: 📗
colorFrom: green
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

# WaryTools Excel converter

Backend service for the Excel to PDF tool at
[wary.tools/pdf/excel-to-pdf](https://wary.tools/pdf/excel-to-pdf).
LibreOffice Calc behind a small HTTP API.

This Space is not an interactive demo — it exposes two endpoints and requires a
shared secret, so opening it in a browser will show nothing useful.

- `GET /health` → `{"ok":true,...}`
- `POST /convert` → requires `X-Converter-Secret`; takes .xlsx/.xls/.xlsm/.ods
  bytes, returns a PDF

Unlike the sibling Word and PowerPoint converters, this one accepts an
`X-Conversion-Options` header (`scaling`, `orientation`, `sheets`), because a
spreadsheet has no page geometry of its own and something has to decide where
the grid is cut. See `README.md` in the repo for why.

Requests without the correct secret are rejected with a 401. The secret is set
as a Space secret named `CONVERTER_SECRET` and matched by the site's
`EXCEL_CONVERTER_SECRET`.

Files are held only for the length of a conversion and deleted immediately
afterwards, including on failure. Nothing is stored or logged beyond whether a
conversion succeeded.

Source: [github.com/007wary/warytools](https://github.com/007wary/warytools) →
`services/excel-to-pdf/`
