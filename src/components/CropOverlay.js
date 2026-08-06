"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeRect, applyAspect, translateRect, nudgeRect } from "@/lib/cropGeometry";
import { colors } from "@/lib/theme";

// A draggable crop region over an arbitrary surface.
//
// Deliberately knows nothing about PDFs or images: it renders whatever child
// you give it (a page thumbnail, an <img>, a canvas) and reports a normalised
// rectangle. Crop PDF is the first consumer; Crop Image will be the second,
// which is why the geometry lives in cropGeometry.js and this file holds only
// pointer and keyboard handling.
//
// Two implementation choices worth knowing about:
//
//   - **Pointer Events, not mouse events.** setPointerCapture means a drag that
//     leaves the element still tracks — with mouse events, dragging past the
//     edge silently drops the handle and the rectangle freezes mid-gesture,
//     which is the single most common defect in hand-rolled crop UIs. It also
//     gets touch and stylus for free.
//   - **Geometry is computed from the element's own rect on each move**, not
//     cached at drag start. The preview can reflow (a lazy thumbnail arriving,
//     an orientation change) mid-drag, and a cached rect would map the pointer
//     to the wrong place from then on.

const HANDLES = [
  { id: "nw", x: 0, y: 0, cursor: "nwse-resize", label: "top left" },
  { id: "ne", x: 1, y: 0, cursor: "nesw-resize", label: "top right" },
  { id: "sw", x: 0, y: 1, cursor: "nesw-resize", label: "bottom left" },
  { id: "se", x: 1, y: 1, cursor: "nwse-resize", label: "bottom right" },
];

/**
 * @param {object} props
 * @param {{x: number, y: number, width: number, height: number}} props.rect Normalised.
 * @param {Function} props.onChange Called with a new normalised rect.
 * @param {number|null} props.aspect Width/height in source units, or null.
 * @param {number} props.sourceWidth  True surface width, for aspect maths.
 * @param {number} props.sourceHeight True surface height.
 * @param {boolean} props.disabled
 * @param {string} props.label Accessible name for the region.
 * @param {React.ReactNode} props.children The surface being cropped.
 */
