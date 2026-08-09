"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Copy, Check } from "lucide-react";
import FileDropzone from "@/components/FileDropzone";
import DownloadButton from "@/components/DownloadButton";
import ErrorBanner from "@/components/ErrorBanner";
import { PrimaryButton, SecondaryButton } from "@/components/ToolButton";
import { validateImageFile, describeImageError } from "@/lib/imageValidation";
import { drawIcon } from "@/lib/faviconDraw";
import {
  ICON_SIZES,
  ICO_SIZES,
  ICO_FILENAME,
  MANIFEST_FILENAME,
  pngPlan,
  headSnippet,
  manifestJson,
  readmeText,
  normaliseHexColor,
} from "@/lib/faviconPlan";
import { encodeIco } from "@/lib/icoEncoder";
import { canvasToBlob } from "@/lib/imageFile";
import { events, trackEvent } from "@/lib/analytics";
import { colors } from "@/lib/theme";

// This tool renders on the main thread rather than through image.worker.js,
// deliberately. The worker exists because decoding a 50-megapixel photo and
// re-encoding it at full size takes seconds of solid CPU. Here the source is
// decoded once and every output is at most 512px — the entire set encodes in
// well under a frame's worth of work on any device that can run the preview.
// Routing it through the worker would mean a new op, a settings contract, and
// a second copy of the draw call, to move work that isn't blocking anything.
//
// The live preview is the reason the decode happens here: it needs the bitmap
// on hand to redraw on every slider move, and shipping the same bytes to a
// worker as well would decode the image twice.

// The sizes shown as previews. Not every generated size — a row of nine
// thumbnails is noise. These three are the ones people actually judge: the tab
// icon at its real size, a mid size, and the home-screen icon.
const PREVIEW_SIZES = [16, 32, 180];

const DEFAULTS = {
  background: "#ffffff",
  useBackground: false,
  roundness: 0,
  padding: 0,
  fit: "contain",
  text: "",
  siteName: "",
};

