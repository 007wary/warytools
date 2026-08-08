"use client";

import { useCallback, useRef } from "react";
import { Check, X } from "lucide-react";
import PdfPageThumbnail from "@/components/PdfPageThumbnail";
import { colors } from "@/lib/theme";

// A click-to-select grid of page thumbnails, shared by Delete Pages and
// Extract Pages.
//
// The two tools are the same gesture read in opposite directions — pick pages,
// then either keep them or drop them — so this component knows nothing about
// which. It reports a Set of 1-based page numbers and lets the caller decide
// what selection means. `tone` only changes the accent colour and the tick
// glyph, because "these pages are going away" and "these pages are coming with
// you" want visibly different affordances even though the interaction is
// identical.
//
// Selection is a Set of PAGE NUMBERS, not indices, matching everything else in
// pdfPageSelection.js. There is exactly one place in this pipeline where the
// conversion to 0-based happens (toPageIndices, at the worker boundary), and
// keeping this component on the user-facing convention is what stops a second
// conversion creeping in here.

/**
 * @param {number} pageCount        Total pages in the document.
 * @param {Set<number>} selected    1-based page numbers currently selected.
 * @param {Function} onToggle       (pageNumber, {shiftKey}) => void
 * @param {Function} getThumbnail   From usePdfThumbnails.
 * @param {"danger"|"primary"} tone Accent for the selected state.
 * @param {string} selectedLabel    Verb used in the accessible name, e.g. "delete".
 * @param {boolean} disabled
 */
export default function PdfPageSelector({
  pageCount,
  selected,
  onToggle,
  getThumbnail,
  tone = "primary",
  selectedLabel = "select",
  disabled = false,
}) {
  const accent = tone === "danger" ? colors.danger : colors.primary;
  const Glyph = tone === "danger" ? X : Check;

  // The last page the user acted on, for shift-click range selection. A ref
  // rather than state: it only ever influences the *next* event handler, never
  // what renders, so putting it in state would cost a render pass per click
  // for no visible change.
  const anchorRef = useRef(null);

  const handleToggle = useCallback(
    (pageNumber, event) => {
      if (disabled) return;
      // Shift-click extends from the last page clicked, the convention every
      // file manager and mail client uses. Without it, pulling forty pages out
      // of a report means forty clicks, which is the point at which people
      // give up and go back to the text box. The arithmetic itself lives in
      // applyPageClick() in pdfPageSelection.js — this only supplies the
      // anchor, so the behaviour stays testable.
      onToggle(pageNumber, { shiftKey: Boolean(event?.shiftKey), anchor: anchorRef.current });
      anchorRef.current = pageNumber;
    },
    [disabled, onToggle]
  );

  return (
    <ul
      style={{
        listStyle: "none",
        padding: 0,
        margin: "0 0 20px",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
        gap: "12px",
      }}
    >
      {Array.from({ length: pageCount }, (_, index) => {
        const pageNumber = index + 1;
        const isSelected = selected.has(pageNumber);

        return (
          <li key={pageNumber}>
            {/* A real <button> with aria-pressed, not a div with a click
                handler: this is a toggle, and a screen reader needs to be able
                to say whether each page is currently on or off. A clickable
                div announces nothing and can't be reached by keyboard. */}
            <button
              type="button"
              onClick={(event) => handleToggle(pageNumber, event)}
              aria-pressed={isSelected}
              aria-label={`Page ${pageNumber} of ${pageCount}${
                isSelected ? `, marked to ${selectedLabel}` : ""
              }`}
              disabled={disabled}
              style={{
                width: "100%",
                position: "relative",
                border: `2px solid ${isSelected ? accent : colors.border}`,
                borderRadius: "10px",
                padding: "8px",
                backgroundColor: colors.surface,
                cursor: disabled ? "not-allowed" : "pointer",
                textAlign: "center",
                // The selected state is carried by the border, the badge, AND
                // the dimming below — three signals, not one. Colour alone
                // fails for the ~8% of men with red-green colour blindness,
                // and on this grid that means not being able to tell which
                // pages are about to be deleted.
                opacity: disabled ? 0.6 : 1,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: "10px",
                  right: "10px",
                  zIndex: 1,
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  border: `1px solid ${isSelected ? accent : colors.borderInput}`,
                  backgroundColor: isSelected ? accent : colors.surface,
                  color: isSelected ? colors.primaryContrast : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "var(--shadow-float)",
                }}
              >
                <Glyph size={14} strokeWidth={3} />
              </span>

              <span
                style={{
                  display: "block",
                  // Dimming a page marked for deletion previews the outcome:
                  // the grid ends up looking like the document you're about to
                  // get. For an extraction the polarity is inverted — the
                  // chosen pages are the ones that survive — so unselected
                  // pages recede instead.
                  opacity:
                    tone === "danger" ? (isSelected ? 0.4 : 1) : isSelected ? 1 : 0.45,
                  transition: "opacity 0.15s ease",
                }}
              >
                <PdfPageThumbnail
                  pageNumber={pageNumber}
                  getThumbnail={getThumbnail}
                  alt={`Page ${pageNumber}`}
                />
              </span>

              <span
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: isSelected ? 600 : 400,
                  color: isSelected ? accent : colors.textMuted,
                  marginTop: "8px",
                }}
              >
                Page {pageNumber}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
