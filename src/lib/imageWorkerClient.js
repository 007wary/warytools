"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { replies } from "./pdfWorkerProtocol";

// Main-thread side of the image worker. Mirrors pdfWorkerClient.js — same
// lifecycle guarantees, same id-routing — but kept separate so the two
// workers stay independently bundled: a visitor on an image tool shouldn't
// download pdf-lib, and vice versa.

class ImageWorkerHandle {
  constructor() {
    this.worker = null;
    this.pending = new Map();
    this.nextId = 0;
  }

  ensureWorker() {
    if (this.worker) return this.worker;

    // The new URL(..., import.meta.url) form is what lets the bundler find
    // and compile the worker. A string path works in dev and 404s in prod.
    this.worker = new Worker(new URL("../workers/image.worker.js", import.meta.url), {
      type: "module",
    });

    this.worker.onmessage = (event) => this.handleMessage(event.data);
    this.worker.onerror = () => {
      this.failAll("The image engine stopped unexpectedly. Please reload the page and try again.");
    };

    return this.worker;
  }

  handleMessage(message) {
    const entry = this.pending.get(message.id);
    if (!entry) return;

    if (message.type === replies.PROGRESS) {
      entry.onProgress?.(message);
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

  run(payload, { onProgress } = {}) {
    const worker = this.ensureWorker();
    const id = `img-${this.nextId++}`;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress });
      // Blobs are structured-cloneable by reference, so a batch of large
      // files costs nothing to hand over — the bytes aren't copied.
      worker.postMessage({ id, payload });
    });
  }

  destroy() {
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
  }
}

/**
 * React binding for the image worker.
 *
 * Returns `{ run, cancel, progress, isRunning }`.
 */
export function useImageWorker() {
  const handleRef = useRef(null);
  const mountedRef = useRef(true);
  const [progress, setProgress] = useState(null);
  const [isRunning, setIsRunning] = useState(false);

  if (handleRef.current === null) handleRef.current = new ImageWorkerHandle();

  useEffect(() => {
    mountedRef.current = true;
    const handle = handleRef.current;
    return () => {
      mountedRef.current = false;
      handle.destroy();
    };
  }, []);

  const run = useCallback(async (payload, options = {}) => {
    const handle = handleRef.current;

    if (mountedRef.current) {
      setIsRunning(true);
      setProgress(null);
    }

    try {
      return await handle.run(payload, {
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

  const cancel = useCallback(() => {
    handleRef.current.destroy();
    if (mountedRef.current) {
      setIsRunning(false);
      setProgress(null);
    }
  }, []);

  return { run, cancel, progress, isRunning };
}
