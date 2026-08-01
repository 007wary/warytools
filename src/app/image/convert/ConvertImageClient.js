"use client";

import { useState } from "react";
import FileDropzone from "@/components/FileDropzone";
import DownloadButton from "@/components/DownloadButton";
import { formatBytes, loadImage, canvasToBlob, outputFormats } from "@/lib/imageFile";

// Fixed high quality for lossy output — this tool is about changing format,
// not tuning compression (that's what /image/compress is for).
const OUTPUT_QUALITY = 0.92;

export default function ConvertImageClient() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [format, setFormat] = useState("image/png");
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");
  const [resultBlob, setResultBlob] = useState(null);

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

    // Default to a different format than the source so conversion is obvious.
    setFormat(selected.type === "image/png" ? "image/jpeg" : "image/png");
  }

  async function handleConvert() {
    setError("");
    setIsWorking(true);

    try {
      const img = await loadImage(file);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");

      // JPG has no transparency — fill white behind the image first so
      // transparent PNGs don't turn black.
      if (format === "image/jpeg") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0);

      const blob = await canvasToBlob(canvas, format, OUTPUT_QUALITY);
      setResultBlob(blob);
    } catch (err) {
      console.error(err);
      setError("Could not convert this image.");
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

  const selectedFormat = outputFormats.find((f) => f.mimeType === format);

  return (
    <div>
      {!file && (
        <FileDropzone onFiles={handleFiles} accept="image/*" label="Drag & drop an image here, or click to browse" />
      )}

      {error && <p style={{ color: "#dc2626", fontSize: "14px", marginTop: "12px" }}>{error}</p>}

      {file && (
        <div>
          <div style={{ display: "flex", gap: "20px", alignItems: "flex-start", marginBottom: "20px", flexWrap: "wrap" }}>
            <img
              src={previewUrl}
              alt="Preview"
              style={{ width: "160px", height: "160px", objectFit: "contain", border: "1px solid #e5e7eb", borderRadius: "8px", flexShrink: 0 }}
            />
            <div style={{ flex: 1, minWidth: "180px" }}>
              <div
                style={{
                  fontSize: "14px",
                  color: "#374151",
                  marginBottom: "4px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {file.name}
              </div>
              <div style={{ fontSize: "13px", color: "#9ca3af", marginBottom: "12px" }}>
                {formatBytes(file.size)} · {file.type}
              </div>
              <button onClick={handleReset} style={smallButtonStyle}>
                Choose another file
              </button>
            </div>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label style={{ fontSize: "14px", color: "#374151", display: "block", marginBottom: "6px" }}>
              Convert to
            </label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {outputFormats.map((f) => (
                <ModeButton key={f.mimeType} active={format === f.mimeType} onClick={() => setFormat(f.mimeType)}>
                  {f.label}
                </ModeButton>
              ))}
            </div>
          </div>

          {format === "image/jpeg" && file.type === "image/png" && (
            <p style={{ fontSize: "13px", color: "#9ca3af", marginBottom: "16px" }}>
              JPG doesn&apos;t support transparency — any transparent areas will become white.
            </p>
          )}

          <div style={{ display: "flex", gap: "12px", alignItems: "center", marginTop: "8px", flexWrap: "wrap" }}>
            <button
              onClick={handleConvert}
              disabled={isWorking}
              style={{
                backgroundColor: isWorking ? "#93c5fd" : "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: isWorking ? "not-allowed" : "pointer",
              }}
            >
              {isWorking ? "Converting…" : "Convert Image"}
            </button>

            {resultBlob && (
              <DownloadButton getBlob={() => resultBlob} filename={`converted.${selectedFormat.extension}`}>
                Download converted.{selectedFormat.extension}
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
        border: `1px solid ${active ? "#2563eb" : "#e5e7eb"}`,
        backgroundColor: active ? "#eff6ff" : "#fff",
        color: active ? "#2563eb" : "#374151",
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
  border: "1px solid #e5e7eb",
  borderRadius: "6px",
  padding: "4px 10px",
  fontSize: "13px",
  color: "#374151",
  cursor: "pointer",
};
