"use client";

import { useCallback, useId, useRef, useState } from "react";
import { ArrowUp, ArrowDown, X, GripVertical, Merge } from "lucide-react";
import FileDropzone from "@/components/FileDropzone";
import DownloadButton from "@/components/DownloadButton";
import ProgressBar from "@/components/ProgressBar";
import ErrorBanner from "@/components/ErrorBanner";
import { PrimaryButton, SecondaryButton, iconButtonStyle } from "@/components/ToolButton";
import { colors } from "@/lib/theme";
import { formatBytes } from "@/lib/formatBytes";
import { validatePdfFiles, describeRejections, describePdfError } from "@/lib/pdfFile";
import { usePdfWorker, ops, isCancellation } from "@/lib/pdfWorkerClient";
import { events, trackEvent } from "@/lib/analytics";

export default function MergePdfClient() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mergedBlob, setMergedBlob] = useState(null);

  const { run, cancel, progress, isRunning } = usePdfWorker();

  // Ids are per-instance rather than module-global. A module-level counter is
  // shared by every mount in the tab, so ids kept climbing across navigations
  // and two components could never be reasoned about independently.
  const nextId = useRef(0);
  const dragIndex = useRef(null);
  const listLabelId = useId();

  const clearResult = useCallback(() => setMergedBlob(null), []);

  async function handleFiles(fileList) {
    setError("");
    setNotice("");
    clearResult();

    // Validated by magic bytes, not File.type — several platforms report an
    // empty type for a perfectly good PDF, and the old check rejected those.
    const { accepted, rejected } = await validatePdfFiles(fileList);

    if (accepted.length === 0) {
      setError(
        rejected.length > 0
          ? describeRejections(rejected)
          : "Please choose PDF files to merge."
      );
      return;
    }

    // Partial acceptance: keep the good files and say what was skipped,
    // rather than discarding the whole drop over one bad item.
    if (rejected.length > 0) setNotice(describeRejections(rejected));

    setItems((prev) => [
      ...prev,
      ...accepted.map((file) => ({ id: nextId.current++, file })),
    ]);
  }

  function removeItem(id) {
    clearResult();
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  function moveItem(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    clearResult();
    setItems((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function reorder(from, to) {
    if (from === to || from == null || to == null) return;
    clearResult();
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  async function handleMerge() {
    if (items.length < 2) {
      setError("Add at least two PDF files to merge.");
      return;
    }

    setError("");
    clearResult();

    try {
      // The File handles cross the boundary, not their bytes. A File is
      // cloneable by reference — the browser passes the underlying blob handle
      // without copying the data — so the worker reads each one as it reaches
      // it and drops it again. Reading all of them here first (the previous
      // Promise.all) meant every file was fully in memory before the merge even
      // started, on top of the parsed documents the worker then built from
      // them, which is the same "decode everything at once" trap the image
      // worker sequences its batch to avoid.
      const result = await run(ops.MERGE, { files: items.map((item) => item.file) });

      setMergedBlob(new Blob([result.bytes], { type: "application/pdf" }));
      trackEvent(events.TOOL_RUN, {
        file_count: items.length,
        page_count: result.pageCount,
      });
    } catch (err) {
      // A cancel is the user's own action, not a failure — reporting it as an
      // error banner contradicts the button they just pressed.
      if (isCancellation(err)) return;
      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "merge_failed" });
      setError(
        describePdfError(err, "Could not merge these PDFs. One of them may be damaged.")
      );
    }
  }

  function handleClearAll() {
    setItems([]);
    clearResult();
    setError("");
    setNotice("");
  }

  const totalBytes = items.reduce((sum, item) => sum + item.file.size, 0);

  return (
    <div>
      <FileDropzone
        onFiles={handleFiles}
        accept="application/pdf,.pdf"
        multiple
        label="Drag & drop PDF files here, or click to browse"
      />

      <ErrorBanner>{error}</ErrorBanner>

      {notice && (
        <p
          role="status"
          style={{ fontSize: "13px", color: colors.warningText, marginTop: "12px" }}
        >
          {notice}
        </p>
      )}

      {items.length > 0 && (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              flexWrap: "wrap",
              margin: "24px 0 10px",
            }}
          >
            <span id={listLabelId} style={{ fontSize: "14px", fontWeight: 600, color: colors.text }}>
              {items.length} file{items.length === 1 ? "" : "s"} · {formatBytes(totalBytes)}
            </span>
            <SecondaryButton onClick={handleClearAll} disabled={isRunning}>
              Clear all
            </SecondaryButton>
          </div>

          <p style={{ fontSize: "13px", color: colors.textFaint, margin: "0 0 12px" }}>
            Pages are combined top to bottom. Drag a row to reorder, or use the arrow buttons.
          </p>

          <ul
            aria-labelledby={listLabelId}
            style={{ listStyle: "none", padding: 0, margin: 0 }}
          >
            {items.map((item, index) => (
              <li
                key={item.id}
                draggable={!isRunning}
                onDragStart={() => {
                  dragIndex.current = index;
                }}
                onDragOver={(e) => e.preventDefault()}
                // Reordering on drop rather than on dragover. The old code
                // mutated the list on every dragover event, so the row moved
                // out from under the cursor mid-drag and the list flickered
                // through intermediate orders the user never asked for.
                onDrop={(e) => {
                  e.preventDefault();
                  reorder(dragIndex.current, index);
                  dragIndex.current = null;
                }}
                onDragEnd={() => {
                  dragIndex.current = null;
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  border: `1px solid ${colors.border}`,
                  borderRadius: "10px",
                  padding: "10px 12px",
                  marginBottom: "8px",
                  backgroundColor: colors.surface,
                  cursor: isRunning ? "default" : "grab",
                }}
              >
                <GripVertical
                  size={16}
                  style={{ color: colors.textFaint, flexShrink: 0 }}
                  aria-hidden="true"
                />
                <span
                  style={{
                    fontSize: "13px",
                    color: colors.textFaint,
                    width: "20px",
                    flexShrink: 0,
                  }}
                >
                  {index + 1}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: "14px",
                      color: colors.textSecondary,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.file.name}
                  </span>
                  <span style={{ display: "block", fontSize: "12px", color: colors.textFaint }}>
                    {formatBytes(item.file.size)}
                  </span>
                </span>

                <button
                  onClick={() => moveItem(index, -1)}
                  disabled={index === 0 || isRunning}
                  style={iconButtonStyle(index === 0 || isRunning)}
                  aria-label={`Move ${item.file.name} up`}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  onClick={() => moveItem(index, 1)}
                  disabled={index === items.length - 1 || isRunning}
                  style={iconButtonStyle(index === items.length - 1 || isRunning)}
                  aria-label={`Move ${item.file.name} down`}
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  onClick={() => removeItem(item.id)}
                  disabled={isRunning}
                  style={iconButtonStyle(isRunning, colors.danger)}
                  aria-label={`Remove ${item.file.name}`}
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {isRunning && <ProgressBar progress={progress} />}

      <div style={{ display: "flex", gap: "12px", marginTop: "20px", flexWrap: "wrap" }}>
        <PrimaryButton onClick={handleMerge} disabled={items.length < 2 || isRunning}>
          <Merge size={16} />
          {isRunning ? "Merging…" : "Merge PDFs"}
        </PrimaryButton>

        {/* Cancel is only meaningful while work is in flight, and it's the
            reason the worker exists — on the main thread this button could
            not have been clicked. */}
        {isRunning && <SecondaryButton onClick={cancel}>Cancel</SecondaryButton>}

        {mergedBlob && !isRunning && (
          <DownloadButton getBlob={() => mergedBlob} filename="merged.pdf">
            Download merged.pdf
          </DownloadButton>
        )}
      </div>
    </div>
  );
}
