# LibreOffice headless as a single-purpose PDF -> DOCX conversion service.
#
# Why a container rather than a Vercel function: LibreOffice is a several
# hundred MB install with a Java runtime, far past the serverless bundle limit,
# and a conversion routinely runs longer than a serverless execution window.
# This is the same engine most commercial converters use, so output quality is
# comparable rather than a compromise.
#
# Debian slim over Alpine deliberately: LibreOffice on musl has long-standing
# font and rendering quirks, and this service exists to produce documents that
# look right.
FROM debian:bookworm-slim

# libreoffice-writer alone (not the full suite) — this service only ever opens
# a PDF and writes a DOCX, so Calc/Impress/Base would be dead weight in the
# image and a larger attack surface.
#
# The font packages are not optional. Without them LibreOffice falls back to a
# single default face and every converted document comes out in the wrong font
# with reflowed line breaks. liberation covers the Arial/Times/Courier metric
# equivalents that most PDFs reference; dejavu covers broader Unicode.
RUN apt-get update && apt-get install --no-install-recommends -y \
      libreoffice-writer \
      default-jre-headless \
      fonts-liberation \
      fonts-dejavu-core \
      ca-certificates \
      curl \
      nodejs \
    && rm -rf /var/lib/apt/lists/*

# Run as a non-root user. A converter is exactly the kind of service where an
# untrusted file meets a large C++ codebase, so if LibreOffice is ever exploited
# by a malformed PDF, it should not be exploited as root.
RUN useradd --create-home --shell /usr/sbin/nologin converter

WORKDIR /app
COPY server.mjs ./

# LibreOffice needs a writable HOME for its user profile. Without this it tries
# to write to / and every conversion fails with an opaque error.
ENV HOME=/home/converter
RUN mkdir -p /home/converter && chown -R converter:converter /home/converter /app

USER converter

# 7860 is what Hugging Face Spaces expects and routes to; Fly and Railway read
# the port from their own config, and server.mjs takes PORT from the
# environment either way. Defaulting to 7860 means the image runs on HF with no
# configuration at all, without preventing it running anywhere else.
ENV PORT=7860
EXPOSE 7860

# Health endpoint, also used by Fly/Railway checks. Hitting it warms the
# LibreOffice profile so the first real conversion isn't the one that pays for
# it — worth more on a free tier that sleeps than on an always-on machine.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD curl -fsS http://127.0.0.1:${PORT}/health || exit 1

CMD ["node", "server.mjs"]
