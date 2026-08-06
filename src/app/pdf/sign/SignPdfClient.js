"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PenLine } from "lucide-react";
import FileDropzone from "@/components/FileDropzone";
import DownloadButton from "@/components/DownloadButton";
import ErrorBanner from "@/components/ErrorBanner";
import WarningBanner from "@/components/WarningBanner";
import PdfFileHeader from "@/components/PdfFileHeader";
import SignaturePad, { rasterizeStrokes } from "@/components/SignaturePad";
import SignaturePlacementLayer from "@/components/SignaturePlacementLayer";
import { PrimaryButton, SecondaryButton } from "@/components/ToolButton";
import { validatePdfFile, describePdfError } from "@/lib/pdfFile";
import { validateImageFile } from "@/lib/imageValidation";
import { usePdfThumbnails } from "@/lib/pdfThumbnails";
import { usePdfWorker, ops } from "@/lib/pdfWorkerClient";
import { planEmbed } from "@/lib/pdfImageEmbed";
import {
  SOURCES,
  TYPE_FACES,
  INK_COLORS,
  DEFAULT_WIDTH_FRACTION,
  MAX_TYPED_LENGTH,
  findTypeFace,
  findInkColor,
  resolvePlacementRect,
  validateTypedSignature,
  describePlacements,
} from "@/lib/pdfSignature";
import { colors } from "@/lib/theme";
import { events, trackEvent } from "@/lib/analytics";

// A signature is a single asset placed in several spots, which is what makes
// this tool's state shape different from Watermark's. The asset (the drawn ink,
// the typed name, the uploaded image) is built once and reused; each placement
// only names where it goes.
let placementSeq = 0;

