"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { colors } from "@/lib/theme";
import {
  DRAW_CAPTURE_SCALE,
  DRAW_STROKE_WIDTH,
  strokeToPath,
  strokeBounds,
} from "@/lib/pdfSignature";

// A pad for drawing a signature with a pointer, finger, or stylus.
//
// Strokes are held as arrays of points and rendered as SVG rather than drawn
// straight onto a canvas. That is what makes the pad resolution-independent: the
// same point data is re-rendered crisply at any preview size, and — more
// importantly — is rasterised at DRAW_CAPTURE_SCALE on export rather than at
// whatever size the pad happened to be on screen. Drawing directly to a canvas
// would fix the signature at the pad's CSS pixel size, which lands on the page at
// roughly 90 DPI: visibly soft, and worse once printed.
//
// Pointer Events with setPointerCapture, for the same load-bearing reasons as
// CropOverlay and SignaturePlacementLayer: a stroke that leaves the pad still
// tracks (rather than ending mid-letter), and touch and stylus work for free.

export default function SignaturePad({ strokes, onChange, colorHex, disabled = false }) {
  const surfaceRef = useRef(null);
  const drawingRef = useRef(false);
  // The in-progress stroke is STATE, not a ref, because it is rendered — the
  // line has to appear under the pointer as it is drawn. Holding it in a ref and
  // forcing a render would show whatever the ref happened to contain at paint
  // time, which React explicitly does not guarantee to be current.
  //
  // Pointer events already fire at most once per frame (the browser coalesces
  // them), so a state update per point is not the flood it looks like, and
  // React 19 batches within an event handler anyway.
  const [current, setCurrent] = useState([]);

  // The pad's own coordinate space, fixed rather than tied to the rendered size.
  // Points are stored in these units so a pad that reflows (a phone rotating,
  // the layout resizing) doesn't change what was already drawn.
  const VIEW_WIDTH = 600;
  const VIEW_HEIGHT = 200;

  const pointFrom = useCallback((event) => {
    const element = surfaceRef.current;
    if (!element) return null;

    // Read live rather than cached at stroke start: the pad can reflow mid-stroke
    // and a stale rect maps the pointer to the wrong place from then on.
    const bounds = element.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return null;

    return {
      x: ((event.clientX - bounds.left) / bounds.width) * VIEW_WIDTH,
      y: ((event.clientY - bounds.top) / bounds.height) * VIEW_HEIGHT,
    };
  }, []);

  const handlePointerDown = useCallback(
    (event) => {
      if (disabled) return;
      event.preventDefault();

      const point = pointFrom(event);
      if (!point) return;

      event.currentTarget.setPointerCapture?.(event.pointerId);
      drawingRef.current = true;
      setCurrent([point]);
    },
    [disabled, pointFrom]
  );

  const handlePointerMove = useCallback(
    (event) => {
      if (!drawingRef.current || disabled) return;

      const point = pointFrom(event);
      if (!point) return;

      setCurrent((points) => {
        const last = points[points.length - 1];

        // Points closer than this add nothing visible but multiply the path
        // length and the work done smoothing it — a slow deliberate signature
        // can emit hundreds of near-identical samples otherwise. Returning the
        // same array reference makes React skip the re-render entirely.
        if (last && Math.hypot(point.x - last.x, point.y - last.y) < 1) return points;

        return [...points, point];
      });
    },
    [disabled, pointFrom]
  );

  const endStroke = useCallback(
    (event) => {
      if (!drawingRef.current) return;

      event?.currentTarget?.releasePointerCapture?.(event.pointerId);
      drawingRef.current = false;

      // Committed from `current` rather than from inside a state updater: an
      // updater must be pure, and React invokes it twice in StrictMode — calling
      // onChange in there would append the stroke twice in development.
      //
      // `current` is safe to read here because pointer events are dispatched one
      // at a time: a pointermove and this pointerup cannot be in the same batch,
      // so the last point is already committed by the time this runs.
      if (current.length > 0) onChange([...strokes, current]);
      setCurrent([]);
    },
    [onChange, strokes, current]
  );

  // Serialised once per completed stroke, not once per pointermove.
  //
  // A stroke is immutable the moment it is committed, but the render below used
  // to rebuild `[...strokes, current]` and call strokeToPath on every element of
  // it — so each move event re-walked every point of every finished stroke to
  // produce a string identical to the one it produced a frame earlier. That is
  // quadratic in the size of the signature: a ten-stroke autograph of ~150
  // points per stroke re-serialises ~1500 points on each of the hundreds of
  // move events a single stroke emits, all of it discarded. Only the in-
  // progress stroke's path actually changes between frames, so only it is
  // rebuilt live.
  //
  // Keyed on `strokes` identity, which is safe because onChange always hands
  // back a new array (`[...strokes, current]` in endStroke) rather than pushing
  // into the existing one — an in-place mutation would leave this memo stale
  // and the last stroke would not appear until some other render forced it.
  const committedPaths = useMemo(
    () => strokes.filter((stroke) => stroke.length > 0).map(strokeToPath),
    [strokes]
  );

  const isEmpty = strokes.length === 0 && current.length === 0;

  return (
    <div>
      <div
        ref={surfaceRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: `${VIEW_WIDTH} / ${VIEW_HEIGHT}`,
          border: `1px solid ${colors.borderInput}`,
          borderRadius: "10px",
          backgroundColor: colors.surface,
          // Without this a touchscreen pans the page instead of drawing.
          touchAction: "none",
          userSelect: "none",
          cursor: disabled ? "default" : "crosshair",
          overflow: "hidden",
        }}
      >
        <svg
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          aria-hidden="true"
        >
          {/* The signing line, drawn faintly. People sign ON a line — without one
              the pad invites a signature floating in the middle of the box, which
              then sits oddly when placed against a document's own line. */}
          <line
            x1={VIEW_WIDTH * 0.06}
            y1={VIEW_HEIGHT * 0.72}
            x2={VIEW_WIDTH * 0.94}
            y2={VIEW_HEIGHT * 0.72}
            stroke={colors.border}
            strokeWidth="1"
          />

          {/* Committed strokes first, from the memo above, then the live one.
              Rendered as two lists rather than one `[...strokes, current]` map
              so the finished paths keep their element identity as the in-
              progress stroke grows — a single list re-creates every <path> on
              each pointermove even when only the last one's `d` changed. */}
          {committedPaths.map((d, index) => (
            <path
              key={index}
              d={d}
              fill="none"
              stroke={colorHex}
              strokeWidth={DRAW_STROKE_WIDTH}
              // Round caps and joins are what make the line read as ink rather
              // than as a series of connected rectangles, and a round cap is
              // also what renders a single-point tap as a visible dot.
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {current.length > 0 && (
            <path
              d={strokeToPath(current)}
              fill="none"
              stroke={colorHex}
              strokeWidth={DRAW_STROKE_WIDTH}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>

        {isEmpty && (
          <span
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "14px",
              color: colors.textFaint,
              pointerEvents: "none",
            }}
          >
            Draw your signature here
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Rasterises drawn strokes into a PNG blob, cropped to the ink.
 *
 * Exported as a plain function rather than a method on the pad so the client can
 * call it at export time without reaching into the component. Three details here
 * decide whether the result is usable:
 *
 *   - **Cropped to strokeBounds()**, so a signature scrawled in a corner of the
 *     pad doesn't embed as a mostly-empty box — which would make the visible ink
 *     a fraction of the size the user asked for, with nothing to explain it.
 *   - **Captured at DRAW_CAPTURE_SCALE**, not at the pad's on-screen size, so the
 *     embedded image has enough pixels to stay crisp when printed.
 *   - **PNG, never JPG.** A signature needs a transparent background: flattened
 *     onto white it covers the document's own signature line and any text it
 *     overlaps, which on a form is exactly where it gets placed.
 *
 * @param {{x: number, y: number}[][]} strokes
 * @param {string} colorHex
 * @returns {Promise<{blob: Blob, width: number, height: number} | null>}
 */
export async function rasterizeStrokes(strokes, colorHex) {
  const bounds = strokeBounds(strokes, DRAW_STROKE_WIDTH);
  if (!bounds) return null;

  const width = Math.max(1, Math.round(bounds.width * DRAW_CAPTURE_SCALE));
  const height = Math.max(1, Math.round(bounds.height * DRAW_CAPTURE_SCALE));

  const canvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement("canvas"), { width, height });

  const context = canvas.getContext("2d");
  if (!context) return null;

  // Left transparent deliberately — no fillRect. See the PNG note above.
  context.scale(DRAW_CAPTURE_SCALE, DRAW_CAPTURE_SCALE);
  context.translate(-bounds.x, -bounds.y);
  context.strokeStyle = colorHex;
  context.lineWidth = DRAW_STROKE_WIDTH;
  context.lineCap = "round";
  context.lineJoin = "round";

  for (const stroke of strokes) {
    if (stroke.length === 0) continue;

    context.beginPath();

    if (stroke.length === 1) {
      // A deliberate tap. Drawn as a zero-length line, which the round cap
      // renders as a dot — moveTo alone would draw nothing at all.
      context.moveTo(stroke[0].x, stroke[0].y);
      context.lineTo(stroke[0].x, stroke[0].y);
    } else {
      // The same midpoint-quadratic smoothing strokeToPath() uses for the
      // preview, so the exported image matches what was drawn on screen rather
      // than being a straight-line approximation of it.
      context.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length - 1; i++) {
        const current = stroke[i];
        const next = stroke[i + 1];
        context.quadraticCurveTo(
          current.x,
          current.y,
          (current.x + next.x) / 2,
          (current.y + next.y) / 2
        );
      }
      const last = stroke[stroke.length - 1];
      context.lineTo(last.x, last.y);
    }

    context.stroke();
  }

  const blob = canvas.convertToBlob
    ? await canvas.convertToBlob({ type: "image/png" })
    : await new Promise((resolve, reject) => {
        canvas.toBlob(
          // The raw callback yields null when encoding fails, and
          // URL.createObjectURL(null) throws — so a real error is raised here
          // instead, the same rule canvasToBlob() exists for.
          (result) => (result ? resolve(result) : reject(new Error("Could not save the signature."))),
          "image/png"
        );
      });

  return { blob, width, height };
}