export default function FaviconGeneratorClient() {
  const [mode, setMode] = useState("image");
  const [source, setSource] = useState(null); // { bitmap, name, width, height }
  const [settings, setSettings] = useState(DEFAULTS);
  const [error, setError] = useState("");
  const [isBuilding, setIsBuilding] = useState(false);
  const [copied, setCopied] = useState(false);

  // The decoded bitmap owns GPU/CPU memory that GC is slow to reclaim, and a
  // user trying three logos in a row would otherwise hold all three. It is
  // closed explicitly whenever it is replaced, and on unmount.
  //
  // The ref tracks the live bitmap for that unmount cleanup, which cannot read
  // `source` — an effect with an empty dependency array closes over the first
  // render's value, so it would free nothing after the first file. The ref is
  // written only from the handlers that actually swap the bitmap, never during
  // render: a render-phase write is discarded if React abandons the render,
  // which would leak the very bitmap it was meant to track.
  const sourceRef = useRef(null);

  // Tracks an in-flight zip build synchronously — see buildZip for why the
  // isBuilding state below cannot do this job on its own.
  const buildingRef = useRef(false);

  useEffect(() => {
    return () => {
      sourceRef.current?.close?.();
      sourceRef.current = null;
    };
  }, []);

  /** Swaps in a new bitmap, freeing whatever it replaces. */
  const adoptBitmap = useCallback((bitmap) => {
    sourceRef.current?.close?.();
    sourceRef.current = bitmap;
  }, []);

  const themeColor = normaliseHexColor(settings.background, "#ffffff");
  const background = settings.useBackground ? themeColor : "transparent";

  // Everything the draw call needs, assembled in one place so the preview and
  // the export cannot drift apart in what they pass.
  //
  // Memoised rather than rebuilt each render, and that is what lets renderPng
  // below depend on this object directly instead of re-listing its fields with
  // an exhaustive-deps suppression. A hand-listed dep array is a second copy of
  // this object's shape: adding a field here and forgetting it there would let
  // the export keep drawing with the previous value while the preview showed
  // the new one — the preview/export drift faviconDraw.js is structured to make
  // impossible. With one memo, both consumers track the same identity and the
  // linter can verify it.
  const drawSettings = useMemo(
    () => ({
      mode,
      background,
      roundness: settings.roundness,
      padding: settings.padding,
      fit: settings.fit,
      text: settings.text,
    }),
    [mode, background, settings.roundness, settings.padding, settings.fit, settings.text]
  );

  const ready = mode === "text" ? settings.text.trim() !== "" : Boolean(source);

  const handleFiles = useCallback(async (fileList) => {
    const file = Array.from(fileList || [])[0];
    if (!file) return;

    setError("");

    const result = await validateImageFile(file);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    try {
      // "from-image" applies the EXIF orientation tag, for the same reason the
      // image worker does it: without it a logo photographed or exported from a
      // phone lands sideways, and at 16px that is unrecognisable rather than
      // merely wrong.
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

      // Frees the previous bitmap immediately rather than waiting for GC,
      // which matters when someone is trying several logos in a row.
      adoptBitmap(bitmap);

      setSource({
        bitmap,
        name: file.name,
        width: bitmap.width,
        height: bitmap.height,
      });
      setMode("image");
    } catch (err) {
      setError(describeImageError(err, "Could not read that image."));
    }
  }, [adoptBitmap]);

  /**
   * Renders one icon size to a PNG blob.
   *
   * A fresh canvas per size rather than one resized between draws: resizing a
   * canvas resets its context state anyway, and reuse would mean the previous
   * size's pixels are still present if a draw is skipped.
   */
  const renderPng = useCallback(
    async (size) => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;

      const ctx = canvas.getContext("2d");
      drawIcon(ctx, size, drawSettings, source?.bitmap ?? null);

      // Always through canvasToBlob, never canvas.toBlob directly: the raw
      // callback yields null on encode failure and URL.createObjectURL(null)
      // throws. PNG throughout — every icon size needs alpha, and a JPG
      // favicon would carry a white box on a transparent background.
      const blob = await canvasToBlob(canvas, "image/png");
      return { size, blob, bytes: await blob.arrayBuffer() };
    },
    [drawSettings, source]
  );

  /**
   * Builds the complete zip.
   *
   * Passed to DownloadButton as an async getBlob, so the work happens on the
   * click rather than on every settings change — the set is six encodes plus a
   * zip, which is wasted effort for a user still moving the padding slider.
   */
  const buildZip = useCallback(async () => {
    // Guarded by a ref, not by the isBuilding state that drives the label.
    // DownloadButton's `disabled` prop is read from the render that has already
    // committed, so a second click landing before React re-renders — which is
    // every click during the first await — runs a whole second six-encode
    // build. The ref is written synchronously, so it is already true by the
    // time that second handler reads it.
    if (buildingRef.current) return null;
    buildingRef.current = true;

    setIsBuilding(true);
    setError("");

    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      // Rendered once per distinct size and shared between the PNG files and
      // the .ico, which needs 16/32/48 — all three are also standalone files,
      // so rendering per-consumer would encode each of them twice.
      const rendered = new Map();
      const sizes = [...new Set([...ICON_SIZES.map((i) => i.size), ...ICO_SIZES])];

      for (const size of sizes) {
        rendered.set(size, await renderPng(size));
      }

      pngPlan().forEach((icon) => {
        zip.file(icon.filename, rendered.get(icon.size).bytes);
      });

      // Smallest-first inside the .ico, matching what Windows' own icon editor
      // writes. Readers pick by size rather than position, but the convention
      // is what people see if they open the file in an editor.
      zip.file(
        ICO_FILENAME,
        encodeIco(
          [...ICO_SIZES]
            .sort((a, b) => a - b)
            .map((size) => ({
              width: size,
              height: size,
              bytes: rendered.get(size).bytes,
            }))
        )
      );

      zip.file(MANIFEST_FILENAME, manifestJson({ name: settings.siteName, themeColor }));
      zip.file("head.html", `${headSnippet({ themeColor })}\n`);
      zip.file("README.txt", readmeText({ name: settings.siteName }));

      trackEvent(events.TOOL_RUN, {
        mode,
        file_count: 1,
        icon_count: ICON_SIZES.length,
      });

      return zip.generateAsync({ type: "blob" });
    } catch (err) {
      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "favicon_failed" });
      setError(describeImageError(err, "Could not generate the favicon set."));
      return null;
    } finally {
      buildingRef.current = false;
      setIsBuilding(false);
    }
  }, [renderPng, settings.siteName, themeColor, mode]);

  const snippet = headSnippet({ themeColor });

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to the clipboard. Select the code and copy it manually.");
    }
  }

  function update(patch) {
    setSettings((prev) => ({ ...prev, ...patch }));
  }

  return (
    <div>
      <ModeTabs
        mode={mode}
        onChange={(next) => {
          setMode(next);
          setError("");
        }}
      />

      {mode === "image" ? (
        <FileDropzone
          onFiles={handleFiles}
          accept="image/*"
          label={
            source
              ? `${source.name} — ${source.width}×${source.height}. Drop another to replace it.`
              : "Drag & drop your logo here, or click to browse"
          }
        />
      ) : (
        <div style={{ marginBottom: "4px" }}>
          <label
            htmlFor="favicon-text"
            style={{
              display: "block",
              fontSize: "14px",
              fontWeight: 500,
              color: colors.textSecondary,
              marginBottom: "8px",
            }}
          >
            Letter or symbol
          </label>
          <input
            id="favicon-text"
            type="text"
            value={settings.text}
            onChange={(event) => update({ text: event.target.value.slice(0, 3) })}
            placeholder="A"
            maxLength={3}
            style={{
              width: "100%",
              maxWidth: "160px",
              padding: "10px 12px",
              fontSize: "16px",
              border: `1px solid ${colors.borderInput}`,
              borderRadius: "8px",
              backgroundColor: colors.surface,
              color: colors.text,
            }}
          />
          <p style={{ fontSize: "13px", color: colors.textFaint, margin: "8px 0 0" }}>
            One or two characters read best. A favicon is 16 pixels wide in a browser tab —
            about the size of this text — so a third character is already crowded.
          </p>
        </div>
      )}

      <ErrorBanner>{error}</ErrorBanner>

      {ready && (
        <>
          <Preview settings={drawSettings} source={source?.bitmap ?? null} />

          <Controls
            mode={mode}
            settings={settings}
            update={update}
            themeColor={themeColor}
          />

          <div
            style={{
              display: "flex",
              gap: "12px",
              flexWrap: "wrap",
              alignItems: "center",
              marginTop: "24px",
            }}
          >
            <DownloadButton getBlob={buildZip} filename="favicons.zip" disabled={isBuilding}>
              {isBuilding ? "Building…" : `Download all ${ICON_SIZES.length + 1} icons (.zip)`}
            </DownloadButton>

            {(source || settings.text) && (
              <SecondaryButton
                onClick={() => {
                  adoptBitmap(null);
                  setSource(null);
                  setSettings(DEFAULTS);
                  setError("");
                  // Back to the image tab too, not just cleared state. In text
                  // mode, blanking `text` makes `ready` false, which unmounts
                  // this whole panel — including this button — leaving the user
                  // staring at an empty text field with nothing confirming the
                  // reset happened. Returning to the default tab makes "start
                  // over" land somewhere that looks like a start.
                  setMode("image");
                }}
              >
                Start over
              </SecondaryButton>
            )}
          </div>

          <Snippet snippet={snippet} copied={copied} onCopy={copySnippet} />
        </>
      )}

      {!ready && mode === "image" && (
        <p style={{ fontSize: "13px", color: colors.textFaint, marginTop: "16px" }}>
          A square PNG with a transparent background works best. Anything non-square gets fitted
          or cropped — you choose which, once it&apos;s loaded.
        </p>
      )}
    </div>
  );
}

