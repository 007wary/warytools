"use client";

import { useCallback, useRef, useState } from "react";
import { ShieldCheck, MapPin, Camera, X } from "lucide-react";
import FileDropzone from "@/components/FileDropzone";
import DownloadButton from "@/components/DownloadButton";
import ErrorBanner from "@/components/ErrorBanner";
import { PrimaryButton, SecondaryButton, iconButtonStyle } from "@/components/ToolButton";
import { validateImageFiles, describeImageRejections } from "@/lib/imageValidation";
import {
  findMetadata,
  stripMetadata,
  summarizeMetadata,
  hasGpsData,
} from "@/lib/imageMetadata";
import { formatBytes } from "@/lib/formatBytes";
import { events, trackEvent } from "@/lib/analytics";
import { colors } from "@/lib/theme";

// This tool deliberately does NOT use useImageBatch or the image worker.
//
// Both exist to keep a decode/encode off the main thread, and this tool does
// neither — it edits the file container and copies the compressed image data
// through untouched (see imageMetadata.js for why that matters). Reading a few
// hundred bytes of header and splicing an array is microseconds of work, so
// routing it through a worker would add a message round trip and a whole
// second copy of every file for no gain.
//
// The consequence is that the scan happens on drop, not on a button press: the
// report *is* the product here, and making someone click "Scan" before seeing
// that their photo carries GPS coordinates would bury the entire point.

let nextId = 0;

const MAX_FILES = 30;

