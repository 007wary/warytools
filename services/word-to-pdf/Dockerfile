# DOCX -> PDF conversion service, built on LibreOffice.
#
# Note the sibling service (services/pdf-to-word) removed LibreOffice and says
# so at length. That is not a contradiction — it is the other direction.
# LibreOffice's PDF *import* produces absolutely-positioned textboxes instead
# of flowing paragraphs, which is why it lost the PDF->DOCX job. DOCX *export*
# is the same layout engine Writer renders with on screen, with PDF as its
# print target, and it is what almost every "convert to PDF" service runs.
#
# The cost is image size and cold start: LibreOffice is ~500 MB against
# pdf2docx's ~200 MB, and first-run is slower. That is the price of a real Word
# layout engine; there is no small one.
FROM debian:bookworm-slim

# libreoffice-writer rather than the full libreoffice metapackage: this service
# converts word processing documents only, and Calc/Impress/Base would add
# several hundred MB for filters that are never invoked. The Writer package
# still pulls the shared core that handles .doc, .odt, and .rtf.
#
# fonts-liberation is not optional. It provides the metric-compatible
# substitutes for Arial, Times New Roman, and Courier New — the fonts most
# Word documents actually use. Without them LibreOffice falls back to whatever
# it can find, and line breaks and page counts shift from the original, which
# is the single most visible way a converted PDF looks wrong.
# fonts-dejavu covers the broader Unicode range so non-Latin text does not
# render as tofu.
RUN apt-get update && apt-get install --no-install-recommends -y \
      libreoffice-writer \
      libreoffice-core \
      fonts-liberation \
      fonts-dejavu-core \
      fonts-noto-core \
      nodejs \
      curl \
    && rm -rf /var/lib/apt/lists/*

# Run as a non-root user. A converter is exactly the kind of service where an
# untrusted file meets a large parsing codebase, so if LibreOffice is ever
# exploited by a malformed document, it should not be exploited as root.
RUN useradd --create-home --shell /usr/sbin/nologin converter

WORKDIR /app
COPY server.mjs ./

ENV HOME=/home/converter
RUN mkdir -p /home/converter && chown -R converter:converter /home/converter /app

USER converter

# Warms the LibreOffice profile at build time rather than making the first user
# pay for it. A cold soffice builds its configuration tree on first run, which
# adds 10-15s to whichever conversion happens to be first. Each request still
# gets its own throwaway profile (see server.mjs) — this only primes the
# shared font and filter caches that live outside it.
RUN soffice --headless --terminate_after_init || true

# 7860 is what Hugging Face Spaces expects and routes to; Fly and Railway read
# the port from their own config, and server.mjs takes PORT from the
# environment either way.
ENV PORT=7860
EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD curl -fsS http://127.0.0.1:${PORT}/health || exit 1

CMD ["node", "server.mjs"]
