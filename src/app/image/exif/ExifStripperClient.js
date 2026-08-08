"use client";

import { useCallback, useRef, useState } from "react";
import { ShieldCheck, MapPin, Camera, X } from "lucide-react";
import FileDropzone from "@/components/FileDropzone";
import DownloadButton from "@/components/DownloadButton";
import ProgressBar from "@/components/ProgressBar";
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

// Only the file's head is read to produce the report. Metadata lives at the
// front of both formats — JPEG puts its APPn segments before the scan data,
// PNG puts its ancillary chunks before IDAT — so a scan never needs the whole
// file. 256 KB comfortably covers even a large embedded thumbnail or ICC
// profile, and means dropping fifty 40 MB photos reads 12 MB, not 2 GB.
const SCAN_BYTES = 256 * 1024;

export default function ExifStripperClient() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [keepColourProfile, setKeepColourProfile] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [progress, setProgress] = useState(null);

  const zipRef = useRef(null);

  // NOTHING holds a whole file. A row keeps the File handle (a reference to
  // disk, not bytes) plus the few hundred bytes of its scan report; the full
  // bytes are read on demand in handleStrip and released when it returns.
  //
  // The first version retained every file's bytes for the lifetime of its row,
  // which forced a 30-file cap to stop a large batch exhausting the tab — and
  // was worse than it looked, because stripMetadata allocates a second
  // full-size output buffer, so a stripped file sat in memory twice. Reading
  // from a File is cheap and the handle stays valid, so there is no reason to
  // pay that. There is now no file-count cap at all.
  const addFiles = useCallback(async (fileList) => {
    setError("");
    setNotice("");

    const { accepted, rejected } = await validateImageFiles(fileList);

    if (accepted.length === 0) {
      setError(
        rejected.length > 0 ? describeImageRejections(rejected) : "Please choose an image file."
      );
      return;
    }

    if (rejected.length > 0) setNotice(describeImageRejections(rejected));

    const scanned = await Promise.all(
      accepted.map(async ({ file, type }) => {
        // Read only the head. `slice` past the end of a file is not an error —
        // it just yields fewer bytes — so small files need no special case.
        const head = new Uint8Array(await file.slice(0, SCAN_BYTES).arrayBuffer());
        // `partial` tells the walker this is a prefix, so a segment running
        // past the window is reported rather than called damage. Without it a
        // photo whose EXIF is bigger than the window — routine, once an
        // embedded thumbnail is involved — told the user their valid file was
        // corrupt.
        const found = findMetadata(head, type, { partial: true });

        return {
          id: nextId++,
          file,
          type,
          // A file we can't parse is kept in the list with its reason shown
          // rather than dropped: "nothing happened" is indistinguishable
          // from a broken tool, and the user chose this file deliberately.
          ok: found.ok,
          reason: found.ok ? "" : found.error,
          // Ranges are offsets into the head, which for the report's purposes
          // (kind and size per segment) are the same offsets they'd have in
          // the whole file — the head starts at byte 0. The strip re-walks the
          // full bytes rather than reusing these, so a segment that ran past
          // SCAN_BYTES is still removed correctly.
          segments: found.ok ? found.segments : [],
          gps: found.ok ? hasGpsData(head, found.segments) : false,
          result: null,
        };
      })
    );

    // Appended with a functional update rather than read-then-write. The
    // previous version computed remaining capacity from a closed-over
    // items.length, so two drops in quick succession both saw the old count.
    setItems((prev) => [...prev, ...scanned]);
  }, []);

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
    setProgress({ ratio: 0, completed: 0, total: items.length });
    setError("");

    try {
      // Sequential, not Promise.all. Each iteration holds one source buffer
      // plus one output buffer, and both fall out of scope before the next
      // file is read — so peak memory is two files regardless of batch size.
      // Reading fifty in parallel would hold all hundred at once, which is
      // the exact problem the old file cap existed to paper over.
      const next = [];
      let failures = 0;
      let done = 0;

      for (const item of items) {
        if (!item.ok || item.segments.length === 0) {
          next.push(item);
          done += 1;
          continue;
        }

        try {
          const bytes = new Uint8Array(await item.file.arrayBuffer());
          const result = stripMetadata(bytes, item.type, { keepColourProfile });

          if (!result.ok) {
            failures += 1;
            next.push({ ...item, ok: false, reason: result.error, result: null });
          } else {
            next.push({ ...item, result });
          }
        } catch {
          // One unreadable file must not lose the rest of the batch. A file
          // can genuinely vanish between the drop and the click — moved,
          // deleted, or an unmounted drive — and the handle goes stale.
          failures += 1;
          next.push({
            ...item,
            ok: false,
            reason: "Could not read this file again. It may have been moved or deleted.",
            result: null,
          });
        }

        // The splice itself is synchronous and CPU-bound. Without a progress
        // report the bar would jump from 0 to 100, and without the await on
        // the file read above the loop would never yield at all — the same
        // frozen-tab problem the PDF tools moved to a worker to solve. Here
        // the read is genuinely async, so the paint happens for free.
        done += 1;
        setProgress({ ratio: done / items.length, completed: done, total: items.length });
      }

      // Merged by id rather than assigned wholesale. The loop above awaits, so
      // the list can change under it — a row removed mid-run would otherwise
      // be resurrected by this write, and a file added mid-run would vanish.
      // Rows the run didn't touch keep whatever they became.
      const byId = new Map(next.map((item) => [item.id, item]));
      setItems((prev) => prev.map((item) => byId.get(item.id) || item));

      const cleaned = next.filter((item) => item.result);
      if (failures > 0) {
        setNotice(
          failures === 1
            ? "One image could not be processed — see the list above."
            : `${failures} images could not be processed — see the list above.`
        );
      }

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

          {isWorking && <ProgressBar progress={progress} label="Removing metadata" />}

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
