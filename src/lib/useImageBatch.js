"use client";

import { useCallback, useRef, useState } from "react";
import { validateImageFiles, describeImageRejections, describeImageError } from "./imageValidation";
import { useImageWorker } from "./imageWorkerClient";
import { outputFilename } from "./imageResampling";
import { events, trackEvent } from "./analytics";

// The queue-plus-worker state shared by Compress, Resize and Convert.
//
// All three do the same thing structurally — accept files, validate them, run
// one settings object over the batch, hand back downloadable results — and
// only differ in which settings they expose. Keeping that shape here means a
// fix to the batch semantics lands in all three at once, which is exactly
// what didn't happen when each tool owned its own copy of the logic.

let nextId = 0;

export function useImageBatch({ toolSlug, errorFallback }) {
  const [items, setItems] = useState([]);
  const [results, setResults] = useState(new Map());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const { run, cancel, progress, isRunning } = useImageWorker();
  const zipRef = useRef(null);

  const clearResults = useCallback(() => setResults(new Map()), []);

  const addFiles = useCallback(async (fileList) => {
    setError("");
    setNotice("");
    clearResults();

    // Validated by magic bytes, not File.type — an empty type is normal on
    // several platforms and the old check rejected those files outright.
    const { accepted, rejected } = await validateImageFiles(fileList);

    if (accepted.length === 0) {
      setError(
        rejected.length > 0 ? describeImageRejections(rejected) : "Please choose an image file."
      );
      return [];
    }

    // Partial acceptance: keep the good files and name what was skipped,
    // rather than discarding a twenty-file drop over one HEIC.
    if (rejected.length > 0) setNotice(describeImageRejections(rejected));

    const added = accepted.map(({ file, type }) => ({ id: nextId++, file, type }));
    setItems((prev) => [...prev, ...added]);
    return added;
  }, [clearResults]);

  const removeItem = useCallback((id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    setResults((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
    clearResults();
    setError("");
    setNotice("");
  }, [clearResults]);

  /**
   * Runs the batch through the worker with one shared settings object.
   *
   * @param {object} settings See image.worker.js — mode, format, quality.
   */
  const process = useCallback(
    async (settings) => {
      if (items.length === 0) return;

      setError("");
      clearResults();

      try {
        const response = await run({
          files: items.map((item) => ({ blob: item.file, name: item.file.name })),
          settings,
        });

        // Each output carries the index of the file it came from, so a
        // mid-batch failure can't shift later results onto the wrong source.
        const map = new Map();
        response.outputs.forEach((output) => {
          const item = items[output.index];
          if (item) map.set(item.id, output);
        });

        if (response.failures.length > 0) {
          setNotice(
            response.failures.length === 1
              ? `Could not process "${response.failures[0].name}".`
              : `Could not process ${response.failures.length} of ${items.length} images.`
          );
        }

        setResults(map);

        trackEvent(events.TOOL_RUN, {
          file_count: items.length,
          succeeded: response.outputs.length,
          output_format: settings.format,
          mode: settings.mode,
          quality: settings.quality ? Math.round(settings.quality * 100) : undefined,
        });
      } catch (err) {
        console.error(err);
        trackEvent(events.TOOL_ERROR, { reason: `${toolSlug}_failed` });
        setError(describeImageError(err, errorFallback));
      }
    },
    [items, run, clearResults, toolSlug, errorFallback]
  );

  /**
   * Bundles a multi-file result as a zip.
   *
   * Single results download directly — wrapping one file in a zip just makes
   * the user unpack it for no reason.
   */
  const buildZip = useCallback(async () => {
    if (!zipRef.current) {
      zipRef.current = (await import("jszip")).default;
    }
    const JSZip = zipRef.current;
    const zip = new JSZip();

    // Names are deduplicated: a batch can legitimately contain two files
    // called "IMG_0001.jpg" from different folders, and JSZip would silently
    // keep only the last one.
    const used = new Map();
    items.forEach((item) => {
      const result = results.get(item.id);
      if (!result) return;

      const base = outputFilename(item.file.name, result.type);
      const seen = used.get(base) || 0;
      used.set(base, seen + 1);

      const name = seen === 0 ? base : base.replace(/(\.[^.]+)$/, `-${seen + 1}$1`);
      zip.file(name, result.bytes);
    });

    return zip.generateAsync({ type: "blob" });
  }, [items, results]);

  return {
    items,
    results,
    error,
    notice,
    isRunning,
    progress,
    addFiles,
    removeItem,
    clearAll,
    clearResults,
    process,
    cancel,
    buildZip,
    setError,
  };
}
