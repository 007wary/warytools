// Crop-rectangle maths, shared by Crop PDF and (when it lands) Crop Image.
//
// The two tools differ entirely in what they do with a rectangle — one sets a
// PDF CropBox, the other redraws a canvas — but the rectangle itself behaves
// identically: dragged from a corner, constrained to an aspect ratio, clamped
// to the surface, never inverted. That shared behaviour is what lives here, in
// *normalised* coordinates (0-1) so it is independent of both the displayed
// preview size and the true page/image size.
//
// Normalised is load-bearing rather than tidy. The preview is rendered at
// whatever width the layout gives it, and the output has to be computed against
// the real page dimensions; carrying pixels through would mean re-deriving the
// rectangle on every resize and getting a slightly different crop each time.

/** The smallest crop allowed, as a fraction of the surface. */
const MIN_SIZE = 0.02;

/** Aspect presets offered in the UI. `ratio: null` means freeform. */
export const ASPECT_RATIOS = [
  { id: "free", label: "Free", ratio: null },
  { id: "original", label: "Original", ratio: "source" },
  { id: "1:1", label: "Square", ratio: 1 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "3:2", label: "3:2", ratio: 3 / 2 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
];

/** The full surface — the default crop, and what "reset" returns to. */
export const FULL_RECT = { x: 0, y: 0, width: 1, height: 1 };

/**
 * Resolves an aspect preset to a numeric width/height ratio.
 *
 * "original" is resolved against the source, so it means something different
 * per page — which is the point, since a mixed-size document has no single
 * original ratio.
 *
 * @param {string} id
 * @param {number} sourceWidth  True surface width (points or pixels).
 * @param {number} sourceHeight
 * @returns {number|null} Null for freeform.
 */
export function resolveAspect(id, sourceWidth, sourceHeight) {
  const preset = ASPECT_RATIOS.find((entry) => entry.id === id);
  if (!preset || preset.ratio === null) return null;

  if (preset.ratio === "source") {
    if (!sourceWidth || !sourceHeight) return null;
    return sourceWidth / sourceHeight;
  }

  return preset.ratio;
}

/** Keeps a value inside [min, max]. */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Normalises a rectangle: positive dimensions, inside the surface, non-zero.
 *
 * Dragging up and to the left produces a negative width and height, which every
 * downstream consumer would get wrong — pdf-lib would write an inverted CropBox
 * that readers display as an empty page. Flipping here means the drag handlers
 * never have to care which direction the pointer went.
 *
 * @param {{x: number, y: number, width: number, height: number}} rect
 * @returns {{x: number, y: number, width: number, height: number}}
 */
export function normalizeRect(rect) {
  if (!rect) return { ...FULL_RECT };

  let { x, y, width, height } = rect;

  if (!Number.isFinite(x) || !Number.isFinite(y)) return { ...FULL_RECT };
  if (!Number.isFinite(width) || !Number.isFinite(height)) return { ...FULL_RECT };

  // Flip a backwards drag into a forwards rectangle.
  if (width < 0) {
    x += width;
    width = -width;
  }
  if (height < 0) {
    y += height;
    height = -height;
  }

  x = clamp(x, 0, 1);
  y = clamp(y, 0, 1);
  width = clamp(width, MIN_SIZE, 1 - x);
  height = clamp(height, MIN_SIZE, 1 - y);

  // Clamping width against `1 - x` can still leave a sub-minimum box when x is
  // very close to 1. Pull the origin back rather than returning something
  // smaller than the minimum.
  if (width < MIN_SIZE) {
    width = MIN_SIZE;
    x = Math.max(0, 1 - width);
  }
  if (height < MIN_SIZE) {
    height = MIN_SIZE;
    y = Math.max(0, 1 - height);
  }

  return { x, y, width, height };
}

/**
 * Applies an aspect-ratio constraint to a rectangle being dragged.
 *
 * `aspect` is width/height in *true surface* units, so the surface's own
 * dimensions are needed to convert it into normalised space — a square crop on
 * an A4 page is not a square in 0-1 coordinates.
 *
 * The anchor is what makes this feel right: the corner opposite the one being
 * dragged stays put, so the rectangle grows away from the hand rather than
 * sliding around. Resizing from the top-left with a fixed anchor at the
 * bottom-right is the standard behaviour in every image editor.
 *
 * @param {object} rect        Normalised rectangle mid-drag.
 * @param {number|null} aspect Target width/height, or null for freeform.
 * @param {number} sourceWidth  True surface width.
 * @param {number} sourceHeight True surface height.
 * @param {{x: number, y: number}} anchor Normalised fixed corner.
 */
export function applyAspect(rect, aspect, sourceWidth, sourceHeight, anchor) {
  if (!aspect || !sourceWidth || !sourceHeight) return normalizeRect(rect);

  const base = normalizeRect(rect);

  // Convert the ratio into normalised space. A 1:1 ratio on a 595×842 page is
  // 0.707 in normalised terms, and using the raw 1 here is exactly the bug
  // that makes "square" crops come out rectangular.
  const normalizedAspect = (aspect * sourceHeight) / sourceWidth;

  // Grow along whichever axis the user pulled further, so the rectangle tracks
  // the pointer rather than snapping to a shape they didn't drag toward.
  let width = base.width;
  let height = width / normalizedAspect;

  if (height < base.height) {
    height = base.height;
    width = height * normalizedAspect;
  }

  // The anchor is the corner that must not move. Everything else follows.
  const anchorX = anchor?.x ?? base.x;
  const anchorY = anchor?.y ?? base.y;

  const growsRight = base.x >= anchorX;
  const growsDown = base.y >= anchorY;

  // Cap against the surface edge in the direction of growth, preserving the
  // ratio — otherwise a drag into the corner would clip one axis and silently
  // break the aspect constraint the user asked for.
  const availableWidth = growsRight ? 1 - anchorX : anchorX;
  const availableHeight = growsDown ? 1 - anchorY : anchorY;

  if (width > availableWidth) {
    width = availableWidth;
    height = width / normalizedAspect;
  }
  if (height > availableHeight) {
    height = availableHeight;
    width = height * normalizedAspect;
  }

  return normalizeRect({
    x: growsRight ? anchorX : anchorX - width,
    y: growsDown ? anchorY : anchorY - height,
    width,
    height,
  });
}

/**
 * Moves a rectangle by a delta, stopping at the surface edges.
 *
 * Clamps the *origin* rather than the resulting box, so dragging a crop into
 * the edge slides it flush and stops — it never shrinks. A crop that quietly
 * resized itself while being moved would lose the framing the user set.
 */
export function translateRect(rect, dx, dy) {
  const base = normalizeRect(rect);
  return {
    ...base,
    x: clamp(base.x + dx, 0, 1 - base.width),
    y: clamp(base.y + dy, 0, 1 - base.height),
  };
}

/**
 * Converts a normalised rectangle into true surface units.
 *
 * @returns {{x: number, y: number, width: number, height: number}}
 */
export function toSourceRect(rect, sourceWidth, sourceHeight) {
  const base = normalizeRect(rect);
  return {
    x: base.x * sourceWidth,
    y: base.y * sourceHeight,
    width: base.width * sourceWidth,
    height: base.height * sourceHeight,
  };
}

/**
 * Converts a top-left-origin rectangle into PDF's bottom-left-origin box.
 *
 * PDF user space puts the origin at the bottom-left with y increasing upward;
 * every screen coordinate system does the opposite. Getting this wrong doesn't
 * error — it crops the mirror image of what the user selected, which is the
 * single most likely bug in this tool and the reason this is its own function
 * with its own test rather than an inline subtraction.
 *
 * Returned as the [x1, y1, x2, y2] pair pdf-lib's setCropBox expects, offset by
 * the page's existing MediaBox origin (rarely non-zero, but a page cropped once
 * already has one, and ignoring it shifts the second crop off the page).
 *
 * @param {object} rect Normalised, top-left origin.
 * @param {{x: number, y: number, width: number, height: number}} mediaBox
 * @returns {{x: number, y: number, width: number, height: number}}
 */
export function toPdfBox(rect, mediaBox, rotation = 0) {
  const base = normalizeRect(rect);

  const boxX = mediaBox?.x || 0;
  const boxY = mediaBox?.y || 0;
  const boxWidth = mediaBox?.width || 0;
  const boxHeight = mediaBox?.height || 0;

  // Undo the page's /Rotate before measuring.
  //
  // The user selected the rectangle against the page *as displayed*, but the
  // MediaBox is in unrotated user space. On a page with /Rotate 90 those two
  // frames differ by a quarter turn, so measuring the selection directly
  // against the MediaBox crops a region rotated 90° from the one on screen —
  // silently, since every number involved stays perfectly valid.
  //
  // Normalising the angle first: /Rotate is a multiple of 90 but may be
  // negative or above 360 in real files.
  const angle = ((Math.round((rotation || 0) / 90) * 90) % 360 + 360) % 360;

  // Map the displayed rectangle back onto unrotated axes. At 90/270 the axes
  // swap, so a displayed width becomes an unrotated height.
  let unrotated;
  if (angle === 90) {
    unrotated = {
      x: base.y,
      y: 1 - base.x - base.width,
      width: base.height,
      height: base.width,
    };
  } else if (angle === 180) {
    unrotated = {
      x: 1 - base.x - base.width,
      y: 1 - base.y - base.height,
      width: base.width,
      height: base.height,
    };
  } else if (angle === 270) {
    unrotated = {
      x: 1 - base.y - base.height,
      y: base.x,
      width: base.height,
      height: base.width,
    };
  } else {
    unrotated = base;
  }

  return {
    x: boxX + unrotated.x * boxWidth,
    // The flip. `unrotated.y` measures down from the top; PDF wants the
    // distance from the bottom to the box's lower edge.
    y: boxY + (1 - unrotated.y - unrotated.height) * boxHeight,
    width: unrotated.width * boxWidth,
    height: unrotated.height * boxHeight,
  };
}

/**
 * Describes a crop for the UI.
 *
 * Shows true dimensions rather than percentages, because "148 × 210 mm" tells
 * someone whether they've hit A5 and "50% × 50%" does not.
 *
 * @param {object} rect Normalised.
 * @param {number} sourceWidth  In points.
 * @param {number} sourceHeight In points.
 */
export function describeCrop(rect, sourceWidth, sourceHeight) {
  if (!sourceWidth || !sourceHeight) return "";

  const source = toSourceRect(rect, sourceWidth, sourceHeight);
  const mmWidth = Math.round((source.width / 72) * 25.4);
  const mmHeight = Math.round((source.height / 72) * 25.4);
  const percent = Math.round(rect.width * rect.height * 100);

  return `${Math.round(source.width)} × ${Math.round(source.height)} pt (${mmWidth} × ${mmHeight} mm) · ${percent}% of the page`;
}

/**
 * Nudges a crop by keyboard.
 *
 * Drag-and-drop alone is unusable with a keyboard or a screen reader — the same
 * gap the Reorder tool had before its arrow-key path was added. Shift gives a
 * coarse step so crossing a page doesn't take a hundred presses.
 *
 * @param {object} rect
 * @param {string} key   An arrow key name.
 * @param {boolean} coarse Shift held.
 * @param {boolean} resize Alt held — resizes instead of moving.
 */
export function nudgeRect(rect, key, { coarse = false, resize = false } = {}) {
  const step = coarse ? 0.05 : 0.01;
  const base = normalizeRect(rect);

  const dx = key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : 0;
  const dy = key === "ArrowUp" ? -step : key === "ArrowDown" ? step : 0;

  if (dx === 0 && dy === 0) return base;

  if (resize) {
    return normalizeRect({
      ...base,
      width: base.width + dx,
      height: base.height + dy,
    });
  }

  return translateRect(base, dx, dy);
}
