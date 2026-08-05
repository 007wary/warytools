"use client";

import { useCallback, useRef, useState } from "react";
import { FileType2, ShieldAlert } from "lucide-react";
import FileDropzone from "@/components/FileDropzone";
import DownloadButton from "@/components/DownloadButton";
import ProgressBar from "@/components/ProgressBar";
import ErrorBanner from "@/components/ErrorBanner";
import PdfFileHeader from "@/components/PdfFileHeader";
import WarningBanner from "@/components/WarningBanner";
import { PrimaryButton, SecondaryButton } from "@/components/ToolButton";
import { validatePdfFile, describePdfError } from "@/lib/pdfFile";
import { usePdfWorker, ops } from "@/lib/pdfWorkerClient";
import {
  checkUploadSize,
  checkPageCount,
  looksScanned,
  rejectionMessage,
  docxFilename,
} from "@/lib/pdfToWordLimits";
import { colors } from "@/lib/theme";
import { events, sizeBucket, trackEvent } from "@/lib/analytics";

// How many pages to sample when deciding whether a PDF is a scan. Reading
// every page's text on a 200-page document would take longer than the
// conversion; a scan is uniform enough that the first few pages settle it.
const SCAN_SAMPLE_PAGES = 3;

export default function PdfToWordClient() {
  const [file, setFile] = useState(null);
  const [pageCount, setPageCount] = useState(null);
  const [isSlow, setIsSlow] = useState(false);
  const [error, setError] = useState("");
  const [resultBlob, setResultBlob] = useState(null);
  const [isConverting, setIsConverting] = useState(false);

  const { run } = usePdfWorker();
  const fileRef = useRef(null);
  const abortRef = useRef(null);

  const resetState = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setFile(null);
    setPageCount(null);
    setIsSlow(false);
    setResultBlob(null);
    setError("");
    setIsConverting(false);
    fileRef.current = null;
  }, []);

  /**
   * Reads text from the first few pages to tell a real document from a scan.
   *
   * Done here rather than server-side because it's the difference between
   * uploading a file that can't work and not uploading it at all — the check
   * that saves the user the round trip has to run before the round trip.
   */
  async function sampleText(bytes) {
    // Imported dynamically, never at module scope: pdf.js touches DOMMatrix on
    // evaluation, which doesn't exist in Node, and these pages are statically
    // prerendered. A top-level import fails the build outright.
    const pdfjsLib = (await import("@/lib/pdfjs")).default;
    const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
    try {
      const limit = Math.min(SCAN_SAMPLE_PAGES, doc.numPages);
      const texts = [];

      for (let i = 1; i <= limit; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        texts.push(content.items.map((item) => item.str).join(" "));
      }

      return texts;
    } finally {
      // pdf.js holds a worker and transferred buffers per document; without
      // this a user checking several files leaks one per attempt.
      await doc.destroy();
    }
  }

  async function handleFiles(fileList) {
    setError("");
    setResultBlob(null);

    const candidate = fileList[0];

    const check = await validatePdfFile(candidate);
    if (!check.ok) {
      setError(check.error);
      return;
    }

    // Size is checked against this tool's own (much lower) ceiling, not the
    // 100 MB in-browser limit — a shared converter has different constraints
    // than the user's own tab.
    const size = checkUploadSize(check.file.size);
    if (!size.ok) {
      setError(rejectionMessage(size.reason));
      return;
    }

    try {
      const bytes = await check.file.arrayBuffer();

      const info = await run(ops.INSPECT, { bytes: bytes.slice(0) }, { transfer: [] });

      const pages = checkPageCount(info.pageCount);
      if (!pages.ok) {
        setError(rejectionMessage(pages.reason));
        return;
      }

      const texts = await sampleText(bytes.slice(0));
      if (looksScanned(texts)) {
        trackEvent(events.TOOL_ERROR, { reason: "pdf_to_word_scanned" });
        setError(rejectionMessage("scanned"));
        return;
      }

      fileRef.current = check.file;
      setFile(check.file);
      setPageCount(info.pageCount);
      setIsSlow(size.isSlow);
    } catch (err) {
      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "pdf_to_word_read_failed" });

      // Clear the file state WITHOUT going through resetState(): that helper
      // also clears the error, so calling it here wiped the message on the
      // very next line and the user saw nothing at all — no file, no error,
      // no explanation for why picking a PDF appeared to do nothing.
      setFile(null);
      setPageCount(null);
      setIsSlow(false);
      setResultBlob(null);
      fileRef.current = null;

      setError(describePdfError(err, "Could not read this PDF."));
    }
  }

  async function handleConvert() {
    setError("");
    setResultBlob(null);
    setIsConverting(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/pdf-to-word", {
        method: "POST",
        headers: { "Content-Type": "application/pdf" },
        body: fileRef.current,
        signal: controller.signal,
      });

      if (!response.ok) {
        // The route always sends a JSON message chosen from
        // pdfToWordLimits.rejectionMessage, so the copy the user sees is the
        // same on both sides of the network.
        let message = rejectionMessage("convert_failed");
        try {
          const body = await response.json();
          if (body?.error) message = body.error;
        } catch {
          // Non-JSON response (a platform error page); keep the fallback.
        }

        trackEvent(events.TOOL_ERROR, { reason: `pdf_to_word_${response.status}` });
        setError(message);
        return;
      }

      const blob = await response.blob();
      setResultBlob(blob);

      trackEvent(events.TOOL_RUN, {
        page_count: pageCount,
        size_bucket: sizeBucket(fileRef.current.size),
      });
    } catch (err) {
      // An abort is the user resetting or navigating, not a failure — showing
      // an error for something they deliberately did would be noise.
      if (err?.name === "AbortError") return;

      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "pdf_to_word_network" });
      setError(
        "Could not reach the converter. Check your connection and try again."
      );
    } finally {
      setIsConverting(false);
      abortRef.current = null;
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsConverting(false);
  }

  return (
    <div>
      {/* Shown before the file picker, not after: this is the one tool on the
          site that uploads, and the moment to say so is before someone chooses
          a document, not after. */}
      <div
        style={{
          display: "flex",
          gap: "10px",
          alignItems: "flex-start",
          backgroundColor: colors.surfaceMuted,
          border: `1px solid ${colors.border}`,
          borderRadius: "10px",
          padding: "12px 14px",
          marginBottom: "20px",
        }}
      >
        <ShieldAlert
          size={16}
          style={{ color: colors.textMuted, flexShrink: 0, marginTop: "1px" }}
        />
        <p style={{ fontSize: "13px", color: colors.textSecondary, lineHeight: 1.5, margin: 0 }}>
          <strong style={{ color: colors.text }}>This tool uploads your file.</strong> Unlike
          every other tool here, Word conversion can&apos;t run in a browser — your PDF is sent
          to our converter, turned into a .docx, and deleted immediately afterwards. Nothing is
          stored or logged. If the document is confidential, use desktop software instead.
        </p>
      </div>

      {!file && (
        <FileDropzone
          onFiles={handleFiles}
          accept="application/pdf,.pdf"
          label="Drag & drop a PDF here, or click to browse"
        />
      )}

      <ErrorBanner>{error}</ErrorBanner>

      {file && (
        <div style={{ marginTop: "20px" }}>
          <PdfFileHeader
            file={file}
            pageCount={pageCount}
            onReset={resetState}
            disabled={isConverting}
          />

          {isSlow && (
            <WarningBanner>
              This is a large PDF, so conversion may take up to a minute. Keep this tab open —
              closing it cancels the conversion.
            </WarningBanner>
          )}

          {/* Indeterminate throughout: the converter is a single opaque step
              with no per-page progress to report, and a bar that invented one
              would be lying about how far along it is. */}
          {isConverting && (
            <ProgressBar indeterminate label="Converting to Word — this can take a moment…" />
          )}

          <div
            style={{
              display: "flex",
              gap: "12px",
              alignItems: "center",
              flexWrap: "wrap",
              marginTop: "20px",
            }}
          >
            <PrimaryButton onClick={handleConvert} disabled={isConverting}>
              <FileType2 size={16} />
              {isConverting ? "Converting…" : "Convert to Word"}
            </PrimaryButton>

            {isConverting && <SecondaryButton onClick={handleCancel}>Cancel</SecondaryButton>}

            {resultBlob && !isConverting && (
              <DownloadButton
                getBlob={() => resultBlob}
                filename={docxFilename(file.name)}
              >
                Download {docxFilename(file.name)}
              </DownloadButton>
            )}
          </div>

          {resultBlob && !isConverting && (
            <div
              style={{
                marginTop: "16px",
                padding: "12px 14px",
                borderRadius: "10px",
                border: `1px solid ${colors.successSoftBorder}`,
                backgroundColor: colors.successSoft,
                fontSize: "14px",
                color: colors.textSecondary,
                lineHeight: 1.5,
              }}
            >
              Converted. Open it in Word, Google Docs, or LibreOffice and edit as normal.
              {/* Said after the fact as well as before: a user comparing the
                  output to the original needs to know which differences are
                  expected rather than assuming the tool malfunctioned. */}
              <span style={{ color: colors.textMuted }}>
                {" "}
                Complex layouts — multi-column pages, intricate tables — may need tidying up.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
