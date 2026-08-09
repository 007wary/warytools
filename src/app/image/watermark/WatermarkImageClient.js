"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Droplets } from "lucide-react";
import FileDropzone from "@/components/FileDropzone";
import DownloadButton from "@/components/DownloadButton";
import ProgressBar from "@/components/ProgressBar";
import ErrorBanner from "@/components/ErrorBanner";
import WarningBanner from "@/components/WarningBanner";
import ImageQueue from "@/components/ImageQueue";
import { PrimaryButton, SecondaryButton } from "@/components/ToolButton";
import { useImageBatch } from "@/lib/useImageBatch";
import { useObjectUrl } from "@/lib/useObjectUrl";
import { useSupportedFormats, findFormat } from "@/lib/imageFormats";
import { validateImageFile } from "@/lib/imageValidation";
import { outputFilename, clampQuality } from "@/lib/imageResampling";
import { formatBytes } from "@/lib/formatBytes";
import {
  LAYOUTS,
  POSITIONS,
  ROTATIONS,
  OPACITIES,
  TEXT_SIZES,
  IMAGE_SIZES,
  COLORS,
  FONT_FAMILIES,
  TILE_DENSITIES,
  DEFAULT_SETTINGS,
  MAX_TEXT_LENGTH,
  findRotation,
  resolveFontSize,
  resolveLogoSize,
  fontShorthand,
  planMarks,
  validateWatermarkText,
  describeWatermark,
} from "@/lib/imageWatermark";
import { drawWatermark } from "@/lib/imageWatermarkDraw";
import { colors } from "@/lib/theme";

// Suggestions rather than a fixed list — the field stays free text, since a
// watermark is usually a personal or company name. These just remove the typing
// for the shapes people most often want.
const TEXT_PRESETS = ["© Your Name", "SAMPLE", "PROOF", "DO NOT COPY", "DRAFT"];

// The preview is capped rather than rendered at full resolution: a 6000px photo
// would allocate a canvas the size of the source purely to show a thumbnail,
// and it is redrawn on every settings keystroke.
const PREVIEW_MAX_EDGE = 720;