export default function SignPdfClient() {
  const [file, setFile] = useState(null);
  const [bytes, setBytes] = useState(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [error, setError] = useState("");
  const [resultBlob, setResultBlob] = useState(null);

  const [source, setSource] = useState("draw");
  const [strokes, setStrokes] = useState([]);
  const [typedText, setTypedText] = useState("");
  const [faceId, setFaceId] = useState(TYPE_FACES[0].id);
  const [colorId, setColorId] = useState(INK_COLORS[0].id);
  const [uploaded, setUploaded] = useState(null);

  const [placements, setPlacements] = useState([]);
  const [activeId, setActiveId] = useState(null);

  // True page dimensions and /Rotate, from the worker's INSPECT op — the
  // thumbnail hook only reports a page count. Sizing a signature against a
  // guessed A4 would put it at the wrong size on every non-A4 document and in
  // the wrong place on every rotated page, with nothing to indicate it.
  const [pageSizes, setPageSizes] = useState([]);

  const { pageCount, getThumbnail, isReady, error: renderError } = usePdfThumbnails(bytes);
  const { run, isRunning } = usePdfWorker();

  const bytesRef = useRef(null);

  const resetState = useCallback(() => {
    setFile(null);
    setBytes(null);
    setPageIndex(0);
    setResultBlob(null);
    setError("");
    setPageSizes([]);
    setPlacements([]);
    setActiveId(null);
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
      // the client — the worker already has the document open. Same pattern as
      // Crop and Watermark, which need the identical information.
      const info = await run(ops.INSPECT, { bytes: buffer.slice(0) }, { transfer: [] });

      setFile(check.file);
      setBytes(buffer);
      setPageSizes(info.pages);
      setPageIndex(0);
      setPlacements([]);
      setActiveId(null);
    } catch (err) {
      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "sign_read_failed" });
      setError(describePdfError(err, "Could not read this PDF."));
      resetState();
    }
  }

  /**
   * Accepts an uploaded signature image.
   *
   * Sniffed by the same validator the image tools use rather than trusting
   * file.type — Windows without a handler and most Android file providers report
   * an empty type for a perfectly good image. It also catches HEIC, which no
   * browser can decode and which is the iPhone camera default, so photographing
   * a signature on paper is exactly the path that would otherwise hit it.
   */
  async function handleSignatureImage(fileList) {
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

      setUploaded({ file: check.file, type: check.type, width, height });
    } catch (err) {
      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "sign_image_decode_failed" });
      setError("Could not read that image. Try a PNG or JPG.");
    }
  }

  const typedCheck = useMemo(() => validateTypedSignature(typedText), [typedText]);
  const inkHex = findInkColor(colorId).hex;

  // Whether there is a signature to place at all. Each source answers it
  // differently, and the "Add to page" button is gated on it rather than on the
  // tab — switching to Type with nothing typed shouldn't leave a stale drawn
  // signature placeable under a different label.
  const hasSignature =
    source === "draw" ? strokes.length > 0 : source === "type" ? typedCheck.ok : Boolean(uploaded);

  // The signature's aspect ratio, which drives every placement's height. Each
  // source measures it differently, and getting it from the wrong one produces a
  // stretched signature rather than an error.
  const aspect = useMemo(() => {
    if (source === "upload" && uploaded) return uploaded.width / uploaded.height;

    if (source === "type" && typedCheck.ok) {
      // Approximated from the character count rather than measured with real font
      // metrics, which would mean loading pdf-lib into the page bundle purely to
      // size a preview. The worker solves the true size from the placement box,
      // so this only has to be close enough that the initial box looks sensible.
      return Math.max(1.5, typedCheck.text.length * 0.5);
    }

    if (source === "draw") {
      const points = strokes.flat();
      if (points.length === 0) return 3;

      const xs = points.map((point) => point.x);
      const ys = points.map((point) => point.y);
      const width = Math.max(...xs) - Math.min(...xs);
      const height = Math.max(...ys) - Math.min(...ys);
      // A perfectly horizontal stroke has zero height; falling back keeps the
      // aspect finite rather than yielding Infinity and an invisible placement.
      return height > 0 && width > 0 ? width / height : 3;
    }

    return 3;
  }, [source, uploaded, typedCheck, strokes]);

  const previewPage = pageSizes[pageIndex];
  const pageWidth = previewPage?.width || 595.28;
  const pageHeight = previewPage?.height || 841.89;
  const pageRotation = previewPage?.rotation || 0;

  const quarterTurned = pageRotation % 180 !== 0;
  const displayWidth = quarterTurned ? pageHeight : pageWidth;
  const displayHeight = quarterTurned ? pageWidth : pageHeight;

  // Read during render rather than mirrored into state — usePdfThumbnails bumps
  // its own version counter when a render finishes, so this picks up the new URL
  // without a second render pass. Same as Crop, Reorder, Watermark, and Numbers.
  const preview = isReady && pageCount > 0 ? getThumbnail(pageIndex + 1) : null;

  function addPlacement() {
    if (!hasSignature) return;

    placementSeq += 1;
    const id = `placement-${placementSeq}`;

    setPlacements((current) => [
      ...current,
      {
        id,
        pageIndex,
        // Dropped just above the page's lower third, roughly where a signature
        // line sits on a contract — near enough that most people drag it a
        // little rather than hunting for it.
        x: 0.12,
        y: 0.72,
        widthFraction: DEFAULT_WIDTH_FRACTION,
        source,
        aspect,
        // The asset is snapshotted at placement time, so changing the ink colour
        // or retyping afterwards doesn't silently rewrite signatures already
        // placed. Someone signing with one name and initialling with another is
        // an ordinary thing to want.
        strokes: source === "draw" ? strokes.map((stroke) => [...stroke]) : null,
        text: source === "type" ? typedCheck.text : null,
        faceId,
        colorId,
        image: source === "upload" ? uploaded : null,
      },
    ]);

    setActiveId(id);
    setResultBlob(null);
  }

  const updatePlacement = useCallback((id, patch) => {
    setPlacements((current) =>
      current.map((placement) => (placement.id === id ? { ...placement, ...patch } : placement))
    );
    setResultBlob(null);
  }, []);

  const removePlacement = useCallback((id) => {
    setPlacements((current) => current.filter((placement) => placement.id !== id));
    setActiveId((current) => (current === id ? null : current));
    setResultBlob(null);
  }, []);

  // Placements on the page currently shown, resolved to normalised rects and
  // given their preview markup. Resolution goes through the same
  // resolvePlacementRect() the export path uses, so what is on screen and what
  // lands in the file are computed by one function rather than two that drift.
  const visiblePlacements = useMemo(
    () =>
      placements
        .filter((placement) => placement.pageIndex === pageIndex)
        .map((placement) => ({
          ...placement,
          rect: resolvePlacementRect(placement, placement.aspect, displayWidth, displayHeight),
          preview: <PlacementPreview placement={placement} />,
        })),
    [placements, pageIndex, displayWidth, displayHeight]
  );

  async function handleSign() {
    setError("");
    setResultBlob(null);

    if (placements.length === 0) {
      setError("Add your signature to the page before signing.");
      return;
    }

    try {
      // Assets are deduplicated before they cross to the worker: a signature
      // placed on forty pages is one PNG embedded once, not forty copies of the
      // same bitmap in the output file.
      const assets = [];
      const assetIds = new Map();
      const transfer = [];

      for (const placement of placements) {
        const key = assetKey(placement);
        if (assetIds.has(key)) continue;

        const id = `asset-${assets.length}`;
        assetIds.set(key, id);

        if (placement.source === "type") {
          assets.push({
            id,
            kind: "text",
            text: placement.text,
            faceId: placement.faceId,
            colorId: placement.colorId,
          });
          continue;
        }

        let blob;
        let sourceType;

        if (placement.source === "draw") {
          const raster = await rasterizeStrokes(
            placement.strokes,
            findInkColor(placement.colorId).hex
          );
          if (!raster) continue;
          blob = raster.blob;
          sourceType = "image/png";
        } else {
          blob = placement.image.file;
          sourceType = placement.image.type;
        }

        // pdf-lib embeds only JPEG and PNG — there is no WebP or AVIF filter in
        // the PDF spec — so anything else is transcoded on the way in. Reusing
        // planEmbed keeps this tool's rules identical to JPG to PDF's and
        // Watermark's rather than drifting into a third copy.
        const plan = planEmbed(sourceType);
        const finalBlob = plan.transcodeTo ? await transcode(blob, plan.transcodeTo) : blob;
        const buffer = await finalBlob.arrayBuffer();

        assets.push({ id, kind: "image", bytes: buffer, embedAs: plan.embedAs });
        transfer.push(buffer);
      }

      const payload = placements
        .map((placement) => ({
          pageIndex: placement.pageIndex,
          assetId: assetIds.get(assetKey(placement)),
          rect: resolvePlacementRect(
            placement,
            placement.aspect,
            // The rect is resolved against the page it actually sits on, not the
            // one being previewed — a document mixing portrait and landscape
            // pages would otherwise place every signature against the previewed
            // page's frame.
            pageDisplaySize(pageSizes[placement.pageIndex]).width,
            pageDisplaySize(pageSizes[placement.pageIndex]).height
          ),
        }))
        .filter((entry) => entry.assetId);

      const result = await run(
        ops.SIGN,
        {
          // slice(0) because bytes are *transferred* to the worker, not copied —
          // passing the original would detach it and leave a second run with a
          // zero-length buffer.
          bytes: bytesRef.current.slice(0),
          placements: payload,
          assets,
        },
        { transfer }
      );

      setResultBlob(new Blob([result.bytes], { type: "application/pdf" }));
      trackEvent(events.TOOL_RUN, {
        source,
        signature_count: result.signedCount,
        page_count: result.signedPageCount,
        source_page_count: pageCount,
      });
    } catch (err) {
      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "sign_failed" });
      setError(describePdfError(err, "Could not sign this PDF."));
    }
  }

  /**
   * Re-encodes an image into something pdf-lib can embed.
   *
   * Same shape as JpgToPdfClient's and WatermarkPdfClient's, for the same reason:
   * the image worker's contract is a whole-batch resize job, so threading a "just
   * re-encode this one" mode through it would complicate a shared module for a
   * single caller. `imageOrientation: "from-image"` applies EXIF rotation —
   * without it a signature photographed on a phone lands sideways.
   */
  const transcode = useCallback(async (sourceBlob, targetType) => {
    const bitmap = await createImageBitmap(sourceBlob, { imageOrientation: "from-image" });

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

          <div style={{ maxWidth: "460px", margin: "0 auto 12px", width: "100%" }}>
            {preview ? (
              <SignaturePlacementLayer
                placements={visiblePlacements}
                activeId={activeId}
                onSelect={setActiveId}
                onChange={updatePlacement}
                onRemove={removePlacement}
                disabled={isRunning}
              >
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
              </SignaturePlacementLayer>
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
            Drag a placed signature to move it, or drag its corner to resize.
          </p>

          <fieldset style={fieldsetStyle}>
            <legend style={legendStyle}>Your signature</legend>

            <div style={{ display: "grid", gap: "16px" }}>
              <Field label="How">
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {SOURCES.map((option) => (
                    <Chip
                      key={option.id}
                      active={source === option.id}
                      onClick={() => setSource(option.id)}
                      disabled={isRunning}
                    >
                      {option.label}
                    </Chip>
                  ))}
                </div>
              </Field>

              {source === "draw" && (
                <>
                  <SignaturePad
                    strokes={strokes}
                    onChange={setStrokes}
                    colorHex={inkHex}
                    disabled={isRunning}
                  />
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <SecondaryButton
                      onClick={() => setStrokes([])}
                      disabled={strokes.length === 0 || isRunning}
                    >
                      Clear
                    </SecondaryButton>
                    <SecondaryButton
                      onClick={() => setStrokes((current) => current.slice(0, -1))}
                      disabled={strokes.length === 0 || isRunning}
                    >
                      Undo stroke
                    </SecondaryButton>
                  </div>
                </>
              )}

              {source === "type" && (
                <>
                  <label style={{ display: "block" }}>
                    <span style={labelStyle}>Name</span>
                    <input
                      type="text"
                      value={typedText}
                      maxLength={MAX_TYPED_LENGTH}
                      placeholder="Your name"
                      onChange={(event) => setTypedText(event.target.value)}
                      disabled={isRunning}
                      style={{
                        width: "100%",
                        maxWidth: "360px",
                        padding: "9px 11px",
                        fontSize: "14px",
                        color: colors.text,
                        backgroundColor: colors.surface,
                        border: `1px solid ${
                          typedText && !typedCheck.ok ? colors.danger : colors.borderInput
                        }`,
                        borderRadius: "8px",
                      }}
                    />
                    {typedText && !typedCheck.ok && (
                      <span
                        style={{
                          display: "block",
                          fontSize: "12px",
                          color: colors.danger,
                          marginTop: "6px",
                        }}
                      >
                        {typedCheck.error}
                      </span>
                    )}
                  </label>

                  <Field label="Style">
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {TYPE_FACES.map((option) => (
                        <Chip
                          key={option.id}
                          active={faceId === option.id}
                          onClick={() => setFaceId(option.id)}
                          disabled={isRunning}
                        >
                          <span style={{ fontFamily: option.cssStack }}>{option.label}</span>
                        </Chip>
                      ))}
                    </div>
                  </Field>

                  {typedCheck.ok && (
                    <div
                      style={{
                        padding: "16px",
                        border: `1px solid ${colors.border}`,
                        borderRadius: "10px",
                        textAlign: "center",
                        fontFamily: findTypeFace(faceId).cssStack,
                        fontSize: "28px",
                        color: inkHex,
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {typedCheck.text}
                    </div>
                  )}
                </>
              )}

              {source === "upload" && (
                <Field label="Image">
                  {uploaded ? (
                    <div
                      style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}
                    >
                      <UploadedThumbnail image={uploaded} />
                      <span style={{ fontSize: "13px", color: colors.textMuted }}>
                        {uploaded.file.name} · {uploaded.width}×{uploaded.height}
                      </span>
                      <SecondaryButton onClick={() => setUploaded(null)} disabled={isRunning}>
                        Remove
                      </SecondaryButton>
                    </div>
                  ) : (
                    <FileDropzone
                      onFiles={handleSignatureImage}
                      accept="image/png,image/jpeg,image/webp,image/avif,image/gif,image/bmp,.png,.jpg,.jpeg,.webp,.avif,.gif,.bmp"
                      label="Drop a photo or scan of your signature, or click to browse"
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
                    A PNG with a transparent background works best — a photo on white paper will
                    cover whatever it sits on.
                  </span>
                </Field>
              )}

              {source !== "upload" && (
                <Field label="Ink">
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {INK_COLORS.map((option) => (
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
                            marginRight: "6px",
                            verticalAlign: "middle",
                          }}
                        />
                        {option.label}
                      </Chip>
                    ))}
                  </div>
                </Field>
              )}

              <div>
                <PrimaryButton onClick={addPlacement} disabled={!hasSignature || isRunning}>
                  <PenLine size={16} />
                  Add to page {pageIndex + 1}
                </PrimaryButton>
                <p style={{ fontSize: "13px", color: colors.textFaint, margin: "10px 0 0" }}>
                  {describePlacements(placements)}
                </p>
              </div>
            </div>
          </fieldset>

          {/* Stated before the download rather than in the FAQ alone. Someone
              signing a contract is entitled to know what this does and does not
              amount to, and finding out afterwards is the failure mode worth
              designing against. */}
          <WarningBanner>
            This draws your signature onto the page. It is not a certificate-based digital
            signature, so it carries no cryptographic proof of who signed or that the document is
            unaltered.
          </WarningBanner>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "20px" }}>
            <PrimaryButton onClick={handleSign} disabled={placements.length === 0 || isRunning}>
              <PenLine size={16} />
              {isRunning ? "Signing…" : "Sign PDF"}
            </PrimaryButton>

            {resultBlob && !isRunning && (
              <DownloadButton getBlob={() => resultBlob} filename="signed.pdf">
                Download signed.pdf
              </DownloadButton>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Identifies the asset a placement draws, so identical ones embed once.
 *
 * Drawn signatures key on their stroke data rather than on identity, because the
 * same ink placed forty times must not become forty PNGs in the output — pdf-lib
 * deduplicates fonts but not images.
 */
function assetKey(placement) {
  if (placement.source === "type") {
    return `type:${placement.text}:${placement.faceId}:${placement.colorId}`;
  }
  if (placement.source === "upload") {
    return `upload:${placement.image.file.name}:${placement.image.file.size}`;
  }
  return `draw:${placement.colorId}:${JSON.stringify(placement.strokes)}`;
}

/** The displayed dimensions of a page, falling back to A4 before INSPECT lands. */
function pageDisplaySize(page) {
  const width = page?.width || 595.28;
  const height = page?.height || 841.89;
  const quarterTurned = (page?.rotation || 0) % 180 !== 0;
  return {
    width: quarterTurned ? height : width,
    height: quarterTurned ? width : height,
  };
}

/**
 * What a placed signature looks like on the page preview.
 *
 * Scaled to fill its placement box rather than drawn at a fixed size, so what is
 * on screen matches the proportions the worker will draw. Text uses a CSS font
 * stack that only approximates the PDF face — the client says so, since a
 * preview that promised an exact match would be lying about a detail the user
 * cannot check until after download.
 */
function PlacementPreview({ placement }) {
  if (placement.source === "type") {
    return (
      <span
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: findTypeFace(placement.faceId).cssStack,
          color: findInkColor(placement.colorId).hex,
          // Sized to the box height in container units so it scales with the
          // placement instead of being pinned to a pixel size the layout doesn't
          // control.
          fontSize: "80cqh",
          whiteSpace: "nowrap",
          lineHeight: 1,
          containerType: "size",
        }}
      >
        {placement.text}
      </span>
    );
  }

  if (placement.source === "upload") {
    return <ImagePreview file={placement.image.file} />;
  }

  return <StrokePreview placement={placement} />;
}

/** A drawn signature, re-rendered as SVG so it stays crisp at any preview size. */
function StrokePreview({ placement }) {
  const points = placement.strokes.flat();
  if (points.length === 0) return null;

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  // Padded and floored for the same reason strokeBounds() is: a stroke is centred
  // on its path, so cropping to the raw bounds shaves its outer edge, and a
  // perfectly straight stroke has a zero dimension that would collapse the
  // viewBox.
  const width = Math.max(1, Math.max(...xs) - minX) + 6;
  const height = Math.max(1, Math.max(...ys) - minY) + 6;

  return (
    <svg
      viewBox={`${minX - 3} ${minY - 3} ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      aria-hidden="true"
    >
      {placement.strokes.map((stroke, index) => (
        <path
          key={index}
          d={strokePath(stroke)}
          fill="none"
          stroke={findInkColor(placement.colorId).hex}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

function strokePath(stroke) {
  if (stroke.length === 0) return "";
  if (stroke.length === 1) return `M ${stroke[0].x} ${stroke[0].y} L ${stroke[0].x} ${stroke[0].y}`;

  let path = `M ${stroke[0].x} ${stroke[0].y}`;
  for (let i = 1; i < stroke.length - 1; i++) {
    const current = stroke[i];
    const next = stroke[i + 1];
    path += ` Q ${current.x} ${current.y} ${(current.x + next.x) / 2} ${(current.y + next.y) / 2}`;
  }
  const last = stroke[stroke.length - 1];
  return `${path} L ${last.x} ${last.y}`;
}

/**
 * An uploaded signature on the preview.
 *
 * Its own component so the object URL is derived with useMemo and revoked on
 * unmount — a document with a signature on every page holds one of these per
 * placement, and leaking a blob per placement per edit would accumulate fast.
 */
function ImagePreview({ file }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill" }}
    />
  );
}

function UploadedThumbnail({ image }) {
  const url = useMemo(() => URL.createObjectURL(image.file), [image]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  return (
    <span
      style={{
        width: "72px",
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
