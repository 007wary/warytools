import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { colors } from "@/lib/theme";

// Prev/next navigation for a paginated list.
//
// Deliberately NOT a numbered page strip (1 2 3 … 12). A numbered strip is
// useful when someone is looking for a known position in a long archive; on a
// reverse-chronological list nobody knows that page 7 holds what they want, so
// the strip is a row of identical-looking links that costs mobile width and
// says nothing. Prev/next plus a visible "Showing 11-20 of 34" gives the two
// things a reader actually uses: where am I, and how do I keep going.
//
// Two navigation modes, because the two consumers genuinely differ rather than
// as a convenience:
//
//   - Links (previousPath/nextPath) for /blog, where each page is a real
//     prerendered URL. These must be <Link>s: they are crawlable, shareable,
//     and work before any JS loads.
//   - A callback (onPageChange) for the /habga dashboard, where paging is
//     component state behind a login and there is no URL to link to.
//
// Rendering a <Link href="#"> with an onClick for the second case would put a
// fake URL in the status bar and in the user's history, so the callback mode
// renders real <button>s instead. Same component, same look, correct semantics
// either way.

const baseStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  padding: "10px 16px",
  borderRadius: "10px",
  border: `1px solid ${colors.border}`,
  backgroundColor: colors.surface,
  color: colors.text,
  fontSize: "14.5px",
  fontWeight: 600,
  textDecoration: "none",
};

const buttonStyle = {
  ...baseStyle,
  cursor: "pointer",
  // A <button> inherits neither the page font nor its size, so without these
  // the two modes render in different typefaces on the same site.
  font: "inherit",
  fontSize: baseStyle.fontSize,
  fontWeight: baseStyle.fontWeight,
};

// One arm of the control. Renders whichever element the mode calls for, so the
// two branches cannot drift in padding, colour, or icon placement.
function Step({ direction, path, onPageChange, targetPage, children }) {
  const icon =
    direction === "prev" ? (
      <ArrowLeft size={16} aria-hidden="true" />
    ) : (
      <ArrowRight size={16} aria-hidden="true" />
    );

  const content = direction === "prev" ? (
    <>
      {icon}
      {children}
    </>
  ) : (
    <>
      {children}
      {icon}
    </>
  );

  if (onPageChange) {
    return (
      <button type="button" onClick={() => onPageChange(targetPage)} style={buttonStyle}>
        {content}
      </button>
    );
  }

  return (
    <Link href={path} rel={direction} style={baseStyle}>
      {content}
    </Link>
  );
}

export default function Pagination({
  page,
  totalPages,
  previousPath,
  nextPath,
  from,
  to,
  total,
  onPageChange,
  // The noun in the position line. "posts" on the blog; the dashboard lists
  // the same things, but a consumer counting something else shouldn't have to
  // read "posts".
  unit = "posts",
}) {
  // One page of results needs no navigation at all. Rendering a disabled pair
  // of buttons on a list with four items is UI announcing a structure that
  // isn't there.
  if (totalPages <= 1) return null;

  // In callback mode the caller holds only the page number, so derive whether
  // each direction exists rather than requiring it to pass paths it has no use
  // for.
  const hasPrevious = onPageChange ? page > 1 : Boolean(previousPath);
  const hasNext = onPageChange ? page < totalPages : Boolean(nextPath);

  return (
    <nav
      // Named, because a page can carry several <nav> landmarks (the site
      // navbar is the other) and a screen reader listing them as two
      // indistinguishable "navigation" entries makes the landmark list useless.
      aria-label="Pagination"
      style={{ marginTop: "40px" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        {/* Rendered as an empty span rather than omitted when there is no
            previous page, so `space-between` keeps "Next" on the right instead
            of letting it jump to the left edge on page 1. */}
        {hasPrevious ? (
          <Step
            direction="prev"
            path={previousPath}
            onPageChange={onPageChange}
            targetPage={page - 1}
          >
            Newer {unit}
          </Step>
        ) : (
          <span />
        )}

        {hasNext ? (
          <Step
            direction="next"
            path={nextPath}
            onPageChange={onPageChange}
            targetPage={page + 1}
          >
            Older {unit}
          </Step>
        ) : (
          <span />
        )}
      </div>

      {/* The position line is the half that makes prev/next usable. Without
          it, "Older posts" is a link into the dark: the reader cannot tell
          whether they are two posts from the end or forty. Labels say "Newer"
          and "Older" rather than "Previous" and "Next" because the ordering is
          chronological and direction-by-time is what a reader is actually
          navigating — "Previous" on a reverse-chronological list is genuinely
          ambiguous about which way it goes. */}
      <p
        style={{
          margin: "16px 0 0",
          fontSize: "13.5px",
          color: colors.textFaint,
          textAlign: "center",
        }}
      >
        Showing {from}–{to} of {total} {unit} · Page {page} of {totalPages}
      </p>
    </nav>
  );
}
