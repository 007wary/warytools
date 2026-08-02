"use client";

import { useEffect, useState } from "react";
import FileDropzone from "@/components/FileDropzone";
import DownloadButton from "@/components/DownloadButton";
import WarningBanner from "@/components/WarningBanner";
import { formatBytes, loadImage, canvasToBlob } from "@/lib/imageFile";
import { colors } from "@/lib/theme";

// PNG has no quality parameter — the slider only affects JPG/WebP output.
// We default the output format to the same as the input when it supports
// quality, otherwise fall back to JPG so the slider actually does something.
export default function CompressImageClient() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [format, setFormat] = useState("image/jpeg");
  const [quality, setQuality] = useState(0.8);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");
  const [resultBlob, setResultBlob] = useState(null);

  // Revoke the previous preview URL whenever it's replaced or the
  // component unmounts, so switching files repeatedly doesn't leak blobs.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleFiles(fileList) {
    const selected = fileList[0];
    if (!selected || !selected.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }

    setError("");
    setResultBlob(null);
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
    setFormat(selected.type === "image/png" ? "image/jpeg" : selected.type);
  }

  async function handleCompress() {
    setError("");
    setIsWorking(true);

    try {
      const img = await loadImage(file);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");

      // JPG has no transparency — fill white behind the image first so
      // transparent source images don't turn black.
      if (format === "image/jpeg") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0);

      const blob = await canvasToBlob(canvas, format, quality);
      setResultBlob(blob);
    } catch (err) {
      console.error(err);
      setError("Could not compress this image.");
    } finally {
      setIsWorking(false);
    }
  }

  function handleReset() {
    setFile(null);
    setPreviewUrl(null);
    setResultBlob(null);
    setError("");
  }

  const supportsQuality = format !== "image/png";
  const extension = format === "image/png" ? "png" : format === "image/webp" ? "webp" : "jpg";
  const sizeChangePercent =
    resultBlob && file ? Math.round((1 - resultBlob.size / file.size) * 100) : null;

  // PNG is lossless, so re-encoding a photo (which JPG/WebP compress well
  // by discarding detail) as PNG almost always produces a *larger* file.
  const pngOnPhotoWarning =
    format === "image/png" && (file?.type === "image/jpeg" || file?.type === "image/webp");

  return (
    <div>
      {!file && (
        <FileDropzone onFiles={handleFiles} accept="image/*" label="Drag & drop an image here, or click to browse" />
      )}

      {error && <p style={{ color: colors.danger, fontSize: "14px", marginTop: "12px" }}>{error}</p>}

      {file && (
        <div>
          <div style={{ display: "flex", gap: "20px", alignItems: "flex-start", marginBottom: "20px", flexWrap: "wrap" }}>
            <img
              src={previewUrl}
              alt="Preview"
              style={{ width: "160px", height: "160px", objectFit: "contain", border: `1px solid ${colors.border}`, borderRadius: "8px", flexShrink: 0 }}
            />
            <div style={{ flex: 1, minWidth: "180px" }}>
              <div
                style={{
                  fontSize: "14px",
                  color: colors.textSecondary,
                  marginBottom: "4px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {file.name}
              </div>
              <div style={{ fontSize: "13px", color: colors.textFaint, marginBottom: "12px" }}>
                {formatBytes(file.size)}
              </div>
              <button onClick={handleReset} style={smallButtonStyle}>
                Choose another file
              </button>
            </div>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={{ fontSize: "14px", color: colors.textSecondary, display: "block", marginBottom: "6px" }}>
              Output format
            </label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              style={selectStyle}
            >
              <option value="image/jpeg">JPG</option>
              <option value="image/webp">WebP</option>
              <option value="image/png">PNG</option>
            </select>
          </div>

          {supportsQuality ? (
            <div style={{ marginBottom: "20px" }}>
              <label style={{ fontSize: "14px", color: colors.textSecondary }}>
                Quality: {Math.round(quality * 100)}%
              </label>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                style={{ width: "100%", marginTop: "6px" }}
              />
            </div>
          ) : (
            <p style={{ fontSize: "13px", color: colors.textFaint, marginBottom: "20px" }}>
              PNG is lossless — there&apos;s no quality setting to adjust.
            </p>
          )}

          {pngOnPhotoWarning && (
            <WarningBanner>
              PNG is lossless, so converting a photo to PNG usually produces a{" "}
              <strong>larger</strong> file than the original JPG/WebP. For photos, JPG or WebP
              will almost always compress smaller.
            </WarningBanner>
          )}

          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={handleCompress}
              disabled={isWorking}
              style={{
                backgroundColor: isWorking ? colors.primaryDisabled : colors.primary,
                color: colors.primaryContrast,
                border: "none",
                borderRadius: "8px",
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: isWorking ? "not-allowed" : "pointer",
              }}
            >
              {isWorking ? "Compressing…" : "Compress Image"}
            </button>

            {resultBlob && (
              <DownloadButton getBlob={() => resultBlob} filename={`compressed.${extension}`}>
                Download compressed.{extension}
              </DownloadButton>
            )}
          </div>

          {resultBlob && (
            <p style={{ fontSize: "14px", color: colors.textSecondary, marginTop: "16px" }}>
              {formatBytes(file.size)} → {formatBytes(resultBlob.size)}
              {sizeChangePercent > 0 && (
                <span style={{ color: colors.success, fontWeight: 600 }}>
                  {" "}
                  ({sizeChangePercent}% smaller)
                </span>
              )}
              {sizeChangePercent <= 0 && (
                <span style={{ color: colors.danger, fontWeight: 600 }}>
                  {" "}
                  ({Math.abs(sizeChangePercent)}% larger — try JPG or WebP instead)
                </span>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const smallButtonStyle = {
  background: "none",
  border: `1px solid ${colors.border}`,
  borderRadius: "6px",
  padding: "4px 10px",
  fontSize: "13px",
  color: colors.textSecondary,
  cursor: "pointer",
};

const selectStyle = {
  padding: "8px 10px",
  fontSize: "14px",
  border: `1px solid ${colors.borderInput}`,
  borderRadius: "6px",
  color: colors.textSecondary,
  backgroundColor: colors.surface,
};
