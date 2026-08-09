"use client";

import { useEffect, useState } from "react";
import { Scaling } from "lucide-react";
import FileDropzone from "@/components/FileDropzone";
import DownloadButton from "@/components/DownloadButton";
import ProgressBar from "@/components/ProgressBar";
import ErrorBanner from "@/components/ErrorBanner";
import WarningBanner from "@/components/WarningBanner";
import ImageQueue, { BatchSummary } from "@/components/ImageQueue";
import { PrimaryButton, SecondaryButton } from "@/components/ToolButton";
import { useImageBatch } from "@/lib/useImageBatch";
import { useSupportedFormats, findFormat } from "@/lib/imageFormats";
import {
  resolveTargetSize,
  linkedDimension,
  outputFilename,
  clampQuality,
} from "@/lib/imageResampling";
import { checkPixelBudget } from "@/lib/imageValidation";
import { colors } from "@/lib/theme";

export default function ResizeImageClient() {
  const [mode, setMode] = useState("dimensions"); // dimensions | percentage | maxEdge
  // Strings, not numbers: Number("") is 0, so storing these as numbers made a
  // cleared field indistinguishable from a deliberate zero and drove the
  // partner field to 0 through the aspect link. Validated on submit.
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [lockAspect, setLockAspect] = useState(true);
  const [percentage, setPercentage] = useState(50);
  const [maxEdge, setMaxEdge] = useState(1920);
  // Output format is now explicit. The old tool forced every non-PNG input to
  // JPG, silently discarding a WebP source and its transparency.
  const [format, setFormat] = useState("image/jpeg");
  const [quality, setQuality] = useState(0.9);
  const [source, setSource] = useState(null);

  const supportedFormats = useSupportedFormats();
  const batch = useImageBatch({
    toolSlug: "image_resize",
    errorFallback: "Could not resize these images.",
  });

  const { items, results, isRunning, progress } = batch;
  const selectedFormat = findFormat(format);
  const isBatch = items.length > 1;

  // Read the first image's dimensions so the pixel inputs can be seeded and
  // the aspect link has a ratio to work from.
  //
  // Keyed on the first item's id, not the whole `items` array: depending on
  // the array re-runs this on every add or remove, which would stomp the
  // width/height the user had just typed and reset their chosen format.
  const firstItem = items[0];
  const firstId = firstItem?.id ?? null;
  const firstFile = firstItem?.file ?? null;
  const firstType = firstItem?.type ?? null;

  useEffect(() => {
    // No synchronous reset for the empty case: `source` is only ever read
    // alongside a non-empty queue (every consumer is inside the
    // `items.length > 0` branch), so clearing it here would buy nothing and
    // cost a cascading render.
    if (!firstFile) return undefined;

    let cancelled = false;
    const url = URL.createObjectURL(firstFile);
    const img = new Image();

    img.onload = () => {
      if (cancelled) return;
      setSource({ width: img.naturalWidth, height: img.naturalHeight });
      setWidth(String(img.naturalWidth));
      setHeight(String(img.naturalHeight));
      // Default to keeping the source format rather than forcing JPG, which
      // is what silently discarded WebP sources (and their transparency).
      setFormat(firstType || "image/jpeg");
    };

    // Revoked in exactly one place — the cleanup below — rather than in each
    // handler as well. Revoking on load and again on cleanup double-revoked
    // the same URL on every successful read, and the error path didn't check
    // `cancelled` at all, so the ordering only happened to work. Cleanup always
    // runs, on both the success and failure paths, so one revoke there covers
    // every case.
    img.src = url;

    return () => {
      cancelled = true;
      // Detach the pending decode before dropping the URL. Without this a
      // large image still being decoded when the user picks another file keeps
      // that work (and its buffer) alive until it finishes for nothing.
      img.onload = null;
      img.onerror = null;
      img.src = "";
      URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstId]);

  function handleWidthChange(value) {
    setWidth(value);
    batch.clearResults();
    if (!lockAspect || !source) return;
    // Returns null for a blank/invalid entry rather than mirroring it, so
    // clearing one box no longer zeroes the other.
    const linked = linkedDimension(value, source.width, source.height);
    if (linked !== null) setHeight(linked);
  }

  function handleHeightChange(value) {
    setHeight(value);
    batch.clearResults();
    if (!lockAspect || !source) return;
    const linked = linkedDimension(value, source.height, source.width);
    if (linked !== null) setWidth(linked);
  }

  async function handleResize() {
    // Exact-pixel mode only makes sense for a single image; a batch of mixed
    // sizes forced to identical dimensions would distort most of them. The UI
    // hides the option for batches, and this is the matching guard.
    if (mode === "dimensions" && !isBatch) {
      const target = resolveTargetSize({
        mode,
        width,
        height,
        percentage,
        originalWidth: source?.width,
        originalHeight: source?.height,
      });

      if (!target.ok) {
        batch.setError(target.error);
        return;
      }

      const budget = checkPixelBudget(target.width, target.height);
      if (!budget.ok) {
        batch.setError(budget.error);
        return;
      }

      await batch.process({
        mode: "dimensions",
        width: target.width,
        height: target.height,
        format,
        quality: selectedFormat.lossy ? clampQuality(quality) : undefined,
      });
      return;
    }

    await batch.process({
      mode: mode === "dimensions" ? "maxEdge" : mode,
      percentage,
      maxEdge,
      format,
      quality: selectedFormat.lossy ? clampQuality(quality) : undefined,
    });
  }

  const singleResult = items.length === 1 ? results.get(items[0]?.id) : null;

  const preview =
    source && mode === "percentage"
      ? {
          width: Math.round((source.width * percentage) / 100),
          height: Math.round((source.height * percentage) / 100),
        }
      : null;

  const isUpscale =
    (mode === "percentage" && percentage > 100) ||
    (mode === "dimensions" && source && Number(width) > source.width);

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
            }}
          >
            <span style={{ fontSize: "14px", fontWeight: 600, color: colors.text }}>
              {items.length} image{items.length === 1 ? "" : "s"}
              {source && !isBatch && (
                <span style={{ fontWeight: 400, color: colors.textMuted }}>
                  {" "}
                  · {source.width} × {source.height}px
                </span>
              )}
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

          <div style={{ display: "flex", gap: "8px", margin: "24px 0 20px", flexWrap: "wrap" }}>
            {!isBatch && (
              <ModeButton active={mode === "dimensions"} onClick={() => setMode("dimensions")}>
                Exact size
              </ModeButton>
            )}
            <ModeButton active={mode === "percentage"} onClick={() => setMode("percentage")}>
              By percentage
            </ModeButton>
            <ModeButton active={mode === "maxEdge"} onClick={() => setMode("maxEdge")}>
              Fit within
            </ModeButton>
          </div>

          {mode === "dimensions" && !isBatch && (
            <div style={{ marginBottom: "20px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "12px",
                  flexWrap: "wrap",
                }}
              >
                <label style={{ fontSize: "14px", color: colors.textSecondary }}>
                  Width{" "}
                  <input
                    type="number"
                    min={1}
                    value={width}
                    onChange={(e) => handleWidthChange(e.target.value)}
                    style={numberInputStyle}
                  />
                  px
                </label>
                <label style={{ fontSize: "14px", color: colors.textSecondary }}>
                  Height{" "}
                  <input
                    type="number"
                    min={1}
                    value={height}
                    onChange={(e) => handleHeightChange(e.target.value)}
                    style={numberInputStyle}
                  />
                  px
                </label>
              </div>
              <label
                style={{
                  fontSize: "13px",
                  color: colors.textMuted,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 0",
                }}
              >
                <input
                  type="checkbox"
                  checked={lockAspect}
                  onChange={(e) => setLockAspect(e.target.checked)}
                />
                Lock aspect ratio
              </label>
            </div>
          )}

          {mode === "percentage" && (
            <div style={{ marginBottom: "20px" }}>
              <label htmlFor="scale" style={{ fontSize: "14px", color: colors.textSecondary }}>
                Scale: {percentage}%
                {preview && (
                  <span style={{ color: colors.textMuted }}>
                    {" "}
                    ({preview.width} × {preview.height}px)
                  </span>
                )}
              </label>
              <input
                id="scale"
                type="range"
                min={1}
                max={200}
                value={percentage}
                onChange={(e) => {
                  setPercentage(Number(e.target.value));
                  batch.clearResults();
                }}
                style={{ width: "100%", marginTop: "6px", maxWidth: "420px", display: "block" }}
              />
            </div>
          )}

          {mode === "maxEdge" && (
            <div style={{ marginBottom: "20px" }}>
              <span
                style={{
                  display: "block",
                  fontSize: "14px",
                  color: colors.textSecondary,
                  marginBottom: "8px",
                }}
              >
                Fit each image within {maxEdge}px on its longest side
              </span>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {[640, 1280, 1920, 2560].map((edge) => (
                  <PresetButton
                    key={edge}
                    active={maxEdge === edge}
                    onClick={() => {
                      setMaxEdge(edge);
                      batch.clearResults();
                    }}
                  >
                    {edge}px
                  </PresetButton>
                ))}
              </div>
              <p style={{ fontSize: "13px", color: colors.textFaint, margin: "8px 0 0" }}>
                Aspect ratio is preserved, and images already smaller than this are left alone —
                so a mixed batch scales sensibly.
              </p>
            </div>
          )}

          <div style={{ marginBottom: "16px" }}>
            <span
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 500,
                color: colors.textSecondary,
                marginBottom: "8px",
              }}
            >
              Output format
            </span>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {supportedFormats.map((f) => (
                <ModeButton
                  key={f.mimeType}
                  active={format === f.mimeType}
                  onClick={() => {
                    setFormat(f.mimeType);
                    batch.clearResults();
                  }}
                >
                  {f.label}
                </ModeButton>
              ))}
            </div>
          </div>

          {selectedFormat.lossy && (
            <div style={{ marginBottom: "20px" }}>
              <label htmlFor="rq" style={{ fontSize: "14px", color: colors.textSecondary }}>
                Quality: {Math.round(quality * 100)}%
              </label>
              <input
                id="rq"
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={quality}
                onChange={(e) => {
                  setQuality(Number(e.target.value));
                  batch.clearResults();
                }}
                style={{ width: "100%", marginTop: "6px", maxWidth: "420px", display: "block" }}
              />
            </div>
          )}

          {isUpscale && (
            <WarningBanner>
              Enlarging an image can&apos;t add detail that was never captured — the result will
              look softer than the original. Scaling down is lossless in the sense that matters;
              scaling up never is.
            </WarningBanner>
          )}

          {isRunning && <ProgressBar progress={progress} />}

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "20px" }}>
            <PrimaryButton onClick={handleResize} disabled={isRunning}>
              <Scaling size={16} />
              {isRunning
                ? "Resizing…"
                : `Resize ${items.length} image${items.length === 1 ? "" : "s"}`}
            </PrimaryButton>

            {isRunning && <SecondaryButton onClick={batch.cancel}>Cancel</SecondaryButton>}

            {singleResult && !isRunning && (
              <DownloadButton
                getBlob={() => new Blob([singleResult.bytes], { type: singleResult.type })}
                filename={outputFilename(items[0].file.name, singleResult.type, "-resized")}
              >
                Download {outputFilename(items[0].file.name, singleResult.type, "-resized")}
              </DownloadButton>
            )}

            {results.size > 1 && !isRunning && (
              <DownloadButton getBlob={() => batch.buildZip()} filename="resized-images.zip">
                Download all ({results.size}) as zip
              </DownloadButton>
            )}
          </div>

          <BatchSummary items={items} results={results} />
        </div>
      )}
    </div>
  );
}

function ModeButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        border: `1px solid ${active ? colors.primary : colors.border}`,
        backgroundColor: active ? colors.primarySoft : colors.surface,
        color: active ? colors.primary : colors.textSecondary,
        borderRadius: "8px",
        padding: "9px 16px",
        fontSize: "14px",
        fontWeight: 500,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function PresetButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        border: `1px solid ${active ? colors.primary : colors.border}`,
        backgroundColor: active ? colors.primarySoft : colors.surfaceMuted,
        color: active ? colors.primary : colors.textSecondary,
        borderRadius: "999px",
        padding: "6px 14px",
        fontSize: "13px",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

const numberInputStyle = {
  width: "90px",
  padding: "8px 10px",
  fontSize: "16px",
  border: `1px solid ${colors.borderInput}`,
  borderRadius: "6px",
  marginLeft: "4px",
  marginRight: "4px",
  backgroundColor: colors.surface,
  color: colors.text,
};
