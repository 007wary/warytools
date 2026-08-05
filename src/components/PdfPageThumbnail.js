"use client";

import { useRef } from "react";
import { colors } from "@/lib/theme";
import { useNearViewport } from "@/lib/pdfThumbnails";

// One page preview. Requests its bitmap only once it's near the viewport, so
// opening a 400-page PDF renders a screenful rather than all 400 pages.
export default function PdfPageThumbnail({ pageNumber, getThumbnail, rotation = 0, alt }) {
  const containerRef = useRef(null);
  const isNear = useNearViewport(containerRef);

  const url = isNear ? getThumbnail(pageNumber) : null;

  return (
    <div
      ref={containerRef}
      style={{
        // A fixed aspect box reserves the space before the image arrives.
        // Without it, every completed thumbnail would reflow the grid and
        // shift the pages the user was aiming at — the classic layout-shift
        // failure, and genuinely disruptive in a drag-to-reorder UI.
        aspectRatio: "1 / 1.414",
        backgroundColor: colors.surfaceMuted,
        borderRadius: "6px",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {url ? (
        // next/image deliberately not used here, and the rule is disabled
        // rather than satisfied: `url` is a `blob:` URL minted client-side from
        // a canvas render (see pdfThumbnails.js), so there is nothing for the
        // image optimizer to fetch or cache — it would have to run in
        // `unoptimized` mode, which is a plain <img> with extra bundle weight.
        // The LCP concern the rule warns about also doesn't apply: these are
        // lazily rendered previews inside a fixed aspect-ratio box, so they
        // neither race the LCP element nor shift layout.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt || `Page ${pageNumber}`}
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            display: "block",
            // Previewing the rotation with a CSS transform rather than
            // re-rendering the page: it's instant, and the actual rotation is
            // applied to the real document by pdf-lib on export.
            transform: `rotate(${rotation}deg)`,
            transition: "transform 0.2s ease",
          }}
          draggable={false}
        />
      ) : (
        <span style={{ fontSize: "12px", color: colors.textFaint }} aria-hidden="true">
          {pageNumber}
        </span>
      )}
    </div>
  );
}
