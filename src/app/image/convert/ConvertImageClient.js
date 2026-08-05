"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import FileDropzone from "@/components/FileDropzone";
import DownloadButton from "@/components/DownloadButton";
import ProgressBar from "@/components/ProgressBar";
import ErrorBanner from "@/components/ErrorBanner";
import ImageQueue, { BatchSummary } from "@/components/ImageQueue";
import { PrimaryButton, SecondaryButton } from "@/components/ToolButton";
import { useImageBatch } from "@/lib/useImageBatch";
import { useSupportedFormats, findFormat, defaultOutputFormat } from "@/lib/imageFormats";
import { outputFilename, clampQuality } from "@/lib/imageResampling";
import { colors } from "@/lib/theme";

// Fixed high quality for lossy output — this tool is about changing format,
// not tuning compression (that's what /image/compress is for).
const OUTPUT_QUALITY = 0.92;

export default function ConvertImageClient() {
  // Only consulted once the user has actually picked a format; until then the
  // suggestion below wins.
  const [chosenFormat, setChosenFormat] = useState("image/png");
  const [touched, setTouched] = useState(false);

  const supportedFormats = useSupportedFormats();
  const batch = useImageBatch({
    toolSlug: "image_convert",
    errorFallback: "Could not convert these images.",
  });

  const { items, results, isRunning, progress } = batch;

  // Suggest a sensible target based on the first image, but stop once the
  // user has picked one — overriding an explicit choice on the next file
  // drop would be the tool arguing with them.
  //
  // Derived during render rather than synced by an effect: the suggestion is
  // a pure function of the source type, so storing it in state only creates
  // an extra render pass showing a format the tool is about to change.
  const firstType = items[0]?.type ?? null;
  const format =
    touched || !firstType || supportedFormats.length === 0
      ? chosenFormat
      : defaultOutputFormat(firstType, supportedFormats);

  const selected = findFormat(format);

  async function handleConvert() {
    await batch.process({
      mode: "none",
      format,
      quality: selected.lossy ? clampQuality(OUTPUT_QUALITY) : undefined,
    });
  }

  const singleResult = items.length === 1 ? results.get(items[0]?.id) : null;

  // Flattening alpha is a real, irreversible change to the image, so it's
  // called out before the conversion rather than discovered afterwards.
  const willFlattenAlpha =
    format === "image/jpeg" &&
    items.some((item) => item.type === "image/png" || item.type === "image/webp");

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

          <div style={{ margin: "24px 0 16px" }}>
            <span
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 500,
                color: colors.textSecondary,
                marginBottom: "8px",
              }}
            >
              Convert to
            </span>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {supportedFormats.map((f) => (
                <FormatButton
                  key={f.mimeType}
                  active={format === f.mimeType}
                  onClick={() => {
                    setChosenFormat(f.mimeType);
                    setTouched(true);
                    batch.clearResults();
                  }}
                >
                  {f.label}
                </FormatButton>
              ))}
            </div>
            <p style={{ fontSize: "13px", color: colors.textFaint, margin: "8px 0 0" }}>
              {selected.note}
            </p>
          </div>

          {willFlattenAlpha && (
            <p style={{ fontSize: "13px", color: colors.warningText, marginBottom: "16px" }}>
              JPG doesn&apos;t support transparency — any transparent areas will become white.
              Choose PNG, WebP or AVIF to keep them.
            </p>
          )}

          {isRunning && <ProgressBar progress={progress} />}

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "20px" }}>
            <PrimaryButton onClick={handleConvert} disabled={isRunning}>
              <RefreshCw size={16} />
              {isRunning
                ? "Converting…"
                : `Convert ${items.length} image${items.length === 1 ? "" : "s"}`}
            </PrimaryButton>

            {isRunning && <SecondaryButton onClick={batch.cancel}>Cancel</SecondaryButton>}

            {singleResult && !isRunning && (
              <DownloadButton
                getBlob={() => new Blob([singleResult.bytes], { type: singleResult.type })}
                filename={outputFilename(items[0].file.name, singleResult.type)}
              >
                Download {outputFilename(items[0].file.name, singleResult.type)}
              </DownloadButton>
            )}

            {results.size > 1 && !isRunning && (
              <DownloadButton getBlob={() => batch.buildZip()} filename="converted-images.zip">
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

function FormatButton({ active, onClick, children }) {
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
