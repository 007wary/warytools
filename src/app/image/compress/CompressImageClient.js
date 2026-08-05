"use client";

import { useState } from "react";
import { Minimize2 } from "lucide-react";
import FileDropzone from "@/components/FileDropzone";
import DownloadButton from "@/components/DownloadButton";
import ProgressBar from "@/components/ProgressBar";
import ErrorBanner from "@/components/ErrorBanner";
import WarningBanner from "@/components/WarningBanner";
import ImageQueue, { BatchSummary } from "@/components/ImageQueue";
import { PrimaryButton, SecondaryButton } from "@/components/ToolButton";
import { useImageBatch } from "@/lib/useImageBatch";
import { useSupportedFormats, findFormat } from "@/lib/imageFormats";
import { outputFilename, clampQuality } from "@/lib/imageResampling";
import { colors } from "@/lib/theme";

export default function CompressImageClient() {
  const [format, setFormat] = useState("image/jpeg");
  const [quality, setQuality] = useState(0.8);

  const supportedFormats = useSupportedFormats();
  const batch = useImageBatch({
    toolSlug: "image_compress",
    errorFallback: "Could not compress these images.",
  });

  const { items, results, isRunning, progress } = batch;
  const selected = findFormat(format);

  async function handleCompress() {
    await batch.process({
      // Source resolution is preserved — this tool changes encoding, not
      // size. Someone who wants smaller dimensions wants /image/resize.
      mode: "none",
      format,
      quality: selected.lossy ? clampQuality(quality) : undefined,
    });
  }

  async function handleDownloadAll() {
    return batch.buildZip();
  }

  const singleResult = items.length === 1 ? results.get(items[0]?.id) : null;

  // PNG is lossless, so re-encoding a photo as PNG reliably produces a
  // *larger* file than the JPG/WebP it came from.
  const pngOnPhoto =
    format === "image/png" &&
    items.some((item) => item.type === "image/jpeg" || item.type === "image/webp");

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

          <div style={{ marginTop: "24px", marginBottom: "16px" }}>
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
                <FormatButton
                  key={f.mimeType}
                  active={format === f.mimeType}
                  onClick={() => {
                    setFormat(f.mimeType);
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

          {selected.lossy ? (
            <div style={{ marginBottom: "20px" }}>
              <label
                htmlFor="quality"
                style={{ fontSize: "14px", color: colors.textSecondary, fontWeight: 500 }}
              >
                Quality: {Math.round(quality * 100)}%
              </label>
              <input
                id="quality"
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
              <p style={{ fontSize: "13px", color: colors.textFaint, margin: "6px 0 0" }}>
                {quality >= 0.9
                  ? "Near-original quality, larger files."
                  : quality >= 0.7
                    ? "A good balance — visually indistinguishable for most photos."
                    : "Noticeably compressed. Fine for thumbnails and previews."}
              </p>
            </div>
          ) : (
            <p style={{ fontSize: "13px", color: colors.textFaint, marginBottom: "20px" }}>
              PNG is lossless — there&apos;s no quality setting to adjust.
            </p>
          )}

          {pngOnPhoto && (
            <WarningBanner>
              PNG is lossless, so converting a photo to PNG usually produces a{" "}
              <strong>larger</strong> file than the original. For photos, JPG, WebP or AVIF will
              compress far smaller.
            </WarningBanner>
          )}

          {isRunning && <ProgressBar progress={progress} />}

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "20px" }}>
            <PrimaryButton onClick={handleCompress} disabled={isRunning}>
              <Minimize2 size={16} />
              {isRunning
                ? "Compressing…"
                : `Compress ${items.length} image${items.length === 1 ? "" : "s"}`}
            </PrimaryButton>

            {isRunning && <SecondaryButton onClick={batch.cancel}>Cancel</SecondaryButton>}

            {/* A single result downloads directly — zipping one file just
                makes the user unpack it for no reason. */}
            {singleResult && !isRunning && (
              <DownloadButton
                getBlob={() => new Blob([singleResult.bytes], { type: singleResult.type })}
                filename={outputFilename(items[0].file.name, singleResult.type)}
              >
                Download {outputFilename(items[0].file.name, singleResult.type)}
              </DownloadButton>
            )}

            {results.size > 1 && !isRunning && (
              <DownloadButton getBlob={handleDownloadAll} filename="compressed-images.zip">
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
