"""Convert a PDF to DOCX with pdf2docx.

Invoked as a subprocess by server.mjs rather than imported, so a crash in the
parsing layer (PyMuPDF is a large C library reading untrusted files) kills one
process instead of taking the HTTP server down with it. The parent enforces a
kill timeout on top of this.

Usage: python3 convert.py <input.pdf> <output.docx>

Writes a single machine-readable token to stderr so the Node side can map the
result onto a user-facing message without parsing English:

    (exit 0, no token)  clean conversion
    partial   (exit 0)  converted, but at least one page failed to parse and
                        was dropped — the .docx is usable but incomplete, and
                        the user must be told so rather than left to discover
                        it later
    encrypted (exit 1)  the PDF needs a password we do not have
    empty     (exit 1)  parsed fine but contains no extractable content
    failed    (exit 1)  anything else
"""

import sys
import logging


def _silence_library_logging() -> None:
    """Stops pdf2docx's progress logging from reaching stderr.

    This is correctness, not tidiness. pdf2docx logs to *stderr* (not stdout,
    as this file previously claimed), and stderr is the channel this script
    uses to report its one-word result. server.mjs reads the LAST line of
    stderr, so the library's closing "[INFO] Terminated in 0.04s." would be
    read as the result token and the "partial" signal would never arrive —
    silently downgrading an incomplete-document warning into a clean success.

    Setting the root logger's level is not enough on its own: pdf2docx calls
    logging.basicConfig() at import time, which installs its own handler and
    overrides a level set beforehand. So this runs *after* the import and
    removes the handlers outright.
    """
    logging.disable(logging.CRITICAL)
    root = logging.getLogger()
    for handler in root.handlers[:]:
        root.removeHandler(handler)
    root.setLevel(logging.CRITICAL)


# Deviations from pdf2docx's defaults. Everything not listed here is left at
# its default deliberately — this is a conversion engine tuned by people who
# measured it, and second-guessing it wholesale produces worse output, not
# better. Each entry below is a case where our context differs from the
# library's generic one.
CONVERT_SETTINGS = {
    # OFF, and load-bearing. The container caps concurrency at 2 already, and
    # pdf2docx spawning its own pool inside a memory-capped machine is how it
    # gets OOM-killed on a large document. It also cannot be combined with a
    # page list, and it reopens the file per worker.
    "multi_processing": False,
    #
    # OFF, overriding the library default of True. With it on, a page that
    # fails to parse is silently skipped and the conversion still "succeeds" —
    # so a 40-page contract can come back as a 38-page .docx with two pages
    # missing and nothing anywhere saying so. For a tool whose output people
    # sign and send, silently dropping content is the worst available failure:
    # a visible error lets the user try something else, a quiet omission does
    # not. We would rather refuse the file than hand back a document with
    # holes in it.
    "ignore_page_error": False,
    #
    # Two settings that look like output-quality wins and are not. Both were
    # measured against pdf2docx 0.5.13 before being left at their defaults, and
    # both are recorded here so the next person does not re-add them on the
    # strength of the name alone.
    #
    # extract_stream_table is NOT set. Borderless tables — the shape almost
    # every invoice and CV uses — are already recovered, by parse_stream_table,
    # which is on by default. This flag is read only inside extract_tables(),
    # a separate text-extraction API the DOCX path never calls, so setting it
    # changes nothing at all about what the user downloads. Verified: a
    # borderless 4x3 invoice table converts identically with it on and off.
    #
    # delete_end_line_hyphen is deliberately left OFF (the library default).
    #
    # The name suggests it rejoins words split across a line break. Measured
    # against pdf2docx 0.5.13, it does not: it deletes the hyphen character and
    # leaves the line break in place, so "compre-\nhensive" becomes
    # "compre\nhensive" — a word split by whitespace, with the only clue that
    # it was ever one word now removed. Verified at the docx run level; the
    # runs go from ['...compre-', '\n', 'hensive...'] to ['...compre', '\n',
    # 'hensive...'].
    #
    # That is strictly worse than leaving it alone. A reader still parses
    # "compre-hensive" as one hyphenated word, and search still finds it on the
    # "compre-" stem; "compre hensive" defeats spellcheck and find-and-replace
    # both. Turning this on to "improve output" would have silently corrupted
    # every hyphenated line break in every converted document.
}


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

    # Imported for its side effect of proving the dependency is present, so a
    # broken image fails here with a clear cause rather than midway through
    # _run where it would be misread as a bad document.
    try:
        import pdf2docx  # noqa: F401
    except ImportError:
        print("failed", file=sys.stderr)
        return 1

    # After the import, never before: pdf2docx runs logging.basicConfig() at
    # import time, so anything configured earlier is overridden.
    _silence_library_logging()

    # Strict first, lenient only as a fallback.
    #
    # Running strict alone would turn one unparseable page into a total loss
    # for a document that is otherwise fine. Running lenient alone is what we
    # had: pages vanish silently and the user finds out when someone else
    # reads the document. Doing strict first and falling back gives the good
    # outcome in both cases — a complete document when one is achievable, and
    # an explicitly-degraded one when it is not, flagged so the route can tell
    # the user which they got.
    #
    # The retry costs a second parse, but only on documents that already
    # failed, which are rare and already the slow path.
    outcome = _run(src, dst, CONVERT_SETTINGS)
    if outcome == "ok":
        return 0

    # A password failure will not be fixed by retrying more leniently, and the
    # retry costs a full second parse of a document we already know is a dead
    # end. Only a page-level parse failure is worth another attempt.
    if outcome == "encrypted":
        print("encrypted", file=sys.stderr)
        return 1

    lenient = {**CONVERT_SETTINGS, "ignore_page_error": True}
    if _run(src, dst, lenient) == "ok":
        # Exit 0 — the user gets a usable document — but say on stderr that it
        # is incomplete. server.mjs reads this token and passes it through so
        # the UI can warn rather than claim a clean conversion.
        print("partial", file=sys.stderr)
        return 0

    print("failed", file=sys.stderr)
    return 1


def _run(src: str, dst: str, settings: dict) -> str:
    """Runs one conversion attempt.

    Returns "ok", "encrypted", or "failed". Exceptions are classified here
    rather than at the call site so both attempts agree on what a given
    failure means.
    """
    from pdf2docx import Converter

    converter = Converter(src)
    try:
        converter.convert(dst, start=0, end=None, **settings)
        return "ok"
    except Exception as error:
        message = str(error).lower()
        if "password" in message or "encrypt" in message:
            return "encrypted"
        return "failed"
    finally:
        converter.close()


if __name__ == "__main__":
    sys.exit(main())
