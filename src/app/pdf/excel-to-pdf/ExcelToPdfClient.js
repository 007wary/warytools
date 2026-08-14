"use client";

import { useCallback, useRef, useState } from "react";
import { useConverterWarmup } from "@/lib/useConverterWarmup";
import { FileText, ShieldAlert } from "lucide-react";
import FileDropzone from "@/components/FileDropzone";
import DownloadButton from "@/components/DownloadButton";
import ProgressBar from "@/components/ProgressBar";
import ErrorBanner from "@/components/ErrorBanner";
import PdfFileHeader from "@/components/PdfFileHeader";
import WarningBanner from "@/components/WarningBanner";
import ModeToggle from "@/components/calculator/ModeToggle";
import { PrimaryButton, SecondaryButton } from "@/components/ToolButton";
import { validateSpreadsheetFile } from "@/lib/xlsxFile";
import {
  ACCEPT_ATTRIBUTE,
  CLIENT_TIMEOUT_MS,
  DEFAULT_SCALING,
  DEFAULT_ORIENTATION,
  DEFAULT_SHEET_SELECTION,
  checkUploadSize,
  describeOptions,
  encodeOptions,
  rejectionMessage,
  pdfFilename,
} from "@/lib/excelToPdfLimits";
import { colors } from "@/lib/theme";
import { events, sizeBucket, trackEvent } from "@/lib/analytics";

/**
 * Extension the route needs to disambiguate a legacy OLE2 file.
 *
 * A .xls, .doc, and .ppt share one header, so the bytes cannot tell the route
 * which application wrote the file — see src/lib/xlsxFile.js. Sent as a bare
 * tag rather than the filename: the route only ever compares it against a fixed
 * list, so there is no reason to put the user's filename on the wire.
 */
function legacyExtensionTag(name) {
  const lower = String(name || "").toLowerCase();
  if (lower.endsWith(".xls")) return "xls";
  if (lower.endsWith(".xlt")) return "xlt";
  return "";
}

// The option controls. Labels are written to describe the OUTCOME rather than
// the mechanism, because the mechanism is what nobody wants to think about: an
// option called "ScaleToPagesX" is accurate and useless. The explanatory line
// underneath (describeOptions) carries the detail that the label cannot.
const SCALING_OPTIONS = [
  { id: "fit-width", label: "Fit all columns" },
  { id: "fit-page", label: "Fit to one page" },
  { id: "original", label: "Use Excel's setup" },
];

const ORIENTATION_OPTIONS = [
  { id: "auto", label: "Automatic" },
  { id: "landscape", label: "Landscape" },
  { id: "portrait", label: "Portrait" },
];

const SHEET_OPTIONS = [
  { id: "all", label: "All sheets" },
  { id: "first", label: "First sheet only" },
];

