"use client";

import { useCallback, useRef, useState } from "react";
import { colors } from "@/lib/theme";

// A layer of draggable, resizable signature boxes over a page preview.
//
// **Why this isn't CropOverlay.** That component reports ONE normalised rect over
// a whole surface, dims everything outside it, and draws rule-of-thirds guides —
// all correct for framing a crop, all wrong here. A signature layer holds SEVERAL
// independent boxes, must not dim the page (you are placing against the text you
// can read), and each box carries a delete affordance. The two share the pointer
// technique below and nothing else, so bending CropOverlay to cover both would
// have made a tested, working component conditional on a mode flag.
//
// The pointer handling deliberately copies CropOverlay's, because those choices
// are load-bearing rather than incidental:
//
//   - **Pointer Events with setPointerCapture.** A drag that leaves the element
//     still tracks. With mouse events, dragging past the edge silently drops the
//     handle and freezes the box mid-gesture — the most common defect in
//     hand-rolled drag UIs — and pointer events get touch and stylus for free.
//   - **The bounding rect is read live on every move**, never cached at drag
//     start, since a lazily-arriving thumbnail can reflow the preview mid-drag
//     and a stale rect maps the pointer to the wrong place from then on.
//   - **touchAction: "none"** is what stops a touchscreen panning the page
//     instead of tracking the drag.

/** How far one arrow-key press moves a box, as a fraction of the page. */
const NUDGE = 0.005;
const NUDGE_COARSE = 0.05;

/** How much one arrow-key press resizes a box, as a fraction of page width. */
const RESIZE_STEP = 0.01;