/**
 * The live preview.
 *
 * Draws through the same drawIcon() the export uses, at the real output sizes.
 * Showing a scaled-up 16px render rather than a 16px canvas blown up in CSS
 * would flatter it: the whole question a favicon preview has to answer is
 * whether the artwork survives being that small, and CSS scaling of a larger
 * render hides exactly the detail loss the user needs to see.
 */
function Preview({ settings, source }) {
  const refs = useRef({});

  useEffect(() => {
    PREVIEW_SIZES.forEach((size) => {
      const canvas = refs.current[size];
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      drawIcon(ctx, size, settings, source);
    });
  }, [settings, source]);

  return (
    <div
      style={{
        display: "flex",
        gap: "24px",
        alignItems: "flex-end",
        flexWrap: "wrap",
        padding: "20px",
        marginTop: "20px",
        border: `1px solid ${colors.border}`,
        borderRadius: "10px",
        backgroundColor: colors.surfaceMuted,
      }}
    >
      {PREVIEW_SIZES.map((size) => (
        <div key={size} style={{ textAlign: "center" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "64px",
              marginBottom: "8px",
            }}
          >
            <canvas
              ref={(node) => {
                refs.current[size] = node;
              }}
              width={size}
              height={size}
              // Rendered at its true pixel size — see the note above. The
              // checkerboard shows through transparent areas so an unfilled
              // background is visible rather than reading as white.
              style={{
                width: `${size}px`,
                height: `${size}px`,
                backgroundImage:
                  "linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)",
                backgroundSize: "8px 8px",
                backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
              }}
            />
          </div>
          <span style={{ fontSize: "12px", color: colors.textFaint }}>
            {size}px
            {size === 16 && " — browser tab"}
            {size === 180 && " — iOS"}
          </span>
        </div>
      ))}
    </div>
  );
}

