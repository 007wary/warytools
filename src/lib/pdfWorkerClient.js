"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ops, replies, createRequest } from "./pdfWorkerProtocol";

// Main-thread side of the PDF worker: owns the Worker instance, turns its
// message stream into promises, and guarantees that a component which
// unmounts mid-operation doesn't leak a worker or resolve into a dead tree.

export { ops };

/**
 * Wraps a Worker so callers can `await run(op, payload)`.
 *
 * One worker is reused for a component's lifetime rather than spawned per
 * operation: worker startup costs a module-graph evaluation (pdf-lib is not
 * small), and paying that on every button press would undo the responsiveness
 * the worker exists to provide.
 */
class PdfWorkerHandle {
  constructor() {
    this.worker = null;
    this.pending = new Map();
    this.nextId = 0;
  }

  ensureWorker() {
    if (this.worker) return this.worker;

    // The `new URL(..., import.meta.url)` form is what lets the bundler find
    // and compile the worker at build time. A string path would work in dev
    // and 404 in production, so this shape is load-bearing.
    this.worker = new Worker(new URL("../workers/pdf.worker.js", import.meta.url), {
      type: "module",
    });

    this.worker.onmessage = (event) => this.handleMessage(event.data);

    // Fires on a worker-level failure (module evaluation, OOM kill). Without
    // this every pending promise would hang forever and the UI would sit on a
    // spinner with no error and no way back.
    this.worker.onerror = () => {
      this.failAll("The PDF engine stopped unexpectedly. Please reload the page and try again.");
    };

    return this.worker;
  }

  handleMessage(message) {
    const entry = this.pending.get(message.id);
    if (!entry) return; // Cancelled or already settled.

    if (message.type === replies.PROGRESS) {
      entry.onProgress?.(message);
      return;
    }

    // A chunk is one finished item from a multi-output op, not the result, so
    // the request stays pending. Consuming it here — rather than collecting
    // chunks into an array to hand over at the end — is the whole point: it
    // lets the caller zip and release each page instead of holding all of them.
    if (message.type === replies.CHUNK) {
      entry.onChunk?.(message);
      return;
    }

    this.pending.delete(message.id);

    if (message.type === replies.ERROR) entry.reject(new Error(message.message));
    else entry.resolve(message);
  }

  failAll(reason) {
    this.pending.forEach((entry) => entry.reject(new Error(reason)));
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
  }

  run(op, payload, { onProgress, onChunk, transfer = [] } = {}) {
    const worker = this.ensureWorker();
    const id = `req-${this.nextId++}`;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress, onChunk });
      worker.postMessage(createRequest(id, op, payload), transfer);
    });
  }

  /**
   * Stops in-flight work, cooperatively where the op supports it.
   *
   * The worker checks a cancel flag between pages, so a long merge/split/
   * watermark stops within one page and the thread stays alive — which matters
   * because terminating throws away the warm module graph, and pdf-lib has to be
   * re-evaluated on the next run. That startup cost is the whole reason one
   * worker is reused for a component's lifetime, so paying it on every Cancel
   * press undoes it.
   *
   * Each pending promise is rejected with a marked error rather than left
   * hanging; callers treat `cancelled` as "say nothing", since the user already
   * knows — they clicked the button.
   *
   * The single-shot ops (compress, rotate, crop, unlock…) have no yield point to
   * check the flag at, so they run to completion inside the worker and their
   * result is discarded on arrival. Nothing is left to clean up either way.
   */
  cancel() {
    const entries = Array.from(this.pending.entries());
    this.pending.clear();

    for (const [id, entry] of entries) {
      this.worker?.postMessage({ type: "cancel", id });
      // Settled, not abandoned. A pending promise that never resolves leaves the
      // caller's `await` hanging forever, so its `finally` never runs and the
      // tool sits on a spinner with the Cancel button it just obeyed still
      // showing. The flag lets callers skip the error banner.
      const error = new Error("cancelled");
      error.cancelled = true;
      entry.reject(error);
    }
  }

  /**
   * Hard-stops in-flight work and releases the thread.
   *
   * Terminate rather than a cooperative cancel because the caller is going away
   * entirely (unmount): there is no next run to keep a warm worker for, and the
   * fastest way to stop burning CPU on a result nobody will read is to kill the
   * thread. The next run() lazily spawns a fresh one.
   */
  destroy() {
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
  }
}

/**
 * React binding for the PDF worker.
 *
 * Returns `{ run, cancel, progress, isRunning }`. Progress is exposed as
 * state so a caller can render a bar without wiring its own listener.
 */
export function usePdfWorker() {
  const handleRef = useRef(null);
  const mountedRef = useRef(true);
  const [progress, setProgress] = useState(null);
  const [isRunning, setIsRunning] = useState(false);

  if (handleRef.current === null) handleRef.current = new PdfWorkerHandle();

  useEffect(() => {
    mountedRef.current = true;
    const handle = handleRef.current;
    return () => {
      mountedRef.current = false;
      handle.destroy();
    };
  }, []);

  const run = useCallback(async (op, payload, options = {}) => {
    const handle = handleRef.current;

    // Guarded on every state write below: an operation that finishes after
    // the user navigates away would otherwise set state on an unmounted tree.
    if (mountedRef.current) {
      setIsRunning(true);
      setProgress(null);
    }

    try {
      return await handle.run(op, payload, {
        ...options,
        onProgress: (update) => {
          if (mountedRef.current) setProgress(update);
          options.onProgress?.(update);
        },
      });
    } finally {
      if (mountedRef.current) {
        setIsRunning(false);
        setProgress(null);
      }
    }
  }, []);

  // Cooperative, not destroy(): the worker stops between pages and stays warm
  // for the next run. run()'s finally clears isRunning when the rejected promise
  // unwinds, so this only has to handle the case where nothing was pending.
  const cancel = useCallback(() => {
    handleRef.current.cancel();
    if (mountedRef.current) {
      setIsRunning(false);
      setProgress(null);
    }
  }, []);

  return { run, cancel, progress, isRunning };
}

/**
 * True when a rejection came from the user pressing Cancel.
 *
 * Cancelling is not a failure, so a catch block that renders every rejection as
 * an error banner tells the user their deliberate action went wrong. Every tool
 * with a Cancel button checks this before setting an error.
 */
export function isCancellation(error) {
  return Boolean(error?.cancelled) || String(error?.message || "") === "cancelled";
}

/**
 * Reads a File into a transferable ArrayBuffer.
 *
 * Every tool needs this before calling the worker, and doing it once per file
 * (rather than per operation, as the old code did) means a user who runs
 * three operations on the same document reads it from disk once.
 */
export async function readFileBytes(file) {
  return file.arrayBuffer();
}
