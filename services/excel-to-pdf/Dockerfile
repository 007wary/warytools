# XLSX -> PDF conversion service, built on LibreOffice Calc.
#
# Note the sibling service (services/pdf-to-word) removed LibreOffice and says
# so at length. That is not a contradiction — it is the other direction.
# LibreOffice's PDF *import* produces absolutely-positioned textboxes instead
# of flowing content, which is why it lost the PDF->DOCX job. XLSX *export* is
# the same layout engine Calc renders with on screen, with PDF as its print
# target, and it is what almost every "convert to PDF" service runs.
#
# The cost is cold start rather than size: first-run is slower because soffice
# has to warm before it renders.
FROM debian:bookworm-slim

# libreoffice-calc rather than the full libreoffice metapackage: this service
# converts spreadsheets only, and Writer/Impress/Base would add several hundred
# MB for filters that are never invoked.
#
# **This package is the one thing that makes this image different from
# services/word-to-pdf and services/powerpoint-to-pdf.** Building it with the
# wrong module produces a container that starts, health-checks green, converts
# nothing, and fails every single .xlsx — which is why server.mjs probes the
# Calc pipeline at boot and refuses to start without it. Do not "simplify" this
# line.
#
# libreoffice-core carries the PDF export filter and the Basic runtime. The
# Basic runtime is not incidental here: unlike its two sibling services, this
# one drives the conversion through a macro (convert.bas), because scaling and
# orientation cannot be expressed on the soffice command line. An image without
# a working Basic runtime converts successfully while silently ignoring every
# option — see server.mjs, which probes for exactly that.
#
# fonts-liberation is not optional. It provides the metric-compatible
# substitutes for Arial, Times New Roman, and Courier New — the fonts most
# Office files actually use. Without them LibreOffice falls back to whatever it
# can find, and in a spreadsheet a wider substitute font changes how many
# columns fit the page, which shifts the pagination this service exists to get
# right.
# fonts-dejavu covers the broader Unicode range so non-Latin text does not
# render as tofu.
RUN apt-get update && apt-get install --no-install-recommends -y \
      libreoffice-calc \
      libreoffice-core \
      fonts-liberation \
      fonts-dejavu-core \
      fonts-noto-core \
      nodejs \
      curl \
    && rm -rf /var/lib/apt/lists/*

# Run as a non-root user. A converter is exactly the kind of service where an
# untrusted file meets a large parsing codebase, so if LibreOffice is ever
# exploited by a malformed spreadsheet, it should not be exploited as root.
RUN useradd --create-home --shell /usr/sbin/nologin converter

WORKDIR /app

# convert.bas is NOT optional and must be copied alongside server.mjs.
#
# This is the same trap that bit services/pdf-to-word during its migration: the
# service execs a script that the image was built without, so it builds fine,
# health-checks green, and fails every conversion. server.mjs now refuses to
# start when this file is absent — but the fix is here, in this COPY line.
COPY server.mjs convert.bas ./

ENV HOME=/home/converter
RUN mkdir -p /home/converter && chown -R converter:converter /home/converter /app

USER converter

# Warms the LibreOffice profile at build time rather than making the first user
# pay for it. A cold soffice builds its configuration tree on first run, which
# adds 10-15s to whichever conversion happens to be first. Each request still
# gets its own throwaway profile (see server.mjs) — this only primes the shared
# font and filter caches that live outside it.
RUN soffice --headless --terminate_after_init || true

# 7860 is what Hugging Face Spaces expects and routes to; Fly and Railway read
# the port from their own config, and server.mjs takes PORT from the
# environment either way.
ENV PORT=7860
EXPOSE 7860

# start-period matches the PowerPoint converter's 60s. server.mjs runs a real
# test conversion through the full macro path before it binds the port, which
# adds a few seconds to boot on top of soffice's own warm-up. A health check
# that starts expecting answers mid-probe restarts a container that was about
# to be fine.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD curl -fsS http://127.0.0.1:${PORT}/health || exit 1

CMD ["node", "server.mjs"]