function Controls({ mode, settings, update, themeColor }) {
  return (
    <div style={{ marginTop: "24px", display: "grid", gap: "20px" }}>
      {mode === "image" && (
        <Field label="Non-square images">
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Choice
              active={settings.fit === "contain"}
              onClick={() => update({ fit: "contain" })}
            >
              Fit whole logo
            </Choice>
            <Choice active={settings.fit === "cover"} onClick={() => update({ fit: "cover" })}>
              Fill and crop
            </Choice>
          </div>
          <Hint>
            {settings.fit === "contain"
              ? "The whole image fits inside the square, with margin on the short side. Right for a logo or wordmark."
              : "The image fills the square and the overflow is cropped. Right for a photo, where margin looks like a mistake."}
          </Hint>
        </Field>
      )}

      <Field label={`Padding — ${Math.round(settings.padding * 100)}%`}>
        <Slider
          value={settings.padding}
          min={0}
          max={0.3}
          step={0.01}
          onChange={(value) => update({ padding: value })}
          label="Padding"
        />
        <Hint>
          Breathing room around the artwork. Android crops home-screen icons to a circle on many
          launchers, so a little padding stops the edges being clipped.
        </Hint>
      </Field>

      <Field label={`Corner rounding — ${Math.round(settings.roundness * 200)}%`}>
        <Slider
          value={settings.roundness}
          min={0}
          max={0.5}
          step={0.01}
          onChange={(value) => update({ roundness: value })}
          label="Corner rounding"
        />
        <Hint>
          Rounds the background and crops the artwork to match. At the maximum the icon is a
          circle. iOS applies its own rounding on top, so leave this at zero if iOS is the
          priority.
        </Hint>
      </Field>

      <Field label="Background">
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <label style={checkboxLabelStyle}>
            <input
              type="checkbox"
              checked={settings.useBackground}
              onChange={(event) => update({ useBackground: event.target.checked })}
            />
            Solid colour
          </label>

          <input
            type="color"
            value={themeColor}
            disabled={!settings.useBackground}
            onChange={(event) => update({ background: event.target.value })}
            aria-label="Background colour"
            style={{
              width: "44px",
              height: "36px",
              padding: "2px",
              border: `1px solid ${colors.borderInput}`,
              borderRadius: "8px",
              backgroundColor: colors.surface,
              cursor: settings.useBackground ? "pointer" : "not-allowed",
              opacity: settings.useBackground ? 1 : 0.5,
            }}
          />
        </div>
        <Hint>
          {mode === "text"
            ? "The letter's colour is chosen automatically for contrast against this."
            : "Left transparent, the icon takes the colour of whatever sits behind it. A solid colour is safer on dark browser themes."}
        </Hint>
      </Field>

      <Field label="Site name (optional)">
        <input
          type="text"
          value={settings.siteName}
          onChange={(event) => update({ siteName: event.target.value })}
          placeholder="Acme Inc"
          style={{
            width: "100%",
            maxWidth: "320px",
            padding: "10px 12px",
            fontSize: "14px",
            border: `1px solid ${colors.borderInput}`,
            borderRadius: "8px",
            backgroundColor: colors.surface,
            color: colors.text,
          }}
        />
        <Hint>
          Goes into site.webmanifest, which is what Android shows under the icon when someone adds
          your site to their home screen.
        </Hint>
      </Field>
    </div>
  );
}

