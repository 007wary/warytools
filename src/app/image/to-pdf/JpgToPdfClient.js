"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, X, ChevronUp, ChevronDown } from "lucide-react";
import FileDropzone from "@/components/FileDropzone";
import DownloadButton from "@/components/DownloadButton";
import ProgressBar from "@/components/ProgressBar";
import ErrorBanner from "@/components/ErrorBanner";
import { PrimaryButton, SecondaryButton, iconButtonStyle } from "@/components/ToolButton";
import { validateImageFiles, describeImageRejections } from "@/lib/imageValidation";
import { usePdfWorker, ops } from "@/lib/pdfWorkerClient";
import {
  PAGE_SIZES,
  MARGINS,
  ORIENTATIONS,
  FIT_TO_IMAGE,
  layoutImagePage,
  describePageLayout,
} from "@/lib/pdfPageSizes";
import { planEmbed, describeTranscodes, outputPdfName } from "@/lib/pdfImageEmbed";
import { formatBytes } from "@/lib/formatBytes";
import { colors } from "@/lib/theme";
import { events, trackEvent } from "@/lib/analytics";

let nextId = 0;

// Images are ordered by the user before conversion, so the page order in the
// PDF is theirs rather than whatever order the file picker happened to return.
// Same drag-plus-keyboard pattern as the Reorder tool — drag alone would make
// ordering impossible without a mouse.
export default function JpgToPdfClient() {
  const [items, setItems] = useState([]);
  const [pageSizeId, setPageSizeId] = useState("a4");
  const [orientation, setOrientation] = useState("auto");
  const [marginId, setMarginId] = useState("normal");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resultBlob, setResultBlob] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [grabbedIndex, setGrabbedIndex] = useState(null);
  const [status, setStatus] = useState("");
  const [isPreparing, setIsPreparing] = useState(false);

  const { run, cancel, progress, isRunning } = usePdfWorker();

  async function handleFiles(fileList) {
    setError("");
    setNotice("");
    setResultBlob(null);

    const { accepted, rejected } = await validateImageFiles(fileList);

    if (accepted.length === 0) {
      setError(
        rejected.length > 0 ? describeImageRejections(rejected) : "Please choose an image file."
      );
      return;
    }

    // Partial acceptance: keeping the good files and naming what was skipped
    // beats discarding a twenty-file drop over one HEIC.
    if (rejected.length > 0) setNotice(describeImageRejections(rejected));

    setItems((prev) => [
      ...prev,
      ...accepted.map(({ file, type }) => ({ id: nextId++, file, type })),
    ]);
  }

  const removeItem = useCallback((id) => {
    setResultBlob(null);
    setGrabbedIndex(null);
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const resetAll = useCallback(() => {
    setItems([]);
    setResultBlob(null);
    setError("");
    setNotice("");
    setGrabbedIndex(null);
    setStatus("");
  }, []);

  const moveItem = useCallback((from, to) => {
    setResultBlob(null);
    setItems((prev) => {
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  // Space grabs and drops, arrows move, Escape cancels — the WAI-ARIA
  // reorderable-list pattern, same as Reorder PDF.
  function handleKeyDown(event, index) {
    const { key } = event;

    if (key === " " || key === "Enter") {
      event.preventDefault();
      if (grabbedIndex === index) {
        setGrabbedIndex(null);
        setStatus(`Image dropped at position ${index + 1}.`);
      } else {
        setGrabbedIndex(index);
        setStatus(`Image ${index + 1} grabbed. Use the arrow keys to move it, then press space.`);
      }
      return;
    }

    if (key === "Escape" && grabbedIndex !== null) {
      event.preventDefault();
      setGrabbedIndex(null);
      setStatus("Move cancelled.");
      return;
    }

    if (key !== "ArrowUp" && key !== "ArrowDown") return;

    event.preventDefault();
    const target = index + (key === "ArrowUp" ? -1 : 1);
    if (target < 0 || target >= items.length) return;

    if (grabbedIndex === index) {
      // Captured before the move: afterwards `index` points at whichever item
      // shifted into the vacated slot, so focusing by position would follow
      // the wrong row.
      const movedId = items[index].id;
      moveItem(index, target);
      setGrabbedIndex(target);
      setStatus(`Moved to position ${target + 1} of ${items.length}.`);
      requestAnimationFrame(() => {
        document.getElementById(`image-row-${movedId}`)?.focus();
      });
    } else {
      document.getElementById(`image-row-${items[target].id}`)?.focus();
    }
  }

  /**
   * Decodes an image and re-encodes it into something pdf-lib can embed.
   *
   * Only called for formats PDF can't carry (WebP, AVIF, GIF, BMP). Runs on the
   * main thread via createImageBitmap + OffscreenCanvas rather than going
   * through the image worker: that worker's contract is a whole-batch resize
   * job, and threading a "just re-encode this one" mode through it would
   * complicate a shared module for a single caller.
   *
   * `imageOrientation: "from-image"` is what applies EXIF rotation — without
   * it every portrait phone photo lands in the PDF sideways.
   */
  const transcode = useCallback(async (file, targetType) => {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

    try {
      const canvas =
        typeof OffscreenCanvas !== "undefined"
          ? new OffscreenCanvas(bitmap.width, bitmap.height)
          : Object.assign(document.createElement("canvas"), {
              width: bitmap.width,
              height: bitmap.height,
            });

      // JPG has no alpha channel, so transparent pixels would encode as black
      // without a matte — which reads as a corrupted image rather than a
      // format limitation.
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

  async function handleConvert() {
    if (items.length === 0) return;

    setError("");
    setResultBlob(null);
    setIsPreparing(true);

    try {
      const prepared = [];
      const transcoded = [];

      // Sequential, not Promise.all: each decoded bitmap can be hundreds of
      // megabytes, and decoding twenty at once is a reliable way to have the
      // tab killed. Same reasoning as the image worker's batch loop.
      for (const item of items) {
        const plan = planEmbed(item.type);

        const source = plan.transcodeTo ? await transcode(item.file, plan.transcodeTo) : item.file;
        if (plan.transcodeTo) transcoded.push({ name: item.file.name, type: item.type });

        prepared.push({ embedAs: plan.embedAs, bytes: await source.arrayBuffer() });
      }

      setIsPreparing(false);

      const result = await run(
        ops.IMAGES_TO_PDF,
        { images: prepared, pageSizeId, orientation, marginId },
        // The prepared buffers are transferred, so they're detached here
        // afterwards. That's fine: they're rebuilt from the source files on
        // any re-run, and holding a second copy of a large batch is what we're
        // avoiding.
        { transfer: prepared.map((entry) => entry.bytes) }
      );

      setResultBlob(new Blob([result.bytes], { type: "application/pdf" }));
      setNotice(describeTranscodes(transcoded));

      trackEvent(events.TOOL_RUN, {
        file_count: items.length,
        page_size: pageSizeId,
        orientation,
        transcoded: transcoded.length,
      });
    } catch (err) {
      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "jpg_to_pdf_failed" });
      setError(
        String(err?.message || "").includes("re-encode")
          ? err.message
          : "Could not build the PDF from these images. One of them may be damaged."
      );
    } finally {
      setIsPreparing(false);
    }
  }

  // Previewed against the first image, which is what the user sees at the top
  // of the list — a live answer to "what will my page look like".
  const layoutPreview = useMemo(() => {
    if (items.length === 0) return null;
    // Nominal dimensions: the true ones need a decode, and this line only has
    // to convey the page shape and size, not the exact fit.
    const layout = layoutImagePage({
      imageWidth: 1000,
      imageHeight: pageSizeId === FIT_TO_IMAGE ? 1000 : 1414,
      pageSizeId,
      orientation,
      marginId,
    });
    return describePageLayout(layout, pageSizeId);
  }, [items.length, pageSizeId, orientation, marginId]);

  const busy = isRunning || isPreparing;
  const totalBytes = items.reduce((sum, item) => sum + item.file.size, 0);

  return (
    <div>
      <FileDropzone
        onFiles={handleFiles}
        accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/bmp,.jpg,.jpeg,.png,.webp,.avif,.gif,.bmp"
        multiple
        label={
          items.length === 0
            ? "Drag & drop images here, or click to browse"
            : "Add more images"
        }
      />

      <ErrorBanner>{error}</ErrorBanner>

      {notice && (
        <p role="status" style={{ fontSize: "13px", color: colors.warningText, marginTop: "12px" }}>
          {notice}
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
              marginBottom: "12px",
            }}
          >
            <span style={{ fontSize: "14px", color: colors.textSecondary }}>
              {items.length} image{items.length === 1 ? "" : "s"} · {formatBytes(totalBytes)}
            </span>
            <SecondaryButton onClick={resetAll} disabled={busy}>
              Clear all
            </SecondaryButton>
          </div>

          <p style={{ fontSize: "13px", color: colors.textFaint, margin: "0 0 12px" }}>
            Each image becomes one page, in the order shown. Drag a row to reorder it, or focus
            one and press space to pick it up and use the arrow keys.
          </p>

          <p
            aria-live="polite"
            style={{
              position: "absolute",
              width: "1px",
              height: "1px",
              overflow: "hidden",
              clip: "rect(0 0 0 0)",
              whiteSpace: "nowrap",
            }}
          >
            {status}
          </p>

          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px" }}>
            {items.map((item, index) => (
              <ImageRow
                key={item.id}
                item={item}
                index={index}
                total={items.length}
                grabbed={grabbedIndex === index}
                busy={busy}
                onKeyDown={(event) => handleKeyDown(event, index)}
                onDragStart={() => setDragIndex(index)}
                // Applied on drop, never dragover — reordering on every
                // dragover makes the row jump out from under the pointer.
                onDrop={() => {
                  if (dragIndex !== null) moveItem(dragIndex, index);
                  setDragIndex(null);
                }}
                onDragEnd={() => setDragIndex(null)}
                onMove={moveItem}
                onRemove={removeItem}
              />
            ))}
          </ul>

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
              Page setup
            </legend>

            <div style={{ display: "grid", gap: "16px" }}>
              <OptionRow label="Page size">
                {[...PAGE_SIZES, { id: FIT_TO_IMAGE, label: "Match image", note: "No borders" }].map(
                  (size) => (
                    <Chip
                      key={size.id}
                      active={pageSizeId === size.id}
                      onClick={() => {
                        setPageSizeId(size.id);
                        setResultBlob(null);
                      }}
                      disabled={busy}
                    >
                      {size.label}
                    </Chip>
                  )
                )}
              </OptionRow>

              {/* Orientation is meaningless when the page IS the image, so the
                  control is hidden rather than shown doing nothing. */}
              {pageSizeId !== FIT_TO_IMAGE && (
                <OptionRow label="Orientation">
                  {ORIENTATIONS.map((option) => (
                    <Chip
                      key={option.id}
                      active={orientation === option.id}
                      onClick={() => {
                        setOrientation(option.id);
                        setResultBlob(null);
                      }}
                      disabled={busy}
                    >
                      {option.label}
                    </Chip>
                  ))}
                </OptionRow>
              )}

              <OptionRow label="Margin">
                {MARGINS.map((margin) => (
                  <Chip
                    key={margin.id}
                    active={marginId === margin.id}
                    onClick={() => {
                      setMarginId(margin.id);
                      setResultBlob(null);
                    }}
                    disabled={busy}
                  >
                    {margin.label}
                  </Chip>
                ))}
              </OptionRow>
            </div>

            {layoutPreview && (
              <p style={{ fontSize: "13px", color: colors.textFaint, margin: "14px 0 0" }}>
                {layoutPreview}
                {orientation === "auto" && pageSizeId !== FIT_TO_IMAGE && (
                  <span> · each page turns to match its image</span>
                )}
              </p>
            )}
          </fieldset>

          {busy && (
            <ProgressBar
              progress={progress}
              indeterminate={isPreparing || !progress?.total}
              label={isPreparing ? "Reading images…" : undefined}
            />
          )}

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "20px" }}>
            <PrimaryButton onClick={handleConvert} disabled={busy}>
              <FileText size={16} />
              {busy ? "Building PDF…" : "Convert to PDF"}
            </PrimaryButton>

            {isRunning && <SecondaryButton onClick={cancel}>Cancel</SecondaryButton>}

            {resultBlob && !busy && (
              <DownloadButton
                getBlob={() => resultBlob}
                filename={outputPdfName(items.map((item) => item.file))}
              >
                Download {outputPdfName(items.map((item) => item.file))}
              </DownloadButton>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One queued image.
 *
 * Its own component so the preview URL can be derived with useMemo and revoked
 * when the row unmounts. Holding those URLs in a parent ref meant reading a ref
 * during render (which React 19 flags, since it makes the output depend on
 * mutable state the renderer can't track) and leaking a blob per file whenever
 * the list changed by a path that didn't happen to clean up. Same shape as
 * ImageQueue's row, for the same reasons.
 */
function ImageRow({
  item,
  index,
  total,
  grabbed,
  busy,
  onKeyDown,
  onDragStart,
  onDrop,
  onDragEnd,
  onMove,
  onRemove,
}) {
  // Derived, not stateful: the URL is a pure function of the file, so an
  // effect would only add a render pass with no thumbnail in it.
  const preview = useMemo(() => URL.createObjectURL(item.file), [item.file]);

  // Revoked on unmount and whenever the file changes, rather than only on an
  // explicit reset — otherwise every preview blob lives for the tab's lifetime
  // as the user adds and removes files.
  useEffect(() => () => URL.revokeObjectURL(preview), [preview]);

  return (
    <li
      id={`image-row-${item.id}`}
      tabIndex={0}
      role="button"
      aria-label={`Image ${index + 1} of ${total}: ${item.file.name}${
        grabbed ? ", grabbed" : ""
      }`}
      draggable={!busy}
      onKeyDown={onKeyDown}
      onDragStart={onDragStart}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
      onDragEnd={onDragEnd}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        border: `2px solid ${grabbed ? colors.primary : colors.border}`,
        backgroundColor: colors.surface,
        borderRadius: "10px",
        padding: "10px 12px",
        marginBottom: "8px",
        cursor: busy ? "default" : "grab",
      }}
    >
      <span
        style={{
          fontSize: "13px",
          color: colors.textFaint,
          minWidth: "24px",
          textAlign: "right",
        }}
      >
        {index + 1}
      </span>

      <span
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "8px",
          overflow: "hidden",
          flexShrink: 0,
          backgroundColor: colors.surfaceMuted,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={preview}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </span>

      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: "block",
            fontSize: "14px",
            color: colors.text,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.file.name}
        </span>
        <span style={{ fontSize: "12px", color: colors.textMuted }}>
          {formatBytes(item.file.size)}
        </span>
      </span>

      <button
        onClick={() => onMove(index, index - 1)}
        disabled={index === 0 || busy}
        aria-label={`Move ${item.file.name} earlier`}
        style={iconButtonStyle(index === 0 || busy)}
      >
        <ChevronUp size={15} />
      </button>
      <button
        onClick={() => onMove(index, index + 1)}
        disabled={index === total - 1 || busy}
        aria-label={`Move ${item.file.name} later`}
        style={iconButtonStyle(index === total - 1 || busy)}
      >
        <ChevronDown size={15} />
      </button>
      <button
        onClick={() => onRemove(item.id)}
        disabled={busy}
        aria-label={`Remove ${item.file.name}`}
        style={iconButtonStyle(busy, colors.danger)}
      >
        <X size={14} />
      </button>
    </li>
  );
}

function OptionRow({ label, children }) {
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
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>{children}</div>
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
