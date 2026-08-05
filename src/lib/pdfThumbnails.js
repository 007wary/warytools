"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { canvasToBlob } from "./imageFile";

// Page-thumbnail rendering for the Reorder and Rotate tools.
//
// The previous implementation rendered every page up front, serially, before
// showing anything. On a 300-page document that meant 300 canvases and 300
// PNG blobs held in memory at once, several seconds of blank screen, and — if
// the user picked a different file midway — a second render loop racing the
// first, with both writing into the same state and leaking each other's blobs.
//
// This renders on demand as pages scroll into view, caps how many bitmaps
// stay resident, and ties every loop to a generation token so a superseded
// run stops on its next iteration and cleans up after itself.

// pdf.js keeps its own cache per document; rendering wider than the grid cell
// only costs memory. 2x the ~150px cell keeps thumbnails crisp on retina
// screens without paying for full-page bitmaps.
const THUMBNAIL_WIDTH = 300;

/**
 * Loads a PDF for rendering and exposes lazily-rendered page thumbnails.
 *
 * @param {ArrayBuffer|null} bytes Document bytes, or null to tear down.
 * @returns {{pageCount: number, getThumbnail: Function, isReady: boolean, error: string}}
 */
export function usePdfThumbnails(bytes) {
  const [pageCount, setPageCount] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState("");
  // Bumped to force a re-render when a thumbnail finishes, since the cache
  // itself lives in a ref (mutating it wouldn't schedule a render).
  const [, setVersion] = useState(0);

  const docRef = useRef(null);
  const urlsRef = useRef(new Map());
  const pendingRef = useRef(new Set());
  // Incremented on every new document. Async work captures the value it
  // started with and aborts as soon as it no longer matches — this is what
  // stops a superseded file's render loop from writing stale thumbnails.
  const generationRef = useRef(0);
  const mountedRef = useRef(true);

  const releaseAll = useCallback(() => {
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    urlsRef.current.clear();
    pendingRef.current.clear();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const generation = ++generationRef.current;

    releaseAll();

    if (!bytes) {
      docRef.current?.destroy?.();
      docRef.current = null;
      return undefined;
    }

    let cancelled = false;

    (async () => {
      // Reset inside the async body rather than synchronously in the effect:
      // a synchronous setState here forces a cascading re-render pass before
      // the load even starts. Everything downstream keys off `isReady`, so
      // clearing it a microtask later is invisible.
      if (mountedRef.current) {
        setPageCount(0);
        setIsReady(false);
        setError("");
      }

      try {
        const pdfjsLib = (await import("./pdfjs")).default;
        // pdf.js takes ownership of the buffer it's handed, so it gets a copy
        // and the caller keeps its original for pdf-lib to use.
        const doc = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;

        if (cancelled || generationRef.current !== generation) {
          doc.destroy();
          return;
        }

        docRef.current?.destroy?.();
        docRef.current = doc;

        if (mountedRef.current) {
          setPageCount(doc.numPages);
          setIsReady(true);
        }
      } catch (err) {
        if (cancelled || generationRef.current !== generation) return;
        console.error(err);
        if (mountedRef.current) {
          setError("Could not render this PDF's pages. It may be damaged or too large.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bytes, releaseAll]);

  // Destroying the pdf.js document releases its worker-side page cache, which
  // is where the bulk of a large document's memory actually sits.
  useEffect(() => {
    return () => {
      releaseAll();
      docRef.current?.destroy?.();
      docRef.current = null;
    };
  }, [releaseAll]);

  /**
   * Returns a thumbnail URL for a page, rendering it on first request.
   *
   * @param {number} pageNumber 1-based.
   * @returns {string|null} Null while the render is still in flight.
   */
  const getThumbnail = useCallback((pageNumber) => {
    const cached = urlsRef.current.get(pageNumber);
    if (cached) return cached;

    // Guard against re-entering for a page already being rendered: scroll
    // events fire far faster than a render completes, and without this a
    // single page could be queued dozens of times.
    if (pendingRef.current.has(pageNumber)) return null;
    if (!docRef.current) return null;

    pendingRef.current.add(pageNumber);
    const generation = generationRef.current;

    (async () => {
      try {
        const doc = docRef.current;
        const page = await doc.getPage(pageNumber);
        if (generationRef.current !== generation) return;

        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: THUMBNAIL_WIDTH / base.width });

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));

        await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        if (generationRef.current !== generation) return;

        // canvasToBlob rejects on a null blob rather than letting
        // URL.createObjectURL(null) throw — encoding fails on very large
        // pages, which is exactly when the raw callback returns null.
        const blob = await canvasToBlob(canvas, "image/webp", 0.8);

        // Release the canvas explicitly. Safari in particular holds onto
        // detached canvas backing stores far longer than GC would suggest,
        // and at 300 pages that is the difference between working and not.
        canvas.width = 0;
        canvas.height = 0;

        if (generationRef.current !== generation || !mountedRef.current) return;

        urlsRef.current.set(pageNumber, URL.createObjectURL(blob));
        setVersion((v) => v + 1);
      } catch (err) {
        console.error(err);
      } finally {
        pendingRef.current.delete(pageNumber);
      }
    })();

    return null;
  }, []);

  return { pageCount, getThumbnail, isReady, error };
}

/**
 * Reports whether an element is near the viewport, so a thumbnail is only
 * rendered when it's about to be seen.
 *
 * A 400px root margin starts the render just before the page scrolls in, so
 * the placeholder is rarely visible, without rendering the whole document.
 */
export function useNearViewport(ref, rootMargin = "400px") {
  // Lazy initialiser rather than an effect: with no IntersectionObserver
  // (very old browsers, some embedded webviews) every page renders eagerly —
  // degraded, but working, which beats a grid of empty boxes. Deciding that
  // at mount avoids a render pass that reports "not near" and immediately
  // corrects itself.
  const [isNear, setIsNear] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        // Latches on rather than toggling: once rendered, the thumbnail is
        // cached, so un-setting this on scroll-out would only cause the image
        // to be torn down and re-attached for no benefit.
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsNear(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, rootMargin]);

  return isNear;
}