function Snippet({ snippet, copied, onCopy }) {
  return (
    <div style={{ marginTop: "32px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          marginBottom: "8px",
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: "14px", fontWeight: 600, color: colors.text }}>
          Paste this into your &lt;head&gt;
        </span>
        <SecondaryButton onClick={onCopy}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </SecondaryButton>
      </div>

      <pre
        style={{
          margin: 0,
          padding: "16px",
          border: `1px solid ${colors.border}`,
          borderRadius: "10px",
          backgroundColor: colors.surfaceMuted,
          color: colors.textSecondary,
          fontSize: "12.5px",
          lineHeight: 1.7,
          overflowX: "auto",
        }}
      >
        <code>{snippet}</code>
      </pre>

      <p style={{ fontSize: "13px", color: colors.textFaint, margin: "8px 0 0" }}>
        Upload the files to your site&apos;s root, not a subfolder — iOS looks for
        /apple-touch-icon.png by name. The zip includes a README with the same note.
      </p>
    </div>
  );
}

function ModeTabs({ mode, onChange }) {
  const options = [
    { value: "image", label: "From an image" },
    { value: "text", label: "From a letter" },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Favicon source"
      style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}
    >
      {options.map((option, index) => (
        <button
          key={option.value}
          role="radio"
          aria-checked={mode === option.value}
          tabIndex={mode === option.value ? 0 : -1}
          onClick={() => onChange(option.value)}
          // Arrow-key navigation, matching ModeToggle in the calculators. A
          // radiogroup that only responds to clicks tells a screen reader it is
          // one thing and behaves as another.
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowDown") {
              event.preventDefault();
              onChange(options[(index + 1) % options.length].value);
            }
            if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
              event.preventDefault();
              onChange(options[(index - 1 + options.length) % options.length].value);
            }
          }}
          style={{
            border: `1px solid ${mode === option.value ? colors.primary : colors.border}`,
            backgroundColor: mode === option.value ? colors.primarySoft : colors.surface,
            color: mode === option.value ? colors.primary : colors.textSecondary,
            borderRadius: "8px",
            padding: "9px 16px",
            fontSize: "14px",
            fontWeight: 500,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          {option.value === "text" && <Sparkles size={14} />}
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <span
        style={{
          display: "block",
          fontSize: "14px",
          fontWeight: 500,
          color: colors.textSecondary,
          marginBottom: "8px",
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

function Slider({ value, min, max, step, onChange, label }) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={label}
      onChange={(event) => onChange(Number(event.target.value))}
      style={{ width: "100%", maxWidth: "320px", accentColor: colors.primary }}
    />
  );
}

function Choice({ active, onClick, children }) {
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

function Hint({ children }) {
  return (
    <p style={{ fontSize: "13px", color: colors.textFaint, margin: "8px 0 0", lineHeight: 1.6 }}>
      {children}
    </p>
  );
}

const checkboxLabelStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  fontSize: "14px",
  color: colors.textSecondary,
  cursor: "pointer",
};
