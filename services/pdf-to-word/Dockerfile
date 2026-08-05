# PDF -> DOCX conversion service, built on pdf2docx.
#
# Why not LibreOffice, which this image used to run: its PDF import produces a
# layout replica, not a document. Every text run lands in an absolutely
# positioned textbox — measured on a real affidavit, the output had 9 textboxes
# and zero flowing paragraphs. Blocks that shared vertical space in the
# original rendered stacked on top of each other, and nothing reflowed when
# edited, which defeats the point of converting to Word at all. That is a known
# LibreOffice limitation, not a misconfiguration; it is a general office suite
# doing PDF import as a side job.
#
# pdf2docx is purpose-built for this one conversion: it groups positioned
# glyphs back into paragraphs, detects tables, and emits ordinary flowing
# Word content. It is also what the open-source ecosystem converged on for
# exactly this task. (The commercial sites license Solid Documents or ABBYY —
# none of them use LibreOffice for PDF to Word either.)
#
# Bonus: no LibreOffice and no JVM means a far smaller image and a much faster
# cold start, which matters on a scale-to-zero machine.
FROM python:3.12-slim-bookworm

# PyMuPDF ships manylinux wheels, so no compiler is needed. opencv-python-headless
# still wants libGL and libglib at runtime even in its headless build.
# Node runs the HTTP server; the conversion itself is a Python subprocess.
RUN apt-get update && apt-get install --no-install-recommends -y \
      nodejs \
      curl \
      libgl1 \
      libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Pinned rather than floating: a conversion engine changing under us silently
# changes every user's output, and this one is the whole product.
RUN pip install --no-cache-dir pdf2docx==0.5.13

# Run as a non-root user. A converter is exactly the kind of service where an
# untrusted file meets a large parsing codebase, so if PyMuPDF is ever
# exploited by a malformed PDF, it should not be exploited as root.
RUN useradd --create-home --shell /usr/sbin/nologin converter

WORKDIR /app
COPY server.mjs convert.py ./

ENV HOME=/home/converter
RUN mkdir -p /home/converter && chown -R converter:converter /home/converter /app

USER converter

# 7860 is what Hugging Face Spaces expects and routes to; Fly and Railway read
# the port from their own config, and server.mjs takes PORT from the
# environment either way.
ENV PORT=7860
EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD curl -fsS http://127.0.0.1:${PORT}/health || exit 1

CMD ["node", "server.mjs"]
