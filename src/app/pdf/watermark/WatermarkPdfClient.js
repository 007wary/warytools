"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Droplets } from "lucide-react";
import FileDropzone from "@/components/FileDropzone";
import DownloadButton from "@/components/DownloadButton";
import ProgressBar from "@/components/ProgressBar";
import ErrorBanner from "@/components/ErrorBanner";
import PdfFileHeader from "@/components/PdfFileHeader";
import { PrimaryButton, SecondaryButton } from "@/components/ToolButton";
import { validatePdfFile, describePdfError } from "@/lib/pdfFile";
import { validateImageFile } from "@/lib/imageValidation";
import { usePdfThumbnails } from "@/lib/pdfThumbnails";
import { usePdfWorker, ops } from "@/lib/pdfWorkerClient";
import { planEmbed } from "@/lib/pdfImageEmbed";
import { parsePageSelection, formatPageSelection } from "@/lib/pdfPageRange";
import {
  LAYOUTS,
  POSITIONS,
  ROTATIONS,
  OPACITIES,
  TEXT_SIZES,
  IMAGE_SIZES,
  COLORS,
  TILE_DENSITIES,
  DEFAULT_SETTINGS,
  MAX_TEXT_LENGTH,
  findRotation,
  findOpacity,
  findColor,
  findTextSize,
  findImageSize,
  validateWatermarkText,
  describeWatermark,
  planMarks,
  rotatedFootprint,
} from "@/lib/pdfWatermark";
import { formatBytes } from "@/lib/formatBytes";
import { colors } from "@/lib/theme";
import { events, trackEvent } from "@/lib/analytics";

// Suggestions rather than a fixed list — the field stays free text, since the
// point of a watermark is often a company name or a case number. These just
// remove the typing for the three cases that cover most uses.
const TEXT_PRESETS = ["CONFIDENTIAL", "DRAFT", "COPY", "DO NOT COPY", "SAMPLE"];