export default function ExifStripperClient() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [keepColourProfile, setKeepColourProfile] = useState(true);
  const [isWorking, setIsWorking] = useState(false);

  const zipRef = useRef(null);

  // Every accepted file's bytes are held for the lifetime of the row so the
  // strip doesn't have to re-read from disk. Capped by MAX_FILES above,
  // because unlike the other image tools nothing here streams — a hundred
  // 40 MB photos would sit in memory at once.
  const addFiles = useCallback(
    async (fileList) => {
      setError("");
      setNotice("");

      const { accepted, rejected } = await validateImageFiles(fileList);

      if (accepted.length === 0) {
        setError(
          rejected.length > 0 ? describeImageRejections(rejected) : "Please choose an image file."
        );
        return;
      }

      const notices = [];
      if (rejected.length > 0) notices.push(describeImageRejections(rejected));

      let room = MAX_FILES - items.length;
      if (room <= 0) {
        setError(`You can scan ${MAX_FILES} images at a time. Remove some first.`);
        return;
      }

      const taking = accepted.slice(0, room);
      if (taking.length < accepted.length) {
        notices.push(`Only the first ${MAX_FILES} images were added.`);
      }

      const scanned = await Promise.all(
        taking.map(async ({ file, type }) => {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const found = findMetadata(bytes, type);

          return {
            id: nextId++,
            file,
            type,
            bytes,
            // A file we can't parse is kept in the list with its reason shown
            // rather than dropped: "nothing happened" is indistinguishable
            // from a broken tool, and the user chose this file deliberately.
            ok: found.ok,
            reason: found.ok ? "" : found.error,
            segments: found.ok ? found.segments : [],
            gps: found.ok ? hasGpsData(bytes, found.segments) : false,
            result: null,
          };
        })
      );

      if (notices.length > 0) setNotice(notices.join(" "));
      setItems((prev) => [...prev, ...scanned]);
    },
    [items.length]
  );

  const removeItem = useCallback((id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
    setError("");
    setNotice("");
  }, []);

  // Changing the colour-profile option invalidates any completed strip: the
  // download button must never hand over a file built under a setting the
  // screen no longer shows.
  function toggleColourProfile(next) {
    setKeepColourProfile(next);
    setItems((prev) => prev.map((item) => ({ ...item, result: null })));
  }

  async function handleStrip() {
    setIsWorking(true);
    setError("");

    try {
      const next = items.map((item) => {
        if (!item.ok) return item;
        const result = stripMetadata(item.bytes, item.type, { keepColourProfile });
        if (!result.ok) return { ...item, ok: false, reason: result.error, result: null };
        return { ...item, result };
      });

      setItems(next);

      const cleaned = next.filter((item) => item.result);
      trackEvent(events.TOOL_RUN, {
        file_count: items.length,
        succeeded: cleaned.length,
        kept_colour_profile: keepColourProfile,
      });
    } catch (err) {
      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "image_exif_failed" });
      setError("Could not remove metadata from these images.");
    } finally {
      setIsWorking(false);
    }
  }

  const buildZip = useCallback(async () => {
    if (!zipRef.current) {
      zipRef.current = (await import("jszip")).default;
    }
    const JSZip = zipRef.current;
    const zip = new JSZip();

    // Names are deduplicated for the same reason as the other image tools: a
    // batch can legitimately hold two files called IMG_0001.jpg from
    // different folders, and JSZip silently keeps only the last.
    const used = new Map();
    items.forEach((item) => {
      if (!item.result) return;
      const base = item.file.name;
      const seen = used.get(base) || 0;
      used.set(base, seen + 1);
      const name = seen === 0 ? base : base.replace(/(\.[^.]+)$/, `-${seen + 1}$1`);
      zip.file(name, item.result.bytes);
    });

    return zip.generateAsync({ type: "blob" });
  }, [items]);

  const scannable = items.filter((item) => item.ok);
  const withMetadata = scannable.filter((item) => item.segments.length > 0);
  const withGps = scannable.filter((item) => item.gps);
  const cleaned = items.filter((item) => item.result);
  const singleCleaned = items.length === 1 ? items[0].result : null;

  return (
    <div>
      <FileDropzone
        onFiles={addFiles}
        accept="image/jpeg,image/png"
        multiple
        label="Drag & drop JPG or PNG images here, or click to browse"
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
            }}
          >
            <span style={{ fontSize: "14px", fontWeight: 600, color: colors.text }}>
              {items.length} image{items.length === 1 ? "" : "s"}
            </span>
            <SecondaryButton onClick={clearAll} disabled={isWorking}>
              Clear all
            </SecondaryButton>
          </div>

          {/* The headline finding, above the per-file detail. GPS is called out
              on its own because it is categorically different from the rest —
              a lens model is trivia, a location is someone's home address. */}
          {withGps.length > 0 && (
            <div
              role="status"
              style={{
                display: "flex",
                gap: "10px",
                alignItems: "flex-start",
                border: `1px solid ${colors.warningSoftBorder}`,
                backgroundColor: colors.warningSoft,
                borderRadius: "10px",
                padding: "12px 14px",
                marginTop: "16px",
              }}
            >
              <MapPin size={18} style={{ color: colors.warningIcon, flexShrink: 0, marginTop: 1 }} />
              <p style={{ margin: 0, fontSize: "13.5px", color: colors.warningText, lineHeight: 1.5 }}>
                <strong>
                  {withGps.length === 1
                    ? "This image contains GPS coordinates."
                    : `${withGps.length} of these images contain GPS coordinates.`}
                </strong>{" "}
                That&apos;s the exact location the photo was taken — often someone&apos;s home.
                Removing the metadata below deletes it.
              </p>
            </div>
          )}

          {scannable.length > 0 && withMetadata.length === 0 && (
            <p
              role="status"
              style={{ fontSize: "13.5px", color: colors.textMuted, marginTop: "16px" }}
            >
              No metadata found — {items.length === 1 ? "this image is" : "these images are"} already
              clean. Nothing to remove.
            </p>
          )}

          <ul style={{ listStyle: "none", padding: 0, margin: "16px 0 0" }}>
            {items.map((item) => (
              <MetadataRow
                key={item.id}
                item={item}
                onRemove={removeItem}
                disabled={isWorking}
              />
            ))}
          </ul>

          <label
            style={{
              display: "flex",
              gap: "10px",
              alignItems: "flex-start",
              marginTop: "20px",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={keepColourProfile}
              onChange={(e) => toggleColourProfile(e.target.checked)}
              disabled={isWorking}
              style={{ marginTop: "3px", cursor: "pointer" }}
            />
            <span style={{ fontSize: "13.5px", color: colors.textSecondary, lineHeight: 1.5 }}>
              Keep the colour profile
              <span style={{ display: "block", color: colors.textFaint, fontSize: "13px" }}>
                Colour profiles hold no personal information, and removing one can visibly shift
                the colours of a photo. Uncheck only if you want the smallest possible file.
              </span>
            </span>
          </label>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "20px" }}>
            <PrimaryButton onClick={handleStrip} disabled={isWorking || withMetadata.length === 0}>
              <ShieldCheck size={16} />
              {withMetadata.length === 0
                ? "Nothing to remove"
                : `Remove metadata from ${withMetadata.length} image${withMetadata.length === 1 ? "" : "s"}`}
            </PrimaryButton>

            {singleCleaned && (
              <DownloadButton
                getBlob={() => new Blob([singleCleaned.bytes], { type: items[0].type })}
                filename={items[0].file.name}
              >
                Download {items[0].file.name}
              </DownloadButton>
            )}

            {cleaned.length > 1 && (
              <DownloadButton getBlob={buildZip} filename="images-without-metadata.zip">
                Download all ({cleaned.length}) as zip
              </DownloadButton>
            )}
          </div>

          {cleaned.length > 0 && (
            <p style={{ fontSize: "13px", color: colors.textMuted, marginTop: "16px" }}>
              Removed{" "}
              {formatBytes(cleaned.reduce((sum, item) => sum + item.result.bytesRemoved, 0))} of
              metadata. The image itself is untouched — not re-compressed, so there&apos;s no
              quality loss.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function MetadataRow({ item, onRemove, disabled }) {
  const summary = summarizeMetadata(item.segments);
  const done = Boolean(item.result);

  return (
    <li
      style={{
        border: `1px solid ${done ? colors.successSoftBorder : colors.border}`,
        backgroundColor: done ? colors.successSoft : colors.surface,
        borderRadius: "10px",
        padding: "12px 14px",
        marginBottom: "8px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p
            style={{
              margin: 0,
              fontSize: "14px",
              fontWeight: 500,
              color: colors.text,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item.file.name}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: "12.5px", color: colors.textFaint }}>
            {formatBytes(item.file.size)}
            {done && ` → ${formatBytes(item.result.bytes.length)}`}
          </p>
        </div>

        <button
          onClick={() => onRemove(item.id)}
          disabled={disabled}
          aria-label={`Remove ${item.file.name}`}
          style={iconButtonStyle(disabled)}
        >
          <X size={16} />
        </button>
      </div>

      {!item.ok && (
        <p style={{ margin: "8px 0 0", fontSize: "13px", color: colors.warningText }}>
          {item.reason}
        </p>
      )}

      {item.ok && !done && summary.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
          {summary.map((row) => (
            <li
              key={row.kind}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "13px",
                color: colors.textSecondary,
                padding: "3px 0",
              }}
            >
              {row.kind === "exif" ? (
                <Camera size={14} style={{ color: colors.textFaint, flexShrink: 0 }} />
              ) : (
                <span
                  aria-hidden="true"
                  style={{
                    width: "14px",
                    display: "flex",
                    justifyContent: "center",
                    color: colors.textFaint,
                  }}
                >
                  •
                </span>
              )}
              <span>{row.label}</span>
              <span style={{ color: colors.textFaint, fontSize: "12.5px" }}>
                {formatBytes(row.bytes)}
              </span>
            </li>
          ))}
          {item.gps && (
            <li
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "13px",
                fontWeight: 600,
                color: colors.warningText,
                padding: "3px 0",
              }}
            >
              <MapPin size={14} style={{ flexShrink: 0 }} />
              <span>Includes GPS coordinates</span>
            </li>
          )}
        </ul>
      )}

      {item.ok && !done && summary.length === 0 && (
        <p style={{ margin: "8px 0 0", fontSize: "13px", color: colors.textFaint }}>
          No metadata found.
        </p>
      )}

      {done && (
        <p style={{ margin: "8px 0 0", fontSize: "13px", color: colors.textSecondary }}>
          Metadata removed — {formatBytes(item.result.bytesRemoved)} deleted.
        </p>
      )}
    </li>
  );
}
