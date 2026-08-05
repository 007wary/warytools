"use client";

import { useCallback, useRef, useState } from "react";
import { Minimize2 } from "lucide-react";
import FileDropzone from "@/components/FileDropzone";
import DownloadButton from "@/components/DownloadButton";
import ProgressBar from "@/components/ProgressBar";
import ErrorBanner from "@/components/ErrorBanner";
import PdfFileHeader from "@/components/PdfFileHeader";
import WarningBanner from "@/components/WarningBanner";
import { PrimaryButton, SecondaryButton } from "@/components/ToolButton";
import { formatBytes } from "@/lib/formatBytes";
import { validatePdfFile, describePdfError } from "@/lib/pdfFile";
import { usePdfWorker, ops } from "@/lib/pdfWorkerClient";
import { colors } from "@/lib/theme";
import { events, sizeBucket, trackEvent } from "@/lib/analytics";

export default function CompressPdfClient() {
  const [file, setFile] = useState(null);
  const [pageCount, setPageCount] = useState(null);
  const [error, setError] = useState("");
  const [resultBlob, setResultBlob] = useState(null);

  const { run, cancel, progress, isRunning } = usePdfWorker();
  const bytesRef = useRef(null);

  const resetState = useCallback(() => {
    setFile(null);
    setPageCount(null);
    setResultBlob(null);
    setError("");
    bytesRef.current = null;
  }, []);

  async function handleFiles(fileList) {
    setError("");
    setResultBlob(null);

    const check = await validatePdfFile(fileList[0]);
    if (!check.ok) {
      setError(check.error);
      return;
    }

    try {
      const bytes = await check.file.arrayBuffer();
      bytesRef.current = bytes;

      // Inspecting up front means the page count is on screen before the user
      // decides whether to compress, and it surfaces an unreadable file
      // immediately rather than after they press the button.
      const info = await run(ops.INSPECT, { bytes: bytes.slice(0) }, { transfer: [] });

      setFile(check.file);
      setPageCount(info.pageCount);
    } catch (err) {
      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "compress_read_failed" });
      setError(describePdfError(err, "Could not read this PDF."));
      resetState();
    }
  }

  async function handleCompress() {
    setError("");
    setResultBlob(null);

    try {
      const result = await run(
        ops.COMPRESS,
        { bytes: bytesRef.current.slice(0) },
        { transfer: [] }
      );

      const blob = new Blob([result.bytes], { type: "application/pdf" });
      setResultBlob(blob);

      trackEvent(events.TOOL_RUN, {
        page_count: result.pageCount,
        size_bucket: sizeBucket(file.size),
        // Whether compression actually helped — this tool can't recompress
        // images, so knowing the real-world hit rate is worth measuring.
        saved_percent:
          file.size > 0 ? Math.max(0, Math.round((1 - blob.size / file.size) * 100)) : 0,
      });
    } catch (err) {
      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "compress_failed" });
      setError(describePdfError(err, "Could not compress this PDF."));
    }
  }

  const savedPercent =
    resultBlob && file && file.size > 0
      ? Math.round((1 - resultBlob.size / file.size) * 100)
      : null;

  return (
    <div>
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
            disabled={isRunning}
          />

          <WarningBanner>
            This rebuilds the PDF&apos;s internal structure — it removes redundant objects and
            packs the cross-reference data. That shrinks text and vector-heavy PDFs noticeably,
            but scanned or photo-heavy files will barely change, because re-encoding embedded
            images isn&apos;t something a browser can do without degrading them.
          </WarningBanner>

          {isRunning && <ProgressBar progress={progress} indeterminate label="Rebuilding PDF…" />}

          <div
            style={{
              display: "flex",
              gap: "12px",
              alignItems: "center",
              flexWrap: "wrap",
              marginTop: "20px",
            }}
          >
            <PrimaryButton onClick={handleCompress} disabled={isRunning}>
              <Minimize2 size={16} />
              {isRunning ? "Compressing…" : "Compress PDF"}
            </PrimaryButton>

            {isRunning && <SecondaryButton onClick={cancel}>Cancel</SecondaryButton>}

            {resultBlob && !isRunning && (
              <DownloadButton getBlob={() => resultBlob} filename="compressed.pdf">
                Download compressed.pdf
              </DownloadButton>
            )}
          </div>

          {resultBlob && !isRunning && (
            <div
              style={{
                marginTop: "16px",
                padding: "12px 14px",
                borderRadius: "10px",
                border: `1px solid ${savedPercent > 0 ? colors.successSoftBorder : colors.border}`,
                backgroundColor: savedPercent > 0 ? colors.successSoft : colors.surfaceMuted,
                fontSize: "14px",
                color: colors.textSecondary,
              }}
            >
              {formatBytes(file.size)} → {formatBytes(resultBlob.size)}
              {savedPercent > 0 && (
                <span style={{ color: colors.success, fontWeight: 600 }}>
                  {" "}
                  ({savedPercent}% smaller)
                </span>
              )}
              {/* A negative result is real and worth stating: object streams
                  can add a few bytes to an already-optimised file. Reporting
                  it as "0% saved" would be a quiet lie about what the user
                  is about to download. */}
              {savedPercent !== null && savedPercent <= 0 && (
                <span style={{ color: colors.textMuted }}>
                  {" "}
                  — this PDF was already well optimised, so there was nothing left to remove.
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