export default function WatermarkPdfClient() {
  const [file, setFile] = useState(null);
  const [bytes, setBytes] = useState(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [error, setError] = useState("");
  const [resultBlob, setResultBlob] = useState(null);

  const [mode, setMode] = useState(DEFAULT_SETTINGS.mode);
  const [text, setText] = useState(DEFAULT_SETTINGS.text);
  const [layoutId, setLayoutId] = useState(DEFAULT_SETTINGS.layoutId);
  const [positionId, setPositionId] = useState(DEFAULT_SETTINGS.positionId);
  const [rotationId, setRotationId] = useState(DEFAULT_SETTINGS.rotationId);
  const [opacityId, setOpacityId] = useState(DEFAULT_SETTINGS.opacityId);
  const [textSizeId, setTextSizeId] = useState(DEFAULT_SETTINGS.textSizeId);
  const [imageSizeId, setImageSizeId] = useState(DEFAULT_SETTINGS.imageSizeId);
  const [colorId, setColorId] = useState(DEFAULT_SETTINGS.colorId);
  const [densityId, setDensityId] = useState(DEFAULT_SETTINGS.densityId);

  // The logo for image mode, plus its sniffed type and natural dimensions —
  // needed to size the mark and to lay out the preview.
  const [logo, setLogo] = useState(null);

  // Free-text page selection, held as a raw string for the reason
  // pdfPageRange.js documents. Empty means "every page", which is what a
  // watermark almost always wants — so the field is optional rather than
  // something to fill in before the tool works.
  const [pagesInput, setPagesInput] = useState("");

  // True page dimensions and /Rotate, from the worker's INSPECT op — the
  // thumbnail hook only reports a page count. Sizing the mark against a guessed
  // A4 would give the wrong size on every non-A4 document and place it wrongly
  // on every rotated page, with nothing to indicate it.
  const [pageSizes, setPageSizes] = useState([]);

  const { pageCount, getThumbnail, isReady, error: renderError } = usePdfThumbnails(bytes);
  const { run, cancel, progress, isRunning } = usePdfWorker();

  const bytesRef = useRef(null);

  const resetState = useCallback(() => {
    setFile(null);
    setBytes(null);
    setPageIndex(0);
    setResultBlob(null);
    setError("");
    setPagesInput("");
    setPageSizes([]);
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

      // INSPECT gives page dimensions and rotations without a second parse in
      // the client — the worker already has the document open for this. Same
      // pattern as Crop, which needs the identical information.
      const info = await run(ops.INSPECT, { bytes: buffer.slice(0) }, { transfer: [] });

      setFile(check.file);
      setBytes(buffer);
      setPageSizes(info.pages);
      setPageIndex(0);
      setPagesInput("");
    } catch (err) {
      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "watermark_read_failed" });
      setError(describePdfError(err, "Could not read this PDF."));
      resetState();
    }
  }

  /**
   * Accepts the watermark image.
   *
   * Sniffed by the same validator the image tools use rather than trusting
   * file.type — Windows without a handler and most Android file providers report
   * an empty type for a perfectly good image. It also catches HEIC, which no
   * browser can decode and which would otherwise fail with a generic error.
   *
   * The natural dimensions are read here rather than in the worker: the worker
   * has no canvas, and the preview needs them anyway to lay the mark out.
   */
  async function handleLogoFiles(fileList) {
    setError("");
    setResultBlob(null);

    const check = await validateImageFile(fileList[0]);
    if (!check.ok) {
      setError(check.error);
      return;
    }

    try {
      const bitmap = await createImageBitmap(check.file);
      const { width, height } = bitmap;
      bitmap.close?.();

      setLogo({ file: check.file, type: check.type, width, height });
    } catch (err) {
      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "watermark_logo_decode_failed" });
      setError("Could not read that image. Try a PNG or JPG.");
    }
  }

  // Read during render rather than mirrored into state — usePdfThumbnails bumps
  // its own version counter when a render finishes, so this picks up the new URL
  // without a second render pass. Same as Crop, Reorder, and Page Numbers.
  const preview = isReady && pageCount > 0 ? getThumbnail(pageIndex + 1) : null;

  const textCheck = useMemo(() => validateWatermarkText(text), [text]);

  // Empty means every page, so the "error" state of an untouched field isn't
  // surfaced as one. Anything typed is validated properly.
  const pageSelection = useMemo(() => {
    if (!pageCount) return { ok: true, pages: [] };
    if (pagesInput.trim() === "") {
      return { ok: true, pages: Array.from({ length: pageCount }, (_, i) => i + 1) };
    }
    return parsePageSelection(pagesInput, pageCount);
  }, [pagesInput, pageCount]);

  // Deduplicated and sorted on the way to the worker: unlike Split, where a
  // repeated page is a deliberate request for two copies, stamping the same page
  // twice just doubles the ink.
  const pageIndices = useMemo(() => {
    if (!pageSelection.ok) return [];
    return [...new Set(pageSelection.pages)].sort((a, b) => a - b).map((page) => page - 1);
  }, [pageSelection]);

  const ready =
    mode === "text" ? textCheck.ok : Boolean(logo);
  const canRun = ready && pageSelection.ok && pageIndices.length > 0 && !isRunning;

  // The previewed page's true dimensions, so the on-screen mark is laid out
  // against the same frame the worker will use. Falls back to A4 before the
  // document has been inspected.
  const previewPage = pageSizes[pageIndex];
  const pageWidth = previewPage?.width || 595.28;
  const pageHeight = previewPage?.height || 841.89;
  const pageRotation = previewPage?.rotation || 0;

  const previewMarks = useMemo(() => {
    if (!isReady) return [];
    if (mode === "text" && !textCheck.ok) return [];
    if (mode === "image" && !logo) return [];

    const box = { x: 0, y: 0, width: pageWidth, height: pageHeight };
    const quarterTurned = pageRotation % 180 !== 0;
    const displayWidth = quarterTurned ? pageHeight : pageWidth;
    const displayHeight = quarterTurned ? pageWidth : pageHeight;

    // Approximated rather than measured with the real font metrics, which would
    // mean loading pdf-lib into the page bundle purely to draw a preview. The
    // 0.62 factor is Helvetica-Bold's rough average advance width, close enough
    // that the preview shows the right layout and density; the worker measures
    // properly for the output. This is a preview, not the source of truth.
    let markWidth;
    let markHeight;

    if (mode === "text") {
      const fontSize = Math.max(8, Math.min(displayWidth, displayHeight) * findTextSize(textSizeId).scale);
      markWidth = text.length * fontSize * 0.62;
      markHeight = fontSize;
    } else {
      const scale = findImageSize(imageSizeId).scale;
      markWidth = Math.min(displayWidth, displayHeight) * scale;
      markHeight = (markWidth * logo.height) / logo.width;
    }

    return planMarks({
      layoutId,
      positionId,
      markWidth,
      markHeight,
      markRotation: findRotation(rotationId).degrees,
      densityId,
      box,
      pageRotation,
    }).map((mark) => ({ ...mark, markWidth, markHeight }));
  }, [
    isReady,
    mode,
    text,
    textCheck.ok,
    logo,
    layoutId,
    positionId,
    rotationId,
    textSizeId,
    imageSizeId,
    densityId,
    pageWidth,
    pageHeight,
    pageRotation,
  ]);

  async function handleApply() {
    setError("");
    setResultBlob(null);

    if (mode === "text" && !textCheck.ok) {
      setError(textCheck.error);
      return;
    }
    if (mode === "image" && !logo) {
      setError("Choose an image to use as the watermark.");
      return;
    }
    if (!pageSelection.ok) {
      setError(pageSelection.error);
      return;
    }

    try {
      // pdf-lib embeds only JPEG and PNG — there is no WebP or AVIF filter in
      // the PDF spec — so anything else is transcoded on the way in, exactly as
      // JPG to PDF does it. Reusing planEmbed keeps the two tools' rules in one
      // place rather than drifting apart.
      let imageBytes = null;
      let imageEmbedAs = null;

      if (mode === "image") {
        const plan = planEmbed(logo.type);
        const source = plan.transcodeTo ? await transcode(logo.file, plan.transcodeTo) : logo.file;
        imageBytes = await source.arrayBuffer();
        imageEmbedAs = plan.embedAs;
      }

      const result = await run(
        ops.WATERMARK,
        {
          // slice(0) because bytes are *transferred* to the worker, not copied —
          // passing the original would detach it and leave a second run with a
          // zero-length buffer.
          bytes: bytesRef.current.slice(0),
          mode,
          text: textCheck.ok ? textCheck.text : "",
          imageBytes,
          imageEmbedAs,
          pageIndices,
          layoutId,
          positionId,
          rotationId,
          opacityId,
          textSizeId,
          imageSizeId,
          colorId,
          densityId,
        },
        // The logo buffer is transferred; it is rebuilt from the source file on
        // any re-run, so detaching it here costs nothing.
        { transfer: imageBytes ? [imageBytes] : [] }
      );

      setResultBlob(new Blob([result.bytes], { type: "application/pdf" }));
      trackEvent(events.TOOL_RUN, {
        mode,
        layout: layoutId,
        rotation: rotationId,
        page_count: result.markedCount,
        source_page_count: pageCount,
      });
    } catch (err) {
      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "watermark_failed" });
      setError(describePdfError(err, "Could not watermark this PDF."));
    }
  }

  /**
   * Re-encodes an image into something pdf-lib can embed.
   *
   * Same shape as JpgToPdfClient's, and for the same reasons: the image worker's
   * contract is a whole-batch resize job, so threading a "just re-encode this
   * one" mode through it would complicate a shared module for a single caller.
   * `imageOrientation: "from-image"` applies EXIF rotation — without it a
   * portrait photo used as a watermark lands sideways.
   */
  const transcode = useCallback(async (source, targetType) => {
    const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });

    try {
      const canvas =
        typeof OffscreenCanvas !== "undefined"
          ? new OffscreenCanvas(bitmap.width, bitmap.height)
          : Object.assign(document.createElement("canvas"), {
              width: bitmap.width,
              height: bitmap.height,
            });

      const context = canvas.getContext("2d", { alpha: targetType !== "image/jpeg" });
      if (targetType === "image/jpeg") {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, bitmap.width, bitmap.height);
      }
      context.drawImage(bitmap, 0, 0);

      const blob = canvas.convertToBlob
        ? await canvas.convertToBlob({ type: targetType, quality: 0.92 })
        : await new Promise((resolve, reject) => {
            canvas.toBlob(
              (result) =>
                result ? resolve(result) : reject(new Error("Could not encode this image.")),
              targetType,
              0.92
            );
          });

      // An encoder that can't produce the requested type silently returns PNG
      // rather than throwing, and handing PNG bytes to embedJpg fails with an
      // opaque parse error deep inside pdf-lib.
      if (blob.type !== targetType) {
        throw new Error(`This browser could not re-encode the image as ${targetType}.`);
      }

      return blob;
    } finally {
      bitmap.close?.();
    }
  }, []);

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

          <WatermarkPreview
            preview={preview}
            marks={previewMarks}
            mode={mode}
            text={text}
            logo={logo}
            colorHex={findColor(colorId).hex}
            opacity={findOpacity(opacityId).value}
            pageWidth={pageWidth}
            pageHeight={pageHeight}
            pageRotation={pageRotation}
            marked={pageIndices.includes(pageIndex)}
          />

          {pageCount > 1 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                marginBottom: "8px",
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
              margin: "0 0 20px",
            }}
          >
            {pageIndices.includes(pageIndex)
              ? "Preview is approximate — the exported mark is measured with the real font."
              : "This page isn't in your selection, so it won't be watermarked."}
          </p>

          <fieldset style={fieldsetStyle}>
            <legend style={legendStyle}>Watermark</legend>

            <div style={{ display: "grid", gap: "16px" }}>
              <Field label="Type">
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <Chip
                    active={mode === "text"}
                    onClick={() => {
                      setMode("text");
                      setResultBlob(null);
                    }}
                    disabled={isRunning}
                  >
                    Text
                  </Chip>
                  <Chip
                    active={mode === "image"}
                    onClick={() => {
                      setMode("image");
                      setResultBlob(null);
                    }}
                    disabled={isRunning}
                  >
                    Image
                  </Chip>
                </div>
              </Field>

              {mode === "text" ? (
                <>
                  <label style={{ display: "block" }}>
                    <span style={labelStyle}>Text</span>
                    <input
                      type="text"
                      value={text}
                      maxLength={MAX_TEXT_LENGTH}
                      onChange={(event) => {
                        setText(event.target.value);
                        setResultBlob(null);
                      }}
                      disabled={isRunning}
                      style={{
                        width: "100%",
                        maxWidth: "360px",
                        padding: "9px 11px",
                        fontSize: "14px",
                        color: colors.text,
                        backgroundColor: colors.surface,
                        border: `1px solid ${
                          text && !textCheck.ok ? colors.danger : colors.borderInput
                        }`,
                        borderRadius: "8px",
                      }}
                    />
                    <span
                      style={{
                        display: "block",
                        fontSize: "12px",
                        color: text && !textCheck.ok ? colors.danger : colors.textFaint,
                        marginTop: "6px",
                      }}
                    >
                      {text && !textCheck.ok
                        ? textCheck.error
                        : `${text.length} of ${MAX_TEXT_LENGTH} characters`}
                    </span>
                  </label>

                  <Field label="Quick fill">
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {TEXT_PRESETS.map((preset) => (
                        <Chip
                          key={preset}
                          active={text === preset}
                          onClick={() => {
                            setText(preset);
                            setResultBlob(null);
                          }}
                          disabled={isRunning}
                        >
                          {preset}
                        </Chip>
                      ))}
                    </div>
                  </Field>

                  <Field label="Colour">
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {COLORS.map((option) => (
                        <Chip
                          key={option.id}
                          active={colorId === option.id}
                          onClick={() => {
                            setColorId(option.id);
                            setResultBlob(null);
                          }}
                          disabled={isRunning}
                        >
                          <span
                            aria-hidden="true"
                            style={{
                              display: "inline-block",
                              width: "10px",
                              height: "10px",
                              borderRadius: "50%",
                              backgroundColor: option.hex,
                              marginRight: "6px",
                              verticalAlign: "middle",
                            }}
                          />
                          {option.label}
                        </Chip>
                      ))}
                    </div>
                  </Field>

                  <Field label="Size">
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {TEXT_SIZES.map((option) => (
                        <Chip
                          key={option.id}
                          active={textSizeId === option.id}
                          onClick={() => {
                            setTextSizeId(option.id);
                            setResultBlob(null);
                          }}
                          disabled={isRunning}
                        >
                          {option.label}
                        </Chip>
                      ))}
                    </div>
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Image">
                    {logo ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          flexWrap: "wrap",
                        }}
                      >
                        <LogoThumbnail logo={logo} />
                        <span style={{ fontSize: "13px", color: colors.textMuted }}>
                          {logo.file.name} · {logo.width}×{logo.height} ·{" "}
                          {formatBytes(logo.file.size)}
                        </span>
                        <SecondaryButton
                          onClick={() => {
                            setLogo(null);
                            setResultBlob(null);
                          }}
                          disabled={isRunning}
                        >
                          Remove
                        </SecondaryButton>
                      </div>
                    ) : (
                      <FileDropzone
                        onFiles={handleLogoFiles}
                        accept="image/png,image/jpeg,image/webp,image/avif,image/gif,image/bmp,.png,.jpg,.jpeg,.webp,.avif,.gif,.bmp"
                        label="Drop a logo or signature image, or click to browse"
                      />
                    )}
                    <span
                      style={{
                        display: "block",
                        fontSize: "12px",
                        color: colors.textFaint,
                        marginTop: "8px",
                      }}
                    >
                      A PNG with a transparent background works best — transparency is preserved.
                    </span>
                  </Field>

                  <Field label="Size">
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {IMAGE_SIZES.map((option) => (
                        <Chip
                          key={option.id}
                          active={imageSizeId === option.id}
                          onClick={() => {
                            setImageSizeId(option.id);
                            setResultBlob(null);
                          }}
                          disabled={isRunning}
                        >
                          {option.label}
                        </Chip>
                      ))}
                    </div>
                  </Field>
                </>
              )}

              <Field label="Opacity">
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {OPACITIES.map((option) => (
                    <Chip
                      key={option.id}
                      active={opacityId === option.id}
                      onClick={() => {
                        setOpacityId(option.id);
                        setResultBlob(null);
                      }}
                      disabled={isRunning}
                    >
                      {option.label}
                    </Chip>
                  ))}
                </div>
              </Field>

              <Field label="Angle">
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {ROTATIONS.map((option) => (
                    <Chip
                      key={option.id}
                      active={rotationId === option.id}
                      onClick={() => {
                        setRotationId(option.id);
                        setResultBlob(null);
                      }}
                      disabled={isRunning}
                    >
                      {option.label}
                    </Chip>
                  ))}
                </div>
              </Field>
            </div>
          </fieldset>

          <fieldset style={fieldsetStyle}>
            <legend style={legendStyle}>Placement</legend>

            <div style={{ display: "grid", gap: "16px" }}>
              <Field label="Layout">
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {LAYOUTS.map((option) => (
                    <Chip
                      key={option.id}
                      active={layoutId === option.id}
                      onClick={() => {
                        setLayoutId(option.id);
                        setResultBlob(null);
                      }}
                      disabled={isRunning}
                    >
                      {option.label}
                    </Chip>
                  ))}
                </div>
              </Field>

              {/* Position is meaningless when the mark covers the whole page,
                  and density is meaningless when there's only one — so each
                  control is hidden rather than shown doing nothing. */}
              {layoutId === "single" ? (
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
              ) : (
                <Field label="Density">
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {TILE_DENSITIES.map((option) => (
                      <Chip
                        key={option.id}
                        active={densityId === option.id}
                        onClick={() => {
                          setDensityId(option.id);
                          setResultBlob(null);
                        }}
                        disabled={isRunning}
                      >
                        {option.label}
                      </Chip>
                    ))}
                  </div>
                </Field>
              )}

              <label style={{ display: "block" }}>
                <span style={labelStyle}>Pages</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={pagesInput}
                  placeholder={`All pages (1-${pageCount})`}
                  onChange={(event) => {
                    setPagesInput(event.target.value);
                    setResultBlob(null);
                  }}
                  disabled={isRunning}
                  style={{
                    width: "100%",
                    maxWidth: "300px",
                    padding: "9px 11px",
                    fontSize: "14px",
                    color: colors.text,
                    backgroundColor: colors.surface,
                    border: `1px solid ${
                      pageSelection.ok ? colors.borderInput : colors.danger
                    }`,
                    borderRadius: "8px",
                  }}
                />
                <span
                  style={{
                    display: "block",
                    fontSize: "12px",
                    color: pageSelection.ok ? colors.textFaint : colors.danger,
                    marginTop: "6px",
                  }}
                >
                  {pageSelection.ok
                    ? pagesInput.trim() === ""
                      ? "Leave empty to watermark every page, or type something like 1-3, 7."
                      : `Watermarking ${formatPageSelection(pageIndices.map((i) => i + 1))}.`
                    : pageSelection.error}
                </span>
              </label>

              <p style={{ fontSize: "13px", color: colors.textFaint, margin: 0 }}>
                {describeWatermark({
                  pageCount: pageIndices.length,
                  marksPerPage: previewMarks.length,
                  layoutId,
                  positionId,
                })}
              </p>
            </div>
          </fieldset>

          {isRunning && <ProgressBar progress={progress} label="Watermarking…" />}

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "20px" }}>
            <PrimaryButton onClick={handleApply} disabled={!canRun}>
              <Droplets size={16} />
              {isRunning ? "Watermarking…" : "Add watermark"}
            </PrimaryButton>

            {isRunning && <SecondaryButton onClick={cancel}>Cancel</SecondaryButton>}

            {resultBlob && !isRunning && (
              <DownloadButton getBlob={() => resultBlob} filename="watermarked.pdf">
                Download watermarked.pdf
              </DownloadButton>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The page with its marks drawn over it.
 *
 * Marks are positioned in percentages of the *displayed* page — the same frame
 * planMarks() works in — so a page with a /Rotate previews where the stamp
 * actually lands rather than where the unrotated maths would put it.
 *
 * The y axis is flipped on the way in: planMarks returns PDF coordinates
 * (bottom-left origin, y up) and CSS is top-left origin, y down. Getting this
 * backwards would mirror the preview vertically against the real output, which
 * on a tiled mark looks almost right and is therefore easy to miss.
 */
function WatermarkPreview({
  preview,
  marks,
  mode,
  text,
  logo,
  colorHex,
  opacity,
  pageWidth,
  pageHeight,
  pageRotation,
  marked,
}) {
  const quarterTurned = pageRotation % 180 !== 0;
  const displayWidth = quarterTurned ? pageHeight : pageWidth;
  const displayHeight = quarterTurned ? pageWidth : pageHeight;

  return (
    <div style={{ maxWidth: "460px", margin: "0 auto 12px", width: "100%" }}>
      {preview ? (
        <div style={{ position: "relative", lineHeight: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Watermark preview"
            draggable={false}
            style={{
              width: "100%",
              display: "block",
              border: `1px solid ${colors.border}`,
              borderRadius: "6px",
            }}
          />

          {marked && (
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                overflow: "hidden",
                borderRadius: "6px",
                // Declared as a size container so the marks below can size
                // themselves in cqh — a percentage of THIS box's height rather
                // than the viewport's. Without it cqh falls back to the small
                // viewport unit and every mark is sized against the window,
                // which looks right at one browser size and wrong at all others.
                containerType: "size",
              }}
            >
              {marks.map((mark, index) => {
                // planMarks returns the mark's *origin* (its bottom-left corner
                // before rotation) in PDF space. Converting that to a CSS box
                // means flipping y and then rotating about that same corner,
                // which transform-origin expresses directly.
                const left = (mark.x / displayWidth) * 100;
                const bottom = (mark.y / displayHeight) * 100;
                const width = (mark.markWidth / displayWidth) * 100;

                return (
                  <span
                    key={index}
                    style={{
                      position: "absolute",
                      left: `${left}%`,
                      bottom: `${bottom}%`,
                      width: `${width}%`,
                      // CSS rotates clockwise, PDF counter-clockwise — hence the
                      // negation. Without it the preview leans the opposite way
                      // from the output, which reads as "the tool ignored my
                      // angle setting".
                      transform: `rotate(${-mark.rotate}deg)`,
                      transformOrigin: "left bottom",
                      opacity,
                      lineHeight: 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {mode === "text" ? (
                      <span
                        style={{
                          // Sized off the mark's own height so the preview
                          // scales with the container rather than being pinned
                          // to a pixel size the layout doesn't control.
                          fontSize: `${(mark.markHeight / displayHeight) * 100}cqh`,
                          fontFamily: "Helvetica, Arial, sans-serif",
                          fontWeight: 700,
                          color: colorHex,
                        }}
                      >
                        {text}
                      </span>
                    ) : (
                      <LogoMark logo={logo} />
                    )}
                  </span>
                );
              })}
            </div>
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
    </div>
  );
}

/**
 * One image mark in the preview.
 *
 * Its own component so the object URL is derived with useMemo and revoked when
 * the mark unmounts — a tiled preview can hold a hundred of these, and leaking
 * one blob per tile per settings change would accumulate fast. Same pattern as
 * JpgToPdfClient's ImageRow, for the same reason.
 */
function LogoMark({ logo }) {
  const url = useMemo(() => (logo ? URL.createObjectURL(logo.file) : null), [logo]);
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);

  if (!url) return null;

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" style={{ width: "100%", display: "block" }} />;
}

function LogoThumbnail({ logo }) {
  const url = useMemo(() => URL.createObjectURL(logo.file), [logo]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  return (
    <span
      style={{
        width: "48px",
        height: "48px",
        borderRadius: "8px",
        overflow: "hidden",
        flexShrink: 0,
        backgroundColor: colors.surfaceMuted,
        display: "inline-block",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
    </span>
  );
}

const fieldsetStyle = {
  border: `1px solid ${colors.border}`,
  borderRadius: "10px",
  padding: "16px",
  marginBottom: "16px",
};

const legendStyle = {
  fontSize: "13px",
  fontWeight: 600,
  color: colors.textSecondary,
  padding: "0 6px",
};

const labelStyle = {
  display: "block",
  fontSize: "13px",
  fontWeight: 500,
  color: colors.textSecondary,
  marginBottom: "8px",
};

function Field({ label, children }) {
  return (
    <div>
      <span style={labelStyle}>{label}</span>
      {children}
    </div>
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
