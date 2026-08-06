# PPTX -> PDF conversion service, built on LibreOffice Impress.
#
# Note the sibling service (services/pdf-to-word) removed LibreOffice and says
# so at length. That is not a contradiction — it is the other direction.
# LibreOffice's PDF *import* produces absolutely-positioned textboxes instead
# of flowing content, which is why it lost the PDF->DOCX job. PPTX *export* is
# the same layout engine Impress renders with on screen, with PDF as its print
# target, and it is what almost every "convert to PDF" service runs.
#
# The cost is cold start rather than size: first-run is slower because soffice
# has to warm before it renders. Measured on the first real deploy, the built
# image is ~189 MB — installing libreoffice-impress alone (rather than the full
# suite) pulls far less than the ~500 MB a whole LibreOffice install would.
FROM debian:bookworm-slim

# libreoffice-impress rather than the full libreoffice metapackage: this service
# converts presentations only, and Writer/Calc/Base would add several hundred MB
# for filters that are never invoked.
#
# **This package is the one thing that makes this image different from
# services/word-to-pdf.** Building it with libreoffice-writer instead produces a
# container that starts, health-checks green, converts nothing, and fails every
# single .pptx — which is why server.mjs probes the Impress filter at boot and
# refuses to start without it. Do not "simplify" this line.
#
# libreoffice-draw comes as a dependency of Impress and is genuinely used:
# grouped shapes, SmartArt remnants, and embedded diagrams in real decks are
# rendered through the Draw layer.
#
# fonts-liberation is not optional. It provides the metric-compatible
# substitutes for Arial, Times New Roman, and Courier New — the fonts most
# Office files actually use. Without them LibreOffice falls back to whatever it
# can find, and on a slide (where text sits in fixed-size placeholders rather
# than reflowing) a wider substitute font overflows its box or gets clipped,
# which is more visible here than in a Word document.
# fonts-dejavu covers the broader Unicode range so non-Latin text does not
# render as tofu.
RUN apt-get update && apt-get install --no-install-recommends -y \
      libreoffice-impress \
      libreoffice-core \
      fonts-liberation \
      fonts-dejavu-core \
      fonts-noto-core \
      nodejs \
      curl \
    && rm -rf /var/lib/apt/lists/*

# Run as a non-root user. A converter is exactly the kind of service where an
# untrusted file meets a large parsing codebase, so if LibreOffice is ever
# exploited by a malformed presentation, it should not be exploited as root.
RUN useradd --create-home --shell /usr/sbin/nologin converter

WORKDIR /app
COPY server.mjs ./

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

# start-period is longer than the Word converter's 30s. server.mjs runs a real
# test conversion before it binds the port (the Impress probe), which adds a few
# seconds to boot on top of soffice's own warm-up. A health check that starts
# expecting answers mid-probe restarts a container that was about to be fine.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD curl -fsS http://127.0.0.1:${PORT}/health || exit 1

CMD ["node", "server.mjs"]