export default function ExcelToPdfClient() {
  const [file, setFile] = useState(null);
  const [isSlow, setIsSlow] = useState(false);
  const [error, setError] = useState("");
  const [resultBlob, setResultBlob] = useState(null);
  const [isConverting, setIsConverting] = useState(false);

  // The three conversion options. Held in state rather than read off the DOM at
  // submit time so the description line under the controls can react to them —
  // the whole reason the description exists is to close the expectation gap
  // *before* someone converts, not after.
  const [scaling, setScaling] = useState(DEFAULT_SCALING);
  const [orientation, setOrientation] = useState(DEFAULT_ORIENTATION);
  const [sheets, setSheets] = useState(DEFAULT_SHEET_SELECTION);

  const fileRef = useRef(null);
  const warmConverter = useConverterWarmup("excel-to-pdf");
  const abortRef = useRef(null);

  const resetState = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setFile(null);
    setIsSlow(false);
    setResultBlob(null);
    setError("");
    setIsConverting(false);
    fileRef.current = null;
    // Options are deliberately NOT reset. Someone converting a second workbook
    // almost always wants the same page setup as the first, and re-picking it
    // every time is friction for no benefit.
  }, []);

  async function handleFiles(fileList) {
    setError("");
    setResultBlob(null);

    const candidate = fileList[0];

    // Container sniffing, not file.type — see xlsxFile.js. This is also where a
    // CSV, a .xlsb, a PDF, a Word document, a presentation, or a Numbers file
    // gets named specifically rather than refused with a generic message.
    const check = await validateSpreadsheetFile(candidate);
    if (!check.ok) {
      trackEvent(events.TOOL_ERROR, {
        reason: check.reason === "csv" ? "excel_to_pdf_csv" : "excel_to_pdf_rejected",
      });
      setError(check.error);
      return;
    }

    // Size is checked against this tool's own ceiling as well.
    // validateSpreadsheetFile already applies it, but going through the shared
    // helper keeps the "slow file" threshold in one place rather than
    // duplicating the comparison here.
    const size = checkUploadSize(check.file.size);
    if (!size.ok) {
      setError(rejectionMessage(size.reason));
      return;
    }

    // No sheet count and no preview, unlike the browser-side PDF tools. Reading
    // either would mean unzipping the .xlsx and laying out its cells in the
    // browser — which is the entire job we are sending to a server precisely
    // because a browser cannot do it. Showing the name and size is honest;
    // counting sheet XML parts would not survive hidden sheets or a legacy .xls.
    fileRef.current = check.file;
    setFile(check.file);
    setIsSlow(size.isSlow);

    // Start the container now rather than on Convert. It scales to zero, and a
    // cold start is ~30s — most of which can be spent while the user picks
    // scaling and orientation. See src/lib/converterWarmup.js.
    warmConverter();
  }

  async function handleConvert() {
    setError("");
    setResultBlob(null);
    setIsConverting(true);

    const controller = new AbortController();
    abortRef.current = controller;

    // Without this the only timeout in the chain is the server's. If the
    // connection stalls — a dropped mobile network mid-upload is the common
    // case — the fetch never settles, the spinner runs forever, and the only way
    // out is a page reload. Deliberately longer than the route's own budget so a
    // conversion that is merely slow still finishes: this fires only when the
    // request is genuinely stuck, never as a race with a response that was going
    // to arrive.
    let timedOut = false;
    const stallTimer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, CLIENT_TIMEOUT_MS);

    try {
      const headers = {
        "Content-Type": "application/octet-stream",
        // encodeOptions rather than a hand-built string: it only ever emits the
        // three known keys with allowlisted values, so nothing here can put a
        // newline (or anything else) into a header. The route re-validates
        // regardless — this side is a courtesy, as with every other check here.
        "X-Conversion-Options": encodeOptions({ scaling, orientation, sheets }),
      };

      // Only sent for the legacy formats that actually need it. A .xlsx or .ods
      // identifies itself from its bytes, so there is nothing to declare.
      const legacy = legacyExtensionTag(fileRef.current?.name);
      if (legacy) headers["X-Source-Extension"] = legacy;

      const response = await fetch("/api/excel-to-pdf", {
        method: "POST",
        headers,
        body: fileRef.current,
        signal: controller.signal,
      });

      if (!response.ok) {
        // The route always sends a JSON message chosen from
        // excelToPdfLimits.rejectionMessage, so the copy the user sees is the
        // same on both sides of the network.
        let message = rejectionMessage("convert_failed");
        try {
          const body = await response.json();
          if (body?.error) message = body.error;
        } catch {
          // Non-JSON response (a platform error page); keep the fallback.
        }

        trackEvent(events.TOOL_ERROR, { reason: `excel_to_pdf_${response.status}` });
        setError(message);
        return;
      }

      const blob = await response.blob();
      setResultBlob(blob);

      trackEvent(events.TOOL_RUN, {
        size_bucket: sizeBucket(fileRef.current.size),
      });
    } catch (err) {
      if (err?.name === "AbortError") {
        // Two very different things arrive here. A user-initiated cancel needs
        // no message — showing an error for something they deliberately did
        // would be noise. A stall timeout does, or the UI just goes quiet and
        // looks like the button did nothing.
        if (timedOut) {
          trackEvent(events.TOOL_ERROR, { reason: "excel_to_pdf_client_timeout" });
          setError(rejectionMessage("timeout"));
        }
        return;
      }

      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "excel_to_pdf_network" });
      setError("Could not reach the converter. Check your connection and try again.");
    } finally {
      clearTimeout(stallTimer);
      setIsConverting(false);
      abortRef.current = null;
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsConverting(false);
  }

  return (
    <div>
      {/* Shown before the file picker, not after: this is one of only four
          tools on the site that upload, and the moment to say so is before
          someone chooses a file, not after. */}
      <div
        style={{
          display: "flex",
          gap: "10px",
          alignItems: "flex-start",
          backgroundColor: colors.surfaceMuted,
          border: `1px solid ${colors.border}`,
          borderRadius: "10px",
          padding: "12px 14px",
          marginBottom: "20px",
        }}
      >
        <ShieldAlert
          size={16}
          style={{ color: colors.textMuted, flexShrink: 0, marginTop: "1px" }}
        />
        <p style={{ fontSize: "13px", color: colors.textSecondary, lineHeight: 1.5, margin: 0 }}>
          <strong style={{ color: colors.text }}>This tool uploads your file.</strong> Like the
          other three document converters, and unlike everything else here, laying out a
          spreadsheet can&apos;t run in a browser — your file is sent to our converter, rendered to
          PDF, and deleted immediately afterwards. Nothing is stored or logged. If the workbook is
          confidential, Excel and LibreOffice both export PDFs locally.
        </p>
      </div>

      {!file && (
        <FileDropzone
          onFiles={handleFiles}
          accept={ACCEPT_ATTRIBUTE}
          label="Drag & drop an Excel file here, or click to browse"
        />
      )}

      <ErrorBanner>{error}</ErrorBanner>

      {file && (
        <div style={{ marginTop: "20px" }}>
          <PdfFileHeader file={file} onReset={resetState} disabled={isConverting} />

          {isSlow && (
            <WarningBanner>
              This is a large workbook, so conversion may take up to a minute. Keep this tab open —
              closing it cancels the conversion.
            </WarningBanner>
          )}

          {/* The page-setup controls.

              These are the reason this tool has options when the other three
              converters have none. A .docx has a page size and a .pptx has a
              slide size, so "convert to PDF" is unambiguous for both. A sheet is
              an unbounded grid, and something has to decide where it gets cut —
              if nobody does, LibreOffice slices it into portrait column strips
              and a 12-column budget comes back with columns 9-12 orphaned on
              their own page. So these are primary controls shown up front, not
              an "advanced" disclosure. See src/lib/excelToPdfLimits.js. */}
          <fieldset
            style={{
              marginTop: "20px",
              border: `1px solid ${colors.border}`,
              borderRadius: "10px",
              padding: "16px",
            }}
          >
            <legend
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: colors.text,
                padding: "0 6px",
              }}
            >
              Page setup
            </legend>

            <div style={{ display: "grid", gap: "16px" }}>
              <div>
                <p
                  style={{
                    fontSize: "13px",
                    color: colors.textSecondary,
                    margin: "0 0 8px",
                    fontWeight: 500,
                  }}
                >
                  Column fitting
                </p>
                <ModeToggle
                  label="Column fitting"
                  size="sm"
                  options={SCALING_OPTIONS}
                  value={scaling}
                  onChange={setScaling}
                />
              </div>

              <div>
                <p
                  style={{
                    fontSize: "13px",
                    color: colors.textSecondary,
                    margin: "0 0 8px",
                    fontWeight: 500,
                  }}
                >
                  Orientation
                </p>
                <ModeToggle
                  label="Page orientation"
                  size="sm"
                  options={ORIENTATION_OPTIONS}
                  value={orientation}
                  onChange={setOrientation}
                />
              </div>

              <div>
                <p
                  style={{
                    fontSize: "13px",
                    color: colors.textSecondary,
                    margin: "0 0 8px",
                    fontWeight: 500,
                  }}
                >
                  Sheets
                </p>
                <ModeToggle
                  label="Which sheets to convert"
                  size="sm"
                  options={SHEET_OPTIONS}
                  value={sheets}
                  onChange={setSheets}
                />
              </div>
            </div>

            {/* The outcome, in words, before conversion rather than after.
                "Fit all columns" does not tell someone their rows will still
                span several pages — and that expectation gap is exactly what
                makes a correctly converted spreadsheet look broken.
                aria-live because it changes in response to the controls above,
                and a change nobody is told about may as well not have
                happened. */}
            <p
              aria-live="polite"
              style={{
                fontSize: "12.5px",
                color: colors.textMuted,
                lineHeight: 1.5,
                margin: "16px 0 0",
              }}
            >
              {describeOptions({ scaling, orientation, sheets })}
            </p>
          </fieldset>

          {/* Indeterminate throughout: the converter is a single opaque step
              with no per-sheet progress to report, and a bar that invented one
              would be lying about how far along it is. */}
          {isConverting && (
            <ProgressBar indeterminate label="Converting to PDF — this can take a moment…" />
          )}

          <div
            style={{
              display: "flex",
              gap: "12px",
              alignItems: "center",
              flexWrap: "wrap",
              marginTop: "20px",
            }}
          >
            <PrimaryButton onClick={handleConvert} disabled={isConverting}>
              <FileText size={16} />
              {isConverting ? "Converting…" : "Convert to PDF"}
            </PrimaryButton>

            {isConverting && <SecondaryButton onClick={handleCancel}>Cancel</SecondaryButton>}

            {resultBlob && !isConverting && (
              <DownloadButton getBlob={() => resultBlob} filename={pdfFilename(file.name)}>
                Download {pdfFilename(file.name)}
              </DownloadButton>
            )}
          </div>

          {resultBlob && !isConverting && (
            <div
              style={{
                marginTop: "16px",
                padding: "12px 14px",
                borderRadius: "10px",
                border: `1px solid ${colors.successSoftBorder}`,
                backgroundColor: colors.successSoft,
                fontSize: "14px",
                color: colors.textSecondary,
                lineHeight: 1.5,
              }}
            >
              Converted, with your formatting, formulas&apos; results, and charts preserved.
              {/* Said after the fact as well as before: someone comparing the
                  PDF to the original needs to know which differences are
                  expected rather than assuming the tool malfunctioned. The
                  pagination note is here because it is the single most common
                  "is this broken?" moment for this conversion specifically. */}
              <span style={{ color: colors.textMuted }}>
                {" "}
                A long sheet still runs over several pages — that&apos;s the row count, not a
                setting. If the split looks wrong, try a different column fitting or orientation
                above and convert again.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