export default function SignaturePlacementLayer({
  placements,
  activeId,
  onSelect,
  onChange,
  onRemove,
  disabled = false,
  children,
}) {
  const surfaceRef = useRef(null);
  // What the current gesture is doing. A ref rather than state: it changes on
  // every pointermove, and re-rendering for it would throttle the drag to
  // React's render rate for no visual benefit.
  const dragRef = useRef(null);
  const [status, setStatus] = useState("");

  const pointToNormalized = useCallback((event) => {
    const element = surfaceRef.current;
    if (!element) return null;

    const bounds = element.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return null;

    return {
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height,
    };
  }, []);

  const handlePointerDown = useCallback(
    (event, placement, mode) => {
      if (disabled) return;

      event.preventDefault();
      event.stopPropagation();

      const point = pointToNormalized(event);
      if (!point) return;

      event.currentTarget.setPointerCapture?.(event.pointerId);
      onSelect?.(placement.id);

      dragRef.current = {
        id: placement.id,
        mode,
        start: point,
        startPlacement: placement,
        pointerId: event.pointerId,
      };
    },
    [disabled, pointToNormalized, onSelect]
  );

  const handlePointerMove = useCallback(
    (event) => {
      const drag = dragRef.current;
      if (!drag || disabled) return;

      const point = pointToNormalized(event);
      if (!point) return;

      if (drag.mode === "move") {
        onChange(drag.id, {
          x: drag.startPlacement.x + (point.x - drag.start.x),
          y: drag.startPlacement.y + (point.y - drag.start.y),
        });
        return;
      }

      // Resizing from the bottom-right corner. Only the width is settable —
      // height follows from the signature's own aspect ratio, because a
      // signature stretched to fill a box is instantly recognisable as wrong.
      // That is enforced upstream in resolvePlacementRect(); here we only report
      // the new width.
      const widthFraction = point.x - drag.startPlacement.x;
      onChange(drag.id, { widthFraction });
    },
    [disabled, pointToNormalized, onChange]
  );

  const endDrag = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag) return;

    event?.currentTarget?.releasePointerCapture?.(drag.pointerId);
    dragRef.current = null;
  }, []);

  // Keyboard path. Drag-and-drop alone is unusable with a keyboard or a screen
  // reader — the same gap Reorder and Crop each had to close.
  const handleKeyDown = useCallback(
    (event, placement) => {
      if (disabled) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        onRemove?.(placement.id);
        setStatus("Signature removed.");
        return;
      }

      if (!event.key.startsWith("Arrow")) return;
      event.preventDefault();

      // Alt turns the arrows into a resize, matching CropOverlay's convention so
      // the two tools don't teach different keys for the same idea.
      if (event.altKey) {
        const delta =
          event.key === "ArrowRight" || event.key === "ArrowUp" ? RESIZE_STEP : -RESIZE_STEP;
        const widthFraction = placement.widthFraction + delta;
        onChange(placement.id, { widthFraction });
        setStatus(`Signature resized to ${Math.round(widthFraction * 100)}% of the page width.`);
        return;
      }

      const step = event.shiftKey ? NUDGE_COARSE : NUDGE;
      const next = { x: placement.x, y: placement.y };

      if (event.key === "ArrowLeft") next.x -= step;
      if (event.key === "ArrowRight") next.x += step;
      if (event.key === "ArrowUp") next.y -= step;
      if (event.key === "ArrowDown") next.y += step;

      onChange(placement.id, next);
      setStatus(
        `Signature moved to ${Math.round(next.x * 100)}%, ${Math.round(next.y * 100)}% from the top left.`
      );
    },
    [disabled, onChange, onRemove]
  );

  const percent = (value) => `${value * 100}%`;

  return (
    <div>
      <div
        ref={surfaceRef}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{
          position: "relative",
          touchAction: "none",
          userSelect: "none",
          lineHeight: 0,
          borderRadius: "8px",
          overflow: "hidden",
          backgroundColor: colors.surfaceMuted,
        }}
      >
        {children}

        {placements.map((placement) => {
          const active = placement.id === activeId;

          return (
            <div
              key={placement.id}
              role="application"
              aria-label={`Signature on this page. Arrow keys move it, Alt with the arrow keys resizes it, Delete removes it.`}
              tabIndex={disabled ? -1 : 0}
              onKeyDown={(event) => handleKeyDown(event, placement)}
              onFocus={() => onSelect?.(placement.id)}
              onPointerDown={(event) => handlePointerDown(event, placement, "move")}
              style={{
                position: "absolute",
                left: percent(placement.rect.x),
                top: percent(placement.rect.y),
                width: percent(placement.rect.width),
                height: percent(placement.rect.height),
                // A dashed outline only while selected: the point of this tool is
                // seeing the signature sitting on the document as it will print,
                // and a permanent box around it defeats that.
                border: active ? `1px dashed ${colors.primary}` : "1px dashed transparent",
                cursor: disabled ? "default" : "move",
                boxSizing: "border-box",
                touchAction: "none",
              }}
            >
              {placement.preview}

              {active && !disabled && (
                <>
                  {/* Resize grip, bottom-right. 22px hit area around a 12px
                      target for the same reason CropOverlay uses one: a corner
                      handle is the hardest thing on the page to hit accurately,
                      especially on a touchscreen, and the margin costs nothing. */}
                  <span
                    onPointerDown={(event) => handlePointerDown(event, placement, "resize")}
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      left: "100%",
                      top: "100%",
                      width: "22px",
                      height: "22px",
                      marginLeft: "-11px",
                      marginTop: "-11px",
                      cursor: "nwse-resize",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      touchAction: "none",
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

                  <button
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemove?.(placement.id);
                    }}
                    aria-label="Remove this signature"
                    style={{
                      position: "absolute",
                      left: "100%",
                      top: 0,
                      transform: "translate(-50%, -50%)",
                      width: "22px",
                      height: "22px",
                      borderRadius: "50%",
                      border: `1px solid ${colors.border}`,
                      backgroundColor: colors.surface,
                      color: colors.textSecondary,
                      fontSize: "13px",
                      lineHeight: 1,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    ×
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Announces keyboard adjustments, which are otherwise invisible to a
          screen reader — a purely visual box moving reports nothing. */}
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