export default function CropOverlay({
  rect,
  onChange,
  aspect = null,
  sourceWidth,
  sourceHeight,
  disabled = false,
  label = "Crop region",
  children,
}) {
  const surfaceRef = useRef(null);
  // What the current gesture is doing. Held in a ref rather than state: it
  // changes on every pointermove and rendering for it would throttle the drag
  // to React's render rate for no visual benefit.
  const dragRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState("");

  const safeRect = normalizeRect(rect);

  /** Converts a pointer event into normalised surface coordinates. */
  const pointToNormalized = useCallback((event) => {
    const element = surfaceRef.current;
    if (!element) return null;

    // Read live rather than from a cached value: the preview can reflow
    // mid-drag and a stale rect maps the pointer to the wrong place.
    const bounds = element.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return null;

    return {
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height,
    };
  }, []);

  const handlePointerDown = useCallback(
    (event, mode, handle) => {
      if (disabled) return;

      event.preventDefault();
      event.stopPropagation();

      const point = pointToNormalized(event);
      if (!point) return;

      // Capture so the gesture survives leaving the element. Without this,
      // dragging past the edge drops the handle and freezes the rectangle.
      event.currentTarget.setPointerCapture?.(event.pointerId);

      dragRef.current = {
        mode,
        handle,
        start: point,
        startRect: safeRect,
        pointerId: event.pointerId,
      };
      setIsDragging(true);
    },
    [disabled, pointToNormalized, safeRect]
  );

  const handlePointerMove = useCallback(
    (event) => {
      const drag = dragRef.current;
      if (!drag || disabled) return;

      const point = pointToNormalized(event);
      if (!point) return;

      if (drag.mode === "move") {
        onChange(
          translateRect(drag.startRect, point.x - drag.start.x, point.y - drag.start.y)
        );
        return;
      }

      if (drag.mode === "new") {
        const next = {
          x: Math.min(drag.start.x, point.x),
          y: Math.min(drag.start.y, point.y),
          width: Math.abs(point.x - drag.start.x),
          height: Math.abs(point.y - drag.start.y),
        };
        onChange(
          aspect
            ? applyAspect(next, aspect, sourceWidth, sourceHeight, drag.start)
            : normalizeRect(next)
        );
        return;
      }

      // Resizing from a handle. The anchor is the opposite corner, so the box
      // grows away from the hand instead of sliding around under it.
      const handle = HANDLES.find((entry) => entry.id === drag.handle);
      if (!handle) return;

      const anchor = {
        x: handle.x === 0 ? drag.startRect.x + drag.startRect.width : drag.startRect.x,
        y: handle.y === 0 ? drag.startRect.y + drag.startRect.height : drag.startRect.y,
      };

      const next = {
        x: Math.min(anchor.x, point.x),
        y: Math.min(anchor.y, point.y),
        width: Math.abs(point.x - anchor.x),
        height: Math.abs(point.y - anchor.y),
      };

      onChange(
        aspect
          ? applyAspect(next, aspect, sourceWidth, sourceHeight, anchor)
          : normalizeRect(next)
      );
    },
    [disabled, pointToNormalized, onChange, aspect, sourceWidth, sourceHeight]
  );

  const endDrag = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag) return;

    event?.currentTarget?.releasePointerCapture?.(drag.pointerId);
    dragRef.current = null;
    setIsDragging(false);
  }, []);

  // A pointer released outside the window never fires pointerup on the
  // element, which would leave the drag latched and the next click resizing
  // unexpectedly. Window-level cancel handling closes that gap.
  useEffect(() => {
    if (!isDragging) return undefined;

    const stop = () => {
      dragRef.current = null;
      setIsDragging(false);
    };

    window.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stop);
    return () => {
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("blur", stop);
    };
  }, [isDragging]);

  // Keyboard path. Drag-and-drop alone is unusable without a mouse — the same
  // gap the Reorder tool had before its arrow-key handling was added.
  const handleKeyDown = useCallback(
    (event) => {
      if (disabled) return;
      if (!event.key.startsWith("Arrow")) return;

      event.preventDefault();

      const resize = event.altKey;
      const next = nudgeRect(safeRect, event.key, { coarse: event.shiftKey, resize });

      onChange(next);
      setStatus(
        resize
          ? `Crop resized to ${Math.round(next.width * 100)}% by ${Math.round(next.height * 100)}% of the page.`
          : `Crop moved to ${Math.round(next.x * 100)}%, ${Math.round(next.y * 100)}% from the top left.`
      );
    },
    [disabled, safeRect, onChange]
  );

  const percent = (value) => `${value * 100}%`;

  return (
    <div>
      <div
        ref={surfaceRef}
        onPointerDown={(event) => handlePointerDown(event, "new", null)}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        style={{
          position: "relative",
          // Stops the browser panning the page instead of tracking the drag on
          // a touchscreen — without it, the whole gesture scrolls the document.
          touchAction: "none",
          userSelect: "none",
          cursor: disabled ? "default" : "crosshair",
          lineHeight: 0,
          borderRadius: "8px",
          overflow: "hidden",
          backgroundColor: colors.surfaceMuted,
        }}
      >
        {children}

        {/* Four dimming panels around the selection rather than one box with a
            giant spread shadow: this keeps the cropped-away area visibly
            de-emphasised at any rectangle size without the shadow bleeding
            outside the surface's rounded corners. */}
        <Shade style={{ left: 0, top: 0, right: 0, height: percent(safeRect.y) }} />
        <Shade
          style={{
            left: 0,
            top: percent(safeRect.y),
            width: percent(safeRect.x),
            height: percent(safeRect.height),
          }}
        />
        <Shade
          style={{
            left: percent(safeRect.x + safeRect.width),
            top: percent(safeRect.y),
            right: 0,
            height: percent(safeRect.height),
          }}
        />
        <Shade
          style={{ left: 0, top: percent(safeRect.y + safeRect.height), right: 0, bottom: 0 }}
        />

        <div
          role="application"
          aria-label={`${label}. Use the arrow keys to move the crop, or hold Alt and use the arrow keys to resize it.`}
          tabIndex={disabled ? -1 : 0}
          onKeyDown={handleKeyDown}
          onPointerDown={(event) => handlePointerDown(event, "move", null)}
          style={{
            position: "absolute",
            left: percent(safeRect.x),
            top: percent(safeRect.y),
            width: percent(safeRect.width),
            height: percent(safeRect.height),
            border: `1px solid ${colors.primaryContrast}`,
            outline: `1px solid ${colors.primary}`,
            cursor: disabled ? "default" : "move",
            boxSizing: "border-box",
          }}
        >
          {/* Rule-of-thirds guides — the standard visual aid for framing a
              crop, and cheap to draw. */}
          {[1 / 3, 2 / 3].map((fraction) => (
            <span key={`v-${fraction}`} style={guideStyle({ left: percent(fraction), top: 0, bottom: 0, width: "1px" })} />
          ))}
          {[1 / 3, 2 / 3].map((fraction) => (
            <span key={`h-${fraction}`} style={guideStyle({ top: percent(fraction), left: 0, right: 0, height: "1px" })} />
          ))}

          {!disabled &&
            HANDLES.map((handle) => (
              <span
                key={handle.id}
                onPointerDown={(event) => handlePointerDown(event, "resize", handle.id)}
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: percent(handle.x),
                  top: percent(handle.y),
                  // 22px, well above the visual 12px: a corner handle is the
                  // hardest thing on the page to hit accurately, especially on
                  // a touchscreen, and the hit area costs nothing.
                  width: "22px",
                  height: "22px",
                  marginLeft: "-11px",
                  marginTop: "-11px",
                  cursor: handle.cursor,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span
                  style={{
                    width: "12px",
                    height: "12px",
                    borderRadius: "3px",
                    backgroundColor: colors.primaryContrast,
                    border: `2px solid ${colors.primary}`,
                  }}
                />
              </span>
            ))}
        </div>
      </div>

      {/* Announces keyboard adjustments, which are otherwise invisible to a
          screen reader — a purely visual rectangle change reports nothing. */}
      <p
        aria-live="polite"
        style={{
          position: "absolute",
          width: "1px",
          height: "1px",
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          whiteSpace: "nowrap",
        }}
      >
        {status}
      </p>
    </div>
  );
}

function Shade({ style }) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: "absolute",
        backgroundColor: "rgba(15, 23, 42, 0.55)",
        pointerEvents: "none",
        ...style,
      }}
    />
  );
}

function guideStyle(position) {
  return {
    position: "absolute",
    backgroundColor: "rgba(255, 255, 255, 0.35)",
    pointerEvents: "none",
    ...position,
  };
}
