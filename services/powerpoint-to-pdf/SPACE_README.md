---
title: WaryTools PowerPoint Converter
emoji: 📊
colorFrom: red
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

# WaryTools PowerPoint converter

Backend service for the PowerPoint to PDF tool at
[wary.tools/pdf/powerpoint-to-pdf](https://wary.tools/pdf/powerpoint-to-pdf).
LibreOffice Impress behind a small HTTP API.

This Space is not an interactive demo — it exposes two endpoints and requires a
shared secret, so opening it in a browser will show nothing useful.

- `GET /health` → `{"ok":true,...}`
- `POST /convert` → requires `X-Converter-Secret`; takes .pptx/.ppt/.ppsx/.odp
  bytes, returns a PDF

Requests without the correct secret are rejected with a 401. The secret is set
as a Space secret named `CONVERTER_SECRET` and matched by the site's
`POWERPOINT_CONVERTER_SECRET`.

Files are held only for the length of a conversion and deleted immediately
afterwards, including on failure. Nothing is stored or logged beyond whether a
conversion succeeded.

Source: [github.com/007wary/warytools](https://github.com/007wary/warytools) →
`services/powerpoint-to-pdf/`
