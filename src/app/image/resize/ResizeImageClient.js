"use client";

import { useEffect, useState } from "react";
import FileDropzone from "@/components/FileDropzone";
import DownloadButton from "@/components/DownloadButton";
import { formatBytes, loadImage, canvasToBlob } from "@/lib/imageFile";
import { colors } from "@/lib/theme";

export default function ResizeImageClient() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [originalWidth, setOriginalWidth] = useState(0);
  const [originalHeight, setOriginalHeight] = useState(0);

  const [mode, setMode] = useState("dimensions"); // "dimensions" | "percentage"
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [lockAspect, setLockAspect] = useState(true);
  const [percentage, setPercentage] = useState(50);

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

  async function handleFiles(fileList) {
    const selected = fileList[0];
    if (!selected || !selected.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }

    setError("");
    setResultBlob(null);
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));

    try {
      const img = await loadImage(selected);
      setOriginalWidth(img.naturalWidth);
      setOriginalHeight(img.naturalHeight);
      setWidth(img.naturalWidth);
      setHeight(img.naturalHeight);
    } catch (err) {
      console.error(err);
      setError("Could not read this image.");
    }
  }

  function handleWidthChange(value) {
    const newWidth = Number(value);
    setWidth(newWidth);
    if (lockAspect && originalWidth > 0) {
      setHeight(Math.round((newWidth / originalWidth) * originalHeight));
    }
  }

  function handleHeightChange(value) {
    const newHeight = Number(value);
    setHeight(newHeight);
    if (lockAspect && originalHeight > 0) {
      setWidth(Math.round((newHeight / originalHeight) * originalWidth));
    }
  }

  async function handleResize() {
    setError("");

    const targetWidth =
      mode === "percentage" ? Math.round((originalWidth * percentage) / 100) : width;
    const targetHeight =
      mode === "percentage" ? Math.round((originalHeight * percentage) / 100) : height;

    if (targetWidth < 1 || targetHeight < 1) {
      setError("Width and height must be at least 1 pixel.");
      return;
    }

    setIsWorking(true);

    try {
      const img = await loadImage(file);
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext("2d");

      const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";

      // JPG has no transparency — fill white behind the image first so
      // transparent source images (e.g. WebP/GIF with alpha) don't turn black.
      if (outputType === "image/jpeg") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      const blob = await canvasToBlob(canvas, outputType, 0.92);
      setResultBlob(blob);
    } catch (err) {
      console.error(err);
      setError("Could not resize this image.");
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

  const extension = file?.type === "image/png" ? "png" : "jpg";
  const previewTargetWidth =
    mode === "percentage" ? Math.round((originalWidth * percentage) / 100) : width;
  const previewTargetHeight =
    mode === "percentage" ? Math.round((originalHeight * percentage) / 100) : height;

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
                {originalWidth} × {originalHeight}px · {formatBytes(file.size)}
              </div>
              <button onClick={handleReset} style={smallButtonStyle}>
                Choose another file
              </button>
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
            <ModeButton active={mode === "dimensions"} onClick={() => setMode("dimensions")}>
              By dimensions
            </ModeButton>
            <ModeButton active={mode === "percentage"} onClick={() => setMode("percentage")}>
              By percentage
            </ModeButton>
          </div>

          {mode === "dimensions" && (
            <div style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px", flexWrap: "wrap" }}>
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
              <label style={{ fontSize: "13px", color: colors.textMuted, display: "flex", alignItems: "center", gap: "6px" }}>
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
              <label style={{ fontSize: "14px", color: colors.textSecondary }}>
                Scale: {percentage}% ({previewTargetWidth} × {previewTargetHeight}px)
              </label>
              <input
                type="range"
                min={1}
                max={200}
                value={percentage}
                onChange={(e) => setPercentage(Number(e.target.value))}
                style={{ width: "100%", marginTop: "6px" }}
              />
            </div>
          )}

          <div style={{ display: "flex", gap: "12px", alignItems: "center", marginTop: "20px", flexWrap: "wrap" }}>
            <button
              onClick={handleResize}
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
              {isWorking ? "Resizing…" : "Resize Image"}
            </button>

            {resultBlob && (
              <DownloadButton getBlob={() => resultBlob} filename={`resized.${extension}`}>
                Download resized.{extension}
              </DownloadButton>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ModeButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: `1px solid ${active ? colors.primary : colors.border}`,
        backgroundColor: active ? colors.primarySoft : colors.surface,
        color: active ? colors.primary : colors.textSecondary,
        borderRadius: "8px",
        padding: "8px 14px",
        fontSize: "14px",
        fontWeight: 500,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
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

const numberInputStyle = {
  width: "90px",
  padding: "6px 8px",
  fontSize: "14px",
  border: `1px solid ${colors.borderInput}`,
  borderRadius: "6px",
  marginLeft: "4px",
  marginRight: "4px",
};
