"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Hash } from "lucide-react";
import FileDropzone from "@/components/FileDropzone";
import DownloadButton from "@/components/DownloadButton";
import ProgressBar from "@/components/ProgressBar";
import ErrorBanner from "@/components/ErrorBanner";
import PdfFileHeader from "@/components/PdfFileHeader";
import { PrimaryButton, SecondaryButton } from "@/components/ToolButton";
import { validatePdfFile, describePdfError } from "@/lib/pdfFile";
import { usePdfThumbnails } from "@/lib/pdfThumbnails";
import { usePdfWorker, ops } from "@/lib/pdfWorkerClient";
import {
  POSITIONS,
  FORMATS,
  MARGINS,
  FONT_SIZES,
  DEFAULT_SETTINGS,
  findPosition,
  marginPoints,
  formatPageLabel,
  planPageNumbers,
  describePlan,
  validateNumbering,
} from "@/lib/pdfPageNumbers";
import { colors } from "@/lib/theme";
import { events, trackEvent } from "@/lib/analytics";

export default function AddPageNumbersClient() {
  const [file, setFile] = useState(null);
  const [bytes, setBytes] = useState(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [error, setError] = useState("");
  const [resultBlob, setResultBlob] = useState(null);

  const [positionId, setPositionId] = useState(DEFAULT_SETTINGS.positionId);
  const [formatId, setFormatId] = useState(DEFAULT_SETTINGS.formatId);
  const [marginId, setMarginId] = useState(DEFAULT_SETTINGS.marginId);
  const [fontSize, setFontSize] = useState(DEFAULT_SETTINGS.fontSize);

  // Held as raw strings, not numbers: Number("") is 0, so storing these as
  // numbers makes a cleared field indistinguishable from a deliberate zero.
  // Validated on submit by validateNumbering(). This caused real bugs in Split
  // PDF and Resize Image before the rule was written down.
  const [fromPageInput, setFromPageInput] = useState("1");
  const [startNumberInput, setStartNumberInput] = useState("1");

  const { pageCount, getThumbnail, isReady, error: renderError } = usePdfThumbnails(bytes);
  const { run, cancel, progress, isRunning } = usePdfWorker();

  const bytesRef = useRef(null);

  const resetState = useCallback(() => {
    setFile(null);
    setBytes(null);
    setPageIndex(0);
    setResultBlob(null);
    setError("");
    setFromPageInput("1");
    setStartNumberInput("1");
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
      const buffer = await check.file.arrayBuffer();
      bytesRef.current = buffer;

      setFile(check.file);
      setBytes(buffer);
      setPageIndex(0);
      setFromPageInput("1");
      setStartNumberInput("1");
    } catch (err) {
      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "page_numbers_read_failed" });
      setError(describePdfError(err, "Could not read this PDF."));
      resetState();
    }
  }

  // Read during render rather than mirrored into state — usePdfThumbnails bumps
  // its own version counter when a render finishes, so this picks up the new URL
  // without a second render pass. Same as Crop, Reorder, and Rotate.
  const preview = isReady && pageCount > 0 ? getThumbnail(pageIndex + 1) : null;

  // The plan is derived, not stored, so the preview below can never disagree
  // with what gets sent to the worker — they read the same value.
  const validation = useMemo(
    () => validateNumbering(fromPageInput, startNumberInput, pageCount || 1),
    [fromPageInput, startNumberInput, pageCount]
  );

  const plan = useMemo(() => {
    if (!validation.ok || !pageCount) return [];
    return planPageNumbers({
      pageCount,
      fromPage: validation.fromPage,
      startNumber: validation.startNumber,
    });
  }, [validation, pageCount]);

  // What the currently previewed page will be stamped with, or null if this page
  // is one of the skipped leading pages. Showing the real label — rather than a
  // generic "1" — is what makes the start-page and start-number controls
  // legible without running the tool.
  const previewLabel = useMemo(() => {
    const entry = plan.find((item) => item.index === pageIndex);
    if (!entry) return null;
    return formatPageLabel({ formatId, number: entry.number, total: plan.length });
  }, [plan, pageIndex, formatId]);

  async function handleApply() {
    setError("");
    setResultBlob(null);

    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    try {
      const result = await run(
        ops.ADD_PAGE_NUMBERS,
        {
          // slice(0) because bytes are *transferred* to the worker, not copied —
          // passing the original would detach it and leave a second run with a
          // zero-length buffer.
          bytes: bytesRef.current.slice(0),
          plan,
          formatId,
          positionId,
          marginPoints: marginPoints(marginId),
          fontSize,
        },
        { transfer: [] }
      );

      setResultBlob(new Blob([result.bytes], { type: "application/pdf" }));
      trackEvent(events.TOOL_RUN, {
        position: positionId,
        format: formatId,
        page_count: result.numberedCount,
        source_page_count: pageCount,
      });
    } catch (err) {
      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "page_numbers_failed" });
      setError(describePdfError(err, "Could not add page numbers to this PDF."));
    }
  }

  const position = findPosition(positionId);

  return (
    <div>
      {!file && (
        <FileDropzone
          onFiles={handleFiles}
          accept="application/pdf,.pdf"
          label="Drag & drop a PDF here, or click to browse"
        />
      )}

      <ErrorBanner>{error || renderError}</ErrorBanner>

      {file && !isReady && !renderError && (
        <p style={{ fontSize: "14px", color: colors.textMuted, marginTop: "16px" }}>Opening PDF…</p>
      )}

      {file && isReady && (
        <div style={{ marginTop: "20px" }}>
          <PdfFileHeader
            file={file}
            pageCount={pageCount}
            onReset={resetState}
            disabled={isRunning}
          />

          <div style={{ maxWidth: "460px", margin: "0 auto 20px", width: "100%" }}>
            {preview ? (
              <div style={{ position: "relative" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt={`Page ${pageIndex + 1}`}
                  draggable={false}
                  style={{
                    width: "100%",
                    display: "block",
                    border: `1px solid ${colors.border}`,
                    borderRadius: "6px",
                  }}
                />
                {/* The number's position previewed over the page.
                    Positioned in percentages against the *displayed* page, which
                    is the same frame placeNumber() works in — so a page with a
                    /Rotate shows the marker where the stamp actually lands
                    rather than where the unrotated maths would put it. */}
                {previewLabel !== null && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      [position.vertical]: "5%",
                      ...(position.horizontal === "center"
                        ? { left: "50%", transform: "translateX(-50%)" }
                        : { [position.horizontal]: "6%" }),
                      fontSize: `${Math.max(9, fontSize * 0.85)}px`,
                      fontFamily: "Helvetica, Arial, sans-serif",
                      color: "#000",
                      backgroundColor: "rgba(255,255,255,0.75)",
                      padding: "1px 4px",
                      borderRadius: "3px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {previewLabel}
                  </span>
                )}
              </div>
            ) : (
              <div
                style={{
                  aspectRatio: "1 / 1.414",
                  backgroundColor: colors.surfaceMuted,
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "13px",
                  color: colors.textFaint,
                }}
              >
                Rendering page…
              </div>
            )}

            {pageCount > 1 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                  marginTop: "12px",
                }}
              >
                <SecondaryButton
                  onClick={() => setPageIndex((index) => Math.max(0, index - 1))}
                  disabled={pageIndex === 0 || isRunning}
                >
                  Previous
                </SecondaryButton>
                <span style={{ fontSize: "13px", color: colors.textMuted }}>
                  Page {pageIndex + 1} of {pageCount}
                </span>
                <SecondaryButton
                  onClick={() => setPageIndex((index) => Math.min(pageCount - 1, index + 1))}
                  disabled={pageIndex === pageCount - 1 || isRunning}
                >
                  Next
                </SecondaryButton>
              </div>
            )}

            <p
              style={{
                fontSize: "13px",
                color: colors.textMuted,
                textAlign: "center",
                margin: "10px 0 0",
              }}
            >
              {previewLabel === null
                ? "This page is before the start page, so it won't be numbered."
                : `This page will show "${previewLabel}".`}
            </p>
          </div>

          <fieldset
            style={{
              border: `1px solid ${colors.border}`,
              borderRadius: "10px",
              padding: "16px",
              marginBottom: "20px",
            }}
          >
            <legend
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: colors.textSecondary,
                padding: "0 6px",
              }}
            >
              Numbering
            </legend>

            <div style={{ display: "grid", gap: "16px" }}>
              <Field label="Position">
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {POSITIONS.map((option) => (
                    <Chip
                      key={option.id}
                      active={positionId === option.id}
                      onClick={() => {
                        setPositionId(option.id);
                        setResultBlob(null);
                      }}
                      disabled={isRunning}
                    >
                      {option.label}
                    </Chip>
                  ))}
                </div>
              </Field>

              <Field label="Format">
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {FORMATS.map((option) => (
                    <Chip
                      key={option.id}
                      active={formatId === option.id}
                      onClick={() => {
                        setFormatId(option.id);
                        setResultBlob(null);
                      }}
                      disabled={isRunning}
                    >
                      {option.label}
                    </Chip>
                  ))}
                </div>
              </Field>

              <Field label="Margin">
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {MARGINS.map((option) => (
                    <Chip
                      key={option.id}
                      active={marginId === option.id}
                      onClick={() => {
                        setMarginId(option.id);
                        setResultBlob(null);
                      }}
                      disabled={isRunning}
                    >
                      {option.label}
                    </Chip>
                  ))}
                </div>
              </Field>

              <Field label="Text size">
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {FONT_SIZES.map((size) => (
                    <Chip
                      key={size}
                      active={fontSize === size}
                      onClick={() => {
                        setFontSize(size);
                        setResultBlob(null);
                      }}
                      disabled={isRunning}
                    >
                      {size} pt
                    </Chip>
                  ))}
                </div>
              </Field>

              <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                {/* Two controls rather than one, because they answer different
                    questions: which page gets stamped first, and what that page
                    is called. A single "start at" can't express "skip the cover
                    and call the next page 1", which is the common request. */}
                <NumberBox
                  label="Start on page"
                  value={fromPageInput}
                  onChange={(value) => {
                    setFromPageInput(value);
                    setResultBlob(null);
                  }}
                  hint={`1 to ${pageCount}`}
                  disabled={isRunning}
                />
                <NumberBox
                  label="First number"
                  value={startNumberInput}
                  onChange={(value) => {
                    setStartNumberInput(value);
                    setResultBlob(null);
                  }}
                  hint="Usually 1"
                  disabled={isRunning}
                />
              </div>

              <p style={{ fontSize: "13px", color: colors.textFaint, margin: 0 }}>
                {validation.ok ? describePlan(plan, positionId) : validation.error}
              </p>
            </div>
          </fieldset>

          {isRunning && <ProgressBar progress={progress} indeterminate label="Adding page numbers…" />}

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "20px" }}>
            <PrimaryButton onClick={handleApply} disabled={isRunning || !validation.ok}>
              <Hash size={16} />
              {isRunning ? "Adding…" : "Add page numbers"}
            </PrimaryButton>

            {isRunning && <SecondaryButton onClick={cancel}>Cancel</SecondaryButton>}

            {resultBlob && !isRunning && (
              <DownloadButton getBlob={() => resultBlob} filename="numbered.pdf">
                Download numbered.pdf
              </DownloadButton>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <span
        style={{
          display: "block",
          fontSize: "13px",
          fontWeight: 500,
          color: colors.textSecondary,
          marginBottom: "8px",
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

// type="text" with inputMode="numeric", not type="number" — the same reasoning
// as NumberField in the calculators: type="number" changes its value when the
// wheel scrolls over a focused field, and discards pasted text outright.
function NumberBox({ label, value, onChange, hint, disabled }) {
  return (
    <label style={{ display: "block", fontSize: "13px", color: colors.textSecondary }}>
      <span style={{ display: "block", fontWeight: 500, marginBottom: "6px" }}>{label}</span>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        style={{
          width: "110px",
          padding: "8px 10px",
          fontSize: "14px",
          color: colors.text,
          backgroundColor: colors.surface,
          border: `1px solid ${colors.borderInput}`,
          borderRadius: "8px",
        }}
      />
      <span style={{ display: "block", fontSize: "12px", color: colors.textFaint, marginTop: "4px" }}>
        {hint}
      </span>
    </label>
  );
}

function Chip({ active, onClick, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      style={{
        border: `1px solid ${active ? colors.primary : colors.border}`,
        backgroundColor: active ? colors.primarySoft : colors.surface,
        color: active ? colors.primary : colors.textSecondary,
        borderRadius: "999px",
        padding: "6px 14px",
        fontSize: "13px",
        fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
