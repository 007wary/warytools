"use client";

import { useCallback, useRef, useState } from "react";
import { FileText, ShieldAlert } from "lucide-react";
import FileDropzone from "@/components/FileDropzone";
import DownloadButton from "@/components/DownloadButton";
import ProgressBar from "@/components/ProgressBar";
import ErrorBanner from "@/components/ErrorBanner";
import PdfFileHeader from "@/components/PdfFileHeader";
import WarningBanner from "@/components/WarningBanner";
import { PrimaryButton, SecondaryButton } from "@/components/ToolButton";
import { validatePresentationFile } from "@/lib/pptxFile";
import {
  ACCEPT_ATTRIBUTE,
  CLIENT_TIMEOUT_MS,
  checkUploadSize,
  rejectionMessage,
  pdfFilename,
} from "@/lib/powerPointToPdfLimits";
import { colors } from "@/lib/theme";
import { events, sizeBucket, trackEvent } from "@/lib/analytics";

/**
 * Extension the route needs to disambiguate a legacy OLE2 file.
 *
 * A .ppt, .doc, and .xls share one header, so the bytes cannot tell the route
 * which application wrote the file — see src/lib/pptxFile.js. Sent as a bare
 * tag rather than the filename: the route only ever compares it against a fixed
 * list, so there is no reason to put the user's filename on the wire.
 */
function legacyExtensionTag(name) {
  const lower = String(name || "").toLowerCase();
  if (lower.endsWith(".ppt")) return "ppt";
  if (lower.endsWith(".pps")) return "pps";
  return "";
}

export default function PowerPointToPdfClient() {
  const [file, setFile] = useState(null);
  const [isSlow, setIsSlow] = useState(false);
  const [error, setError] = useState("");
  const [resultBlob, setResultBlob] = useState(null);
  const [isConverting, setIsConverting] = useState(false);

  const fileRef = useRef(null);
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
  }, []);

  async function handleFiles(fileList) {
    setError("");
    setResultBlob(null);

    const candidate = fileList[0];

    // Container sniffing, not file.type — see pptxFile.js. This is also where a
    // PDF, a Word document, a spreadsheet, or a Keynote file gets named
    // specifically rather than refused with a generic message.
    const check = await validatePresentationFile(candidate);
    if (!check.ok) {
      trackEvent(events.TOOL_ERROR, { reason: "powerpoint_to_pdf_rejected" });
      setError(check.error);
      return;
    }

    // Size is checked against this tool's own ceiling as well.
    // validatePresentationFile already applies it, but going through the shared
    // helper keeps the "slow file" threshold in one place rather than
    // duplicating the comparison here.
    const size = checkUploadSize(check.file.size);
    if (!size.ok) {
      setError(rejectionMessage(size.reason));
      return;
    }

    // No slide count and no preview, unlike the other PDF tools. Reading either
    // would mean unzipping the .pptx and laying out its slides in the browser —
    // which is the entire job we are sending to a server precisely because a
    // browser cannot do it. Showing the name and size is honest; counting
    // slide XML parts would not survive hidden slides or a legacy .ppt.
    fileRef.current = check.file;
    setFile(check.file);
    setIsSlow(size.isSlow);
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
      const headers = { "Content-Type": "application/octet-stream" };

      // Only sent for the legacy formats that actually need it. A .pptx or .odp
      // identifies itself from its bytes, so there is nothing to declare.
      const legacy = legacyExtensionTag(fileRef.current?.name);
      if (legacy) headers["X-Source-Extension"] = legacy;

      const response = await fetch("/api/powerpoint-to-pdf", {
        method: "POST",
        headers,
        body: fileRef.current,
        signal: controller.signal,
      });

      if (!response.ok) {
        // The route always sends a JSON message chosen from
        // powerPointToPdfLimits.rejectionMessage, so the copy the user sees is
        // the same on both sides of the network.
        let message = rejectionMessage("convert_failed");
        try {
          const body = await response.json();
          if (body?.error) message = body.error;
        } catch {
          // Non-JSON response (a platform error page); keep the fallback.
        }

        trackEvent(events.TOOL_ERROR, { reason: `powerpoint_to_pdf_${response.status}` });
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
          trackEvent(events.TOOL_ERROR, { reason: "powerpoint_to_pdf_client_timeout" });
          setError(rejectionMessage("timeout"));
        }
        return;
      }

      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "powerpoint_to_pdf_network" });
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
      {/* Shown before the file picker, not after: this is one of only three
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
          <strong style={{ color: colors.text }}>This tool uploads your file.</strong> Like the two
          Word converters, and unlike everything else here, laying out a presentation can&apos;t run
          in a browser — your file is sent to our converter, rendered to PDF, and deleted
          immediately afterwards. Nothing is stored or logged. If the deck is confidential,
          PowerPoint and LibreOffice both export PDFs locally.
        </p>
      </div>

      {!file && (
        <FileDropzone
          onFiles={handleFiles}
          accept={ACCEPT_ATTRIBUTE}
          label="Drag & drop a PowerPoint file here, or click to browse"
        />
      )}

      <ErrorBanner>{error}</ErrorBanner>

      {file && (
        <div style={{ marginTop: "20px" }}>
          <PdfFileHeader file={file} onReset={resetState} disabled={isConverting} />

          {isSlow && (
            <WarningBanner>
              This is a large presentation, so conversion may take up to a minute. Keep this tab
              open — closing it cancels the conversion.
            </WarningBanner>
          )}

          {/* Indeterminate throughout: the converter is a single opaque step
              with no per-slide progress to report, and a bar that invented one
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
              Converted. One page per slide, with your layout and images preserved.
              {/* Said after the fact as well as before: someone comparing the
                  PDF to the original needs to know which differences are
                  expected rather than assuming the tool malfunctioned. */}
              <span style={{ color: colors.textMuted }}>
                {" "}
                Slide animations and transitions don&apos;t carry over — a PDF page is static — and
                decks using unusual fonts may shift slightly, since the converter substitutes the
                closest match it has.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