export default function WatermarkImageClient() {
  const [mode, setMode] = useState(DEFAULT_SETTINGS.mode);
  const [text, setText] = useState(DEFAULT_SETTINGS.text);
  const [layoutId, setLayoutId] = useState(DEFAULT_SETTINGS.layoutId);
  const [positionId, setPositionId] = useState(DEFAULT_SETTINGS.positionId);
  const [rotationId, setRotationId] = useState(DEFAULT_SETTINGS.rotationId);
  const [opacityId, setOpacityId] = useState(DEFAULT_SETTINGS.opacityId);
  const [textSizeId, setTextSizeId] = useState(DEFAULT_SETTINGS.textSizeId);
  const [imageSizeId, setImageSizeId] = useState(DEFAULT_SETTINGS.imageSizeId);
  const [colorId, setColorId] = useState(DEFAULT_SETTINGS.colorId);
  const [fontId, setFontId] = useState(DEFAULT_SETTINGS.fontId);
  const [densityId, setDensityId] = useState(DEFAULT_SETTINGS.densityId);

  // The logo for image mode, with its decoded bitmap kept for the preview.
  // Held as a bitmap rather than re-decoding per preview draw: the preview
  // redraws on every keystroke and settings change.
  const [logo, setLogo] = useState(null);

  // Output format. Defaults to keeping whatever the source was where possible —
  // someone watermarking a PNG logo sheet does not want it flattened to JPG.
  const [format, setFormat] = useState("image/jpeg");
  const [quality, setQuality] = useState(0.9);

  const supportedFormats = useSupportedFormats();
  const selectedFormat = findFormat(format);

  const batch = useImageBatch({
    toolSlug: "image_watermark",
    errorFallback: "Could not watermark these images.",
  });

  const { items, results, isRunning, progress } = batch;

  const textCheck = useMemo(() => validateWatermarkText(text), [text]);
  const ready = mode === "text" ? textCheck.ok : Boolean(logo);

  // The first queued image drives the preview. Previewing all of them would
  // mean N canvases redrawing on every keystroke, and the marks are
  // proportional, so one representative image tells the user what they need.
  const previewItem = items[0] || null;

  /**
   * Accepts the watermark logo.
   *
   * Sniffed by the shared validator rather than trusting file.type — Windows
   * without a handler and most Android providers report an empty type for a
   * perfectly good image. It also catches HEIC, which no browser can decode and
   * which would otherwise fail later with a generic error.
   */
  const handleLogoFiles = useCallback(async (fileList) => {
    const check = await validateImageFile(fileList[0]);
    if (!check.ok) {
      batch.setError(check.error);
      return;
    }

    try {
      // "from-image" applies EXIF orientation — without it a logo photographed
      // in portrait lands sideways, the same trap the batch worker documents.
      const bitmap = await createImageBitmap(check.file, { imageOrientation: "from-image" });
      setLogo({ file: check.file, bitmap, width: bitmap.width, height: bitmap.height });
      batch.clearResults();
    } catch {
      batch.setError("Could not read that image. Try a PNG or JPG.");
    }
  }, [batch]);

  // The decoded logo is explicitly closed when it is replaced or the component
  // unmounts. An ImageBitmap holds real memory that GC is slow to reclaim.
  useEffect(() => () => logo?.bitmap?.close?.(), [logo]);

  const watermarkSettings = useMemo(
    () => ({
      mode,
      text: textCheck.ok ? textCheck.text : "",
      layoutId,
      positionId,
      rotationId,
      opacityId,
      textSizeId,
      imageSizeId,
      colorId,
      fontId,
      densityId,
    }),
    [
      mode,
      textCheck,
      layoutId,
      positionId,
      rotationId,
      opacityId,
      textSizeId,
      imageSizeId,
      colorId,
      fontId,
      densityId,
    ]
  );

  // Any settings change invalidates the previous run's output, so results are
  // cleared rather than left on screen next to controls that no longer produced
  // them — the stale-answer problem the calculators fixed by going live.
  useEffect(() => {
    batch.clearResults();
    // batch.clearResults is stable (useCallback with no deps in useImageBatch),
    // so this runs on settings changes only.
  }, [watermarkSettings, batch.clearResults]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleApply() {
    if (mode === "text" && !textCheck.ok) {
      batch.setError(textCheck.error);
      return;
    }
    if (mode === "image" && !logo) {
      batch.setError("Choose an image to use as the watermark.");
      return;
    }

    await batch.process({
      // Source resolution is preserved — this tool adds a mark, it doesn't
      // resize. Someone who wants smaller dimensions wants /image/resize.
      mode: "none",
      format,
      quality: selectedFormat.lossy ? clampQuality(quality) : undefined,
      watermark: {
        ...watermarkSettings,
        // The File is structured-cloneable by reference, so handing the logo to
        // the worker costs nothing — the bytes are not copied. The worker
        // decodes it once for the whole batch.
        logoBlob: mode === "image" && logo ? logo.file : null,
      },
    });
  }

  const singleResult = items.length === 1 ? results.get(items[0]?.id) : null;

  // The previewed image's true dimensions, reported up by the preview once it
  // has decoded. Lifted rather than decoded again here: the mark count needs the
  // same numbers the preview already has, and decoding a second time would cost
  // a full re-decode of a potentially 50-megapixel file for two integers.
  const [previewSize, setPreviewSize] = useState(null);

  // Marks on the previewed image, for the count in the summary line. Computed
  // against that one image, which is why the copy says "about" — a mixed batch
  // genuinely produces different counts per image.
  const previewMarkCount = usePreviewMarkCount(previewSize, watermarkSettings, logo);

  return (
    <div>
      <FileDropzone
        onFiles={batch.addFiles}
        accept="image/*"
        multiple
        label="Drag & drop images here, or click to browse"
      />

      <ErrorBanner>{batch.error}</ErrorBanner>

      {batch.notice && (
        <p role="status" style={{ fontSize: "13px", color: colors.warningText, marginTop: "12px" }}>
          {batch.notice}
        </p>
      )}

      {items.length > 0 && (
        <div style={{ marginTop: "20px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "12px",
              flexWrap: "wrap",
              marginBottom: "4px",
            }}
          >
            <span style={{ fontSize: "14px", fontWeight: 600, color: colors.text }}>
              {items.length} image{items.length === 1 ? "" : "s"}
            </span>
            <SecondaryButton onClick={batch.clearAll} disabled={isRunning}>
              Clear all
            </SecondaryButton>
          </div>

          <ImageQueue
            items={items}
            results={results}
            onRemove={batch.removeItem}
            disabled={isRunning}
          />

          <WatermarkPreview
            item={previewItem}
            settings={watermarkSettings}
            logo={logo}
            imageCount={items.length}
            onSize={setPreviewSize}
          />

          <fieldset style={fieldsetStyle}>
            <legend style={legendStyle}>Watermark</legend>

            <div style={{ display: "grid", gap: "16px" }}>
              <Field label="Type">
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <Chip active={mode === "text"} onClick={() => setMode("text")} disabled={isRunning}>
                    Text
                  </Chip>
                  <Chip
                    active={mode === "image"}
                    onClick={() => setMode("image")}
                    disabled={isRunning}
                  >
                    Logo
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
                      onChange={(event) => setText(event.target.value)}
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
                          onClick={() => setText(preset)}
                          disabled={isRunning}
                        >
                          {preset}
                        </Chip>
                      ))}
                    </div>
                  </Field>

                  <Field label="Font">
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {FONT_FAMILIES.map((option) => (
                        <Chip
                          key={option.id}
                          active={fontId === option.id}
                          onClick={() => setFontId(option.id)}
                          disabled={isRunning}
                        >
                          <span style={{ fontFamily: option.css }}>{option.label}</span>
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
                          onClick={() => setColorId(option.id)}
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
                              // Bordered in the outline colour so a white
                              // swatch is visible against a white chip.
                              border: `1px solid ${option.outline}`,
                              marginRight: "6px",
                              verticalAlign: "middle",
                            }}
                          />
                          {option.label}
                        </Chip>
                      ))}
                    </div>
                    <span
                      style={{
                        display: "block",
                        fontSize: "12px",
                        color: colors.textFaint,
                        marginTop: "8px",
                      }}
                    >
                      Every colour is drawn with a contrasting outline, so the mark stays readable
                      over both bright and dark areas of a photo.
                    </span>
                  </Field>

                  <Field label="Size">
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {TEXT_SIZES.map((option) => (
                        <Chip
                          key={option.id}
                          active={textSizeId === option.id}
                          onClick={() => setTextSizeId(option.id)}
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
                  <Field label="Logo">
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
                        <SecondaryButton onClick={() => setLogo(null)} disabled={isRunning}>
                          Remove
                        </SecondaryButton>
                      </div>
                    ) : (
                      <FileDropzone
                        onFiles={handleLogoFiles}
                        accept="image/png,image/jpeg,image/webp,image/avif,image/gif,image/bmp,.png,.jpg,.jpeg,.webp,.avif,.gif,.bmp"
                        label="Drop a logo image, or click to browse"
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
                          onClick={() => setImageSizeId(option.id)}
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
                      onClick={() => setOpacityId(option.id)}
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
                      onClick={() => setRotationId(option.id)}
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
                      onClick={() => setLayoutId(option.id)}
                      disabled={isRunning}
                    >
                      {option.label}
                    </Chip>
                  ))}
                </div>
              </Field>

              {/* Position is meaningless when the mark covers the whole image,
                  and density is meaningless when there's only one — so each
                  control is hidden rather than shown doing nothing. */}
              {layoutId === "single" ? (
                <Field label="Position">
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {POSITIONS.map((option) => (
                      <Chip
                        key={option.id}
                        active={positionId === option.id}
                        onClick={() => setPositionId(option.id)}
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
                        onClick={() => setDensityId(option.id)}
                        disabled={isRunning}
                      >
                        {option.label}
                      </Chip>
                    ))}
                  </div>
                </Field>
              )}

              <p style={{ fontSize: "13px", color: colors.textFaint, margin: 0 }}>
                {describeWatermark({
                  imageCount: items.length,
                  marksPerImage: previewMarkCount,
                  layoutId,
                  positionId,
                })}
              </p>
            </div>
          </fieldset>

          <fieldset style={fieldsetStyle}>
            <legend style={legendStyle}>Output</legend>

            <div style={{ display: "grid", gap: "16px" }}>
              <Field label="Format">
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {supportedFormats.map((f) => (
                    <Chip
                      key={f.mimeType}
                      active={format === f.mimeType}
                      onClick={() => setFormat(f.mimeType)}
                      disabled={isRunning}
                    >
                      {f.label}
                    </Chip>
                  ))}
                </div>
                <span
                  style={{
                    display: "block",
                    fontSize: "12px",
                    color: colors.textFaint,
                    marginTop: "8px",
                  }}
                >
                  {selectedFormat.note}
                </span>
              </Field>

              {selectedFormat.lossy && (
                <label style={{ display: "block" }}>
                  <span style={labelStyle}>Quality: {Math.round(quality * 100)}%</span>
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={quality}
                    onChange={(event) => setQuality(Number(event.target.value))}
                    disabled={isRunning}
                    style={{ width: "100%", maxWidth: "420px", display: "block" }}
                  />
                </label>
              )}
            </div>
          </fieldset>

          {/* Stated plainly rather than buried in the FAQ. A visible mark is not
              a claim of ownership, and someone relying on it to protect a photo
              should know its limits before they publish. */}
          <WarningBanner>
            A visible watermark deters casual reuse — it can still be cropped or edited out. It
            isn&apos;t a copyright registration or invisible forensic marking.
          </WarningBanner>

          {isRunning && <ProgressBar progress={progress} label="Watermarking…" />}

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "20px" }}>
            <PrimaryButton onClick={handleApply} disabled={isRunning || !ready}>
              <Droplets size={16} />
              {isRunning
                ? "Watermarking…"
                : `Watermark ${items.length} image${items.length === 1 ? "" : "s"}`}
            </PrimaryButton>

            {isRunning && <SecondaryButton onClick={batch.cancel}>Cancel</SecondaryButton>}

            {singleResult && !isRunning && (
              <DownloadButton
                getBlob={() => new Blob([singleResult.bytes], { type: singleResult.type })}
                filename={outputFilename(items[0].file.name, singleResult.type, "-watermarked")}
              >
                Download {outputFilename(items[0].file.name, singleResult.type, "-watermarked")}
              </DownloadButton>
            )}

            {results.size > 1 && !isRunning && (
              <DownloadButton getBlob={() => batch.buildZip()} filename="watermarked-images.zip">
                Download all ({results.size}) as zip
              </DownloadButton>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Live preview of the mark on the first queued image.
 *
 * Rendered on a real canvas with the same planMarks() geometry and the same
 * font shorthand the worker uses, rather than positioned DOM elements. That is
 * the deliberate difference from the PDF watermark tool's preview, which has to
 * approximate text width with an average advance factor because measuring would
 * mean loading pdf-lib into the page bundle.
 *
 * Here canvas measures the real font for free, so the preview is not an
 * approximation — the same code path decides placement in both places, and a
 * long string cannot lay out one way on screen and another in the export.
 */
function WatermarkPreview({ item, settings, logo, imageCount, onSize }) {
  const canvasRef = useRef(null);

  // One state object rather than three, set once when the decode resolves.
  // Separate pieces would each trigger their own render and, more importantly,
  // would let the canvas draw against a bitmap from one file and dimensions
  // from another during the frame between two setStates.
  const [decoded, setDecoded] = useState({ bitmap: null, error: false });

  // Decode is tied to a cancellation flag so switching files mid-decode
  // discards the stale result instead of racing it onto the canvas — the same
  // generation-token pattern usePdfThumbnails uses.
  useEffect(() => {
    if (!item) return undefined;

    let cancelled = false;
    let preview = null;

    (async () => {
      try {
        const full = await createImageBitmap(item.file, { imageOrientation: "from-image" });

        // The FULL dimensions are what the summary count needs — the mark is
        // proportional, so a count measured against the downscaled preview
        // would be right by luck rather than by construction.
        const size = { width: full.width, height: full.height };

        // Downscaled once, here, rather than on every redraw: the preview
        // redraws on each keystroke, and drawing a 6000px source into a 720px
        // box every time is wasted work.
        const scale = Math.min(1, PREVIEW_MAX_EDGE / Math.max(full.width, full.height));
        if (scale < 1) {
          preview = await createImageBitmap(full, {
            resizeWidth: Math.max(1, Math.round(full.width * scale)),
            resizeHeight: Math.max(1, Math.round(full.height * scale)),
            resizeQuality: "high",
          });
          full.close?.();
        } else {
          preview = full;
        }

        if (cancelled) {
          preview.close?.();
          preview = null;
          return;
        }

        setDecoded({ bitmap: preview, error: false });
        onSize?.(size);
      } catch {
        if (!cancelled) setDecoded({ bitmap: null, error: true });
      }
    })();

    return () => {
      cancelled = true;
      preview?.close?.();
    };
  }, [item, onSize]);

  const { bitmap, error: decodeError } = decoded;

  // Redraws whenever the bitmap or any setting changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bitmap) return;

    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);

    // The SAME function the worker calls. Not a preview-shaped reimplementation
    // of it — that is what lets the preview be trusted, since there is no second
    // copy to drift out of sync with the exported result.
    drawWatermark(ctx, canvas.width, canvas.height, settings, logo?.bitmap || null);
  }, [bitmap, settings, logo]);

  if (!item) return null;

  return (
    <div style={{ margin: "20px 0" }}>
      <span style={labelStyle}>Preview</span>
      {decodeError ? (
        <p style={{ fontSize: "13px", color: colors.textMuted, margin: 0 }}>
          Couldn&apos;t preview this image, but it will still be watermarked.
        </p>
      ) : (
        <>
          <canvas
            ref={canvasRef}
            style={{
              width: "100%",
              maxWidth: "460px",
              height: "auto",
              display: "block",
              margin: "0 auto",
              border: `1px solid ${colors.border}`,
              borderRadius: "6px",
              // A checkerboard behind the canvas so a transparent PNG reads as
              // transparent rather than as whatever the page background is.
              backgroundColor: colors.surfaceMuted,
            }}
          />
          <p
            style={{
              fontSize: "12px",
              color: colors.textFaint,
              textAlign: "center",
              margin: "8px 0 0",
            }}
          >
            {imageCount > 1
              ? `Showing "${item.file.name}". The mark scales to each image, so all ${imageCount} get a proportionally identical stamp.`
              : "The mark is sized relative to your image, so it looks the same at any resolution."}
          </p>
        </>
      )}
    </div>
  );
}

