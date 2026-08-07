"use client";

import { useCallback, useRef, useState } from "react";
import { LockKeyholeOpen } from "lucide-react";
import FileDropzone from "@/components/FileDropzone";
import DownloadButton from "@/components/DownloadButton";
import ProgressBar from "@/components/ProgressBar";
import ErrorBanner from "@/components/ErrorBanner";
import PdfFileHeader from "@/components/PdfFileHeader";
import WarningBanner from "@/components/WarningBanner";
import PasswordField from "@/components/PasswordField";
import { PrimaryButton, SecondaryButton } from "@/components/ToolButton";
import { validatePdfFile, describePdfError } from "@/lib/pdfFile";
import { describeEncryptionError, validateOpenPassword } from "@/lib/pdfEncryption";
import { usePdfWorker, ops } from "@/lib/pdfWorkerClient";
import { colors } from "@/lib/theme";
import { events, sizeBucket, trackEvent } from "@/lib/analytics";

export default function UnlockPdfClient() {
  const [file, setFile] = useState(null);
  const [pageCount, setPageCount] = useState(null);
  // null until inspected. `needsPassword` false + `encrypted` true is the
  // owner-password-only case, which needs no password and different copy.
  const [encryption, setEncryption] = useState(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [resultBlob, setResultBlob] = useState(null);

  const { run, cancel, progress, isRunning } = usePdfWorker();
  const bytesRef = useRef(null);

  const resetState = useCallback(() => {
    setFile(null);
    setPageCount(null);
    setEncryption(null);
    setPassword("");
    setResultBlob(null);
    setError("");
    bytesRef.current = null;
  }, []);

  async function handleFiles(fileList) {
    setError("");
    setResultBlob(null);
    setPassword("");

    const check = await validatePdfFile(fileList[0]);
    if (!check.ok) {
      setError(check.error);
      return;
    }

    try {
      const bytes = await check.file.arrayBuffer();
      bytesRef.current = bytes;

      // Inspecting first tells us which of the three states this file is in
      // before the user is asked for anything — so a file that needs no
      // password never shows a password box, and one that does asks up front
      // rather than after a failed attempt.
      const info = await run(ops.INSPECT_ENCRYPTION, { bytes: bytes.slice(0) }, { transfer: [] });

      setFile(check.file);
      setEncryption(info);
      setPageCount(info.pageCount);

      trackEvent(events.FILE_SELECTED, {
        size_bucket: sizeBucket(check.file.size),
        needs_password: info.needsPassword,
      });
    } catch (err) {
      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "unlock_read_failed" });
      setError(describeEncryptionError(err) || describePdfError(err, "Could not read this PDF."));
      resetState();
    }
  }

  async function handleUnlock() {
    setError("");
    setResultBlob(null);

    if (encryption?.needsPassword) {
      const check = validateOpenPassword(password);
      if (!check.ok) {
        setError(check.error);
        return;
      }
    }

    try {
      const result = await run(
        ops.UNLOCK,
        { bytes: bytesRef.current.slice(0), password },
        { transfer: [] }
      );

      setResultBlob(new Blob([result.bytes], { type: "application/pdf" }));
      setPageCount(result.pageCount);

      trackEvent(events.TOOL_RUN, {
        page_count: result.pageCount,
        size_bucket: sizeBucket(file.size),
        needed_password: Boolean(encryption?.needsPassword),
      });
    } catch (err) {
      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "unlock_failed" });
      // describeEncryptionError first: pdfFile's generic mapper turns anything
      // mentioning a password into "open it in a reader and remove the
      // password", which is absurd advice inside the tool that removes them.
      setError(
        describeEncryptionError(err) || describePdfError(err, "Could not unlock this PDF.")
      );
    }
  }

  const needsPassword = Boolean(encryption?.needsPassword);
  const downloadName = file ? file.name.replace(/\.pdf$/i, "") + "-unlocked.pdf" : "unlocked.pdf";

  return (
    <div>
      {!file && (
        <FileDropzone
          onFiles={handleFiles}
          accept="application/pdf,.pdf"
          label="Drag & drop a PDF here, or click to browse"
        />
      )}

      <ErrorBanner>{error}</ErrorBanner>

      {file && (
        <div style={{ marginTop: "20px" }}>
          <PdfFileHeader
            file={file}
            pageCount={pageCount}
            onReset={resetState}
            disabled={isRunning}
          />

          {needsPassword ? (
            <>
              <p
                style={{
                  fontSize: "14px",
                  color: colors.textSecondary,
                  lineHeight: 1.6,
                  margin: "0 0 16px",
                }}
              >
                This PDF needs a password to open. Enter it below and the encryption will be
                removed from the copy you download.
              </p>
              <PasswordField
                label="PDF password"
                value={password}
                onChange={setPassword}
                placeholder="The password you use to open this PDF"
                // "current-password" rather than "new-password": this is an
                // existing secret being recalled, so offering a manager's saved
                // entry is genuinely helpful here.
                autoComplete="current-password"
                disabled={isRunning}
                onEnter={handleUnlock}
                hint="Checked entirely on your device. It's never sent anywhere."
              />
            </>
          ) : (
            // The owner-password-only case. Worth stating plainly rather than
            // letting the tool look like it performed a feat: the content was
            // never encrypted against reading, which is exactly why the file
            // opened without prompting in the first place.
            <p
              style={{
                fontSize: "14px",
                color: colors.textSecondary,
                lineHeight: 1.6,
                margin: "0 0 16px",
              }}
            >
              This PDF opens without a password — it only carries restrictions on printing,
              copying, or editing. Those can be removed without a password, because the contents
              were never encrypted against being read.
            </p>
          )}

          <WarningBanner>
            Only use this on documents you own or have permission to change. Removing protection
            from someone else&apos;s file may breach the terms it was shared under.
          </WarningBanner>

          {isRunning && <ProgressBar progress={progress} indeterminate label="Removing encryption…" />}

          <div
            style={{
              display: "flex",
              gap: "12px",
              alignItems: "center",
              flexWrap: "wrap",
              marginTop: "20px",
            }}
          >
            <PrimaryButton
              onClick={handleUnlock}
              disabled={isRunning || (needsPassword && password.length === 0)}
            >
              <LockKeyholeOpen size={16} />
              {isRunning ? "Removing…" : "Remove password"}
            </PrimaryButton>

            {isRunning && <SecondaryButton onClick={cancel}>Cancel</SecondaryButton>}

            {resultBlob && !isRunning && (
              <DownloadButton getBlob={() => resultBlob} filename={downloadName}>
                Download unlocked PDF
              </DownloadButton>
            )}
          </div>

          {resultBlob && !isRunning && (
            <div
              style={{
                marginTop: "16px",
                padding: "12px 14px",
                borderRadius: "10px",
                border: `1px solid ${colors.successSoftBorder}`,
                backgroundColor: colors.successSoft,
                fontSize: "14px",
                color: colors.textSecondary,
              }}
            >
              Encryption removed. The downloaded copy opens without a password.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
