"""Convert a PDF to DOCX with pdf2docx.

Invoked as a subprocess by server.mjs rather than imported, so a crash in the
parsing layer (PyMuPDF is a large C library reading untrusted files) kills one
process instead of taking the HTTP server down with it. The parent enforces a
kill timeout on top of this.

Usage: python3 convert.py <input.pdf> <output.docx>

Exits 0 on success. On failure, writes a single machine-readable token to
stderr and exits non-zero, so the Node side can map it onto a user-facing
message without parsing English:

    encrypted   the PDF needs a password we do not have
    empty       parsed fine but contains no extractable content
    failed      anything else
"""

import sys

# Silences pdf2docx's own progress chatter. It writes conversion logs to
# stdout, which is noise in a service context and would end up interleaved
# with nothing useful in the container logs.
import logging

logging.getLogger().setLevel(logging.ERROR)


def main() -> int:
    if len(sys.argv) != 3:
        print("usage", file=sys.stderr)
        return 2

    src, dst = sys.argv[1], sys.argv[2]

    try:
        import fitz  # PyMuPDF, pulled in by pdf2docx
    except ImportError:
        print("failed", file=sys.stderr)
        return 1

    # Open with PyMuPDF first to tell the failure modes apart. Letting
    # pdf2docx raise gives one generic exception for "needs a password" and
    # "file is shredded", which need completely different advice.
    try:
        doc = fitz.open(src)
    except Exception:
        print("failed", file=sys.stderr)
        return 1

    try:
        if doc.needs_pass:
            # An empty-password unlock covers the common case of an owner
            # password that restricts editing but not opening — the same
            # documents every PDF reader opens without prompting.
            if not doc.authenticate(""):
                print("encrypted", file=sys.stderr)
                return 1

        if doc.page_count == 0:
            print("empty", file=sys.stderr)
            return 1
    finally:
        doc.close()

    try:
        from pdf2docx import Converter
    except ImportError:
        print("failed", file=sys.stderr)
        return 1

    converter = Converter(src)
    try:
        # multi_processing is deliberately off: the container caps concurrency
        # already, and pdf2docx spawning its own workers inside a memory-capped
        # machine is how it gets OOM-killed on a large document.
        converter.convert(dst, start=0, end=None)
    except Exception as error:
        message = str(error).lower()
        if "password" in message or "encrypt" in message:
            print("encrypted", file=sys.stderr)
        else:
            print("failed", file=sys.stderr)
        return 1
    finally:
        converter.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