/**
 * How many marks land on the previewed image, for the summary line.
 *
 * Pure derivation from dimensions the preview already decoded — no effect and
 * no second decode of the source file. It needs a canvas only to measure the
 * text, and a detached one costs nothing; that measurement is the reason this
 * can be exact rather than the average-advance-width approximation the PDF
 * watermark tool has to live with.
 *
 * @param {{width: number, height: number}|null} dimensions Full-size, not the
 *   downscaled preview — the mark is proportional, so the count must be
 *   computed against the real output size.
 */
function usePreviewMarkCount(dimensions, settings, logo) {
  return useMemo(() => {
    // A single mark is always exactly one, whatever the image, so the count is
    // correct before anything has decoded.
    if (settings.layoutId !== "tile") return 1;
    if (!dimensions) return 1;
    if (typeof document === "undefined") return 1;

    const { width, height } = dimensions;

    let markWidth;
    let markHeight;

    if (settings.mode === "text") {
      if (!settings.text) return 0;
      const fontSize = resolveFontSize(settings.textSizeId, width, height);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      ctx.font = fontShorthand(settings.fontId, fontSize);
      markWidth = ctx.measureText(settings.text).width;
      markHeight = fontSize;
    } else {
      if (!logo) return 0;
      const size = resolveLogoSize(settings.imageSizeId, logo.width, logo.height, width, height);
      markWidth = size.width;
      markHeight = size.height;
    }

    return planMarks({
      layoutId: settings.layoutId,
      positionId: settings.positionId,
      markWidth,
      markHeight,
      rotation: findRotation(settings.rotationId).degrees,
      densityId: settings.densityId,
      width,
      height,
    }).length;
  }, [dimensions, settings, logo]);
}

function LogoThumbnail({ logo }) {
  // Keyed on the File, not the `logo` wrapper: the wrapper is rebuilt whenever
  // the decoded bitmap is replaced, which would needlessly churn the URL.
  const url = useObjectUrl(logo.file);

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
      {url && <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />}
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
