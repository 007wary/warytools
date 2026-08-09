"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { LockKeyhole } from "lucide-react";
import FileDropzone from "@/components/FileDropzone";
import DownloadButton from "@/components/DownloadButton";
import ProgressBar from "@/components/ProgressBar";
import ErrorBanner from "@/components/ErrorBanner";
import PdfFileHeader from "@/components/PdfFileHeader";
import WarningBanner from "@/components/WarningBanner";
import PasswordField from "@/components/PasswordField";
import { PrimaryButton, SecondaryButton } from "@/components/ToolButton";
import { validatePdfFile, describePdfError } from "@/lib/pdfFile";
import {
  PERMISSIONS,
  allPermissionsGranted,
  describeEncryptionError,
  describeProtection,
  isEveryPermissionGranted,
  ratePassword,
  validateNewPassword,
  validateOpenPassword,
} from "@/lib/pdfEncryption";
import { usePdfWorker, ops, isCancellation } from "@/lib/pdfWorkerClient";
import { colors } from "@/lib/theme";
import { events, sizeBucket, trackEvent } from "@/lib/analytics";

export default function ProtectPdfClient() {
  const [file, setFile] = useState(null);
  const [pageCount, setPageCount] = useState(null);
  const [encryption, setEncryption] = useState(null);
  // The password of the SOURCE file, when it is already protected. Distinct
  // from the new one being applied — conflating them is how a "change password"
  // flow ends up locking someone out.
  const [existingPassword, setExistingPassword] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [restrict, setRestrict] = useState(false);
  const [permissions, setPermissions] = useState(allPermissionsGranted);
  const [error, setError] = useState("");
  const [resultBlob, setResultBlob] = useState(null);

  const { run, cancel, progress, isRunning } = usePdfWorker();
  const bytesRef = useRef(null);

  const resetState = useCallback(() => {
    setFile(null);
    setPageCount(null);
    setEncryption(null);
    setExistingPassword("");
    setUserPassword("");
    setConfirmPassword("");
    setRestrict(false);
    setPermissions(allPermissionsGranted());
    setResultBlob(null);
    setError("");
    bytesRef.current = null;
  }, []);

  async function handleFiles(fileList) {
    setError("");
    setResultBlob(null);

    const check = await validatePdfFile(fileList[0]);
    if (!check.ok) {
      setError(check.error);
      return;
    }

    try {
      const bytes = await check.file.arrayBuffer();
      bytesRef.current = bytes;

      // A file that is ALREADY protected has to be opened before it can be
      // re-protected, so this decides whether to ask for the existing password.
      const info = await run(ops.INSPECT_ENCRYPTION, { bytes: bytes.slice(0) }, { transfer: [] });

      setFile(check.file);
      setEncryption(info);
      setPageCount(info.pageCount);

      trackEvent(events.FILE_SELECTED, { size_bucket: sizeBucket(check.file.size) });
    } catch (err) {
      // A cancel is the user's own action, not a failure — reporting it as an
      // error banner contradicts the button they just pressed.
      if (isCancellation(err)) return;
      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "protect_read_failed" });
      setError(describeEncryptionError(err) || describePdfError(err, "Could not read this PDF."));
      resetState();
    }
  }

  async function handleProtect() {
    setError("");
    setResultBlob(null);

    if (encryption?.needsPassword) {
      const check = validateOpenPassword(existingPassword);
      if (!check.ok) {
        setError("Enter the PDF's current password before setting a new one.");
        return;
      }
    }

    // A password is only validated when one is being set — the restrict-only
    // flow deliberately allows an empty one.
    if (userPassword.length > 0) {
      const check = validateNewPassword(userPassword, { label: "Password" });
      if (!check.ok) {
        setError(check.error);
        return;
      }

      // Confirmation matters more here than in a normal signup: getting this
      // wrong produces a document that nobody, including the person who made
      // it, can ever open again.
      if (userPassword !== confirmPassword) {
        setError("The two passwords don't match.");
        return;
      }
    }

    if (userPassword.length === 0 && (!restrict || isEveryPermissionGranted(permissions))) {
      setError("Set a password, or switch off at least one permission — otherwise nothing changes.");
      return;
    }

    try {
      const result = await run(
        ops.PROTECT,
        {
          bytes: bytesRef.current.slice(0),
          password: existingPassword,
          userPassword,
          // An owner password is always written. Without a distinct one the
          // permissions could be lifted by anyone who can open the file, which
          // would make the restriction switches purely decorative. Reusing the
          // user password when none is set separately is what every desktop
          // tool does.
          ownerPassword: userPassword || "owner",
          permissions: restrict ? permissions : allPermissionsGranted(),
        },
        { transfer: [] }
      );

      setResultBlob(new Blob([result.bytes], { type: "application/pdf" }));
      setPageCount(result.pageCount);

      trackEvent(events.TOOL_RUN, {
        page_count: result.pageCount,
        size_bucket: sizeBucket(file.size),
        has_password: userPassword.length > 0,
        restricted: restrict && !isEveryPermissionGranted(permissions),
      });
    } catch (err) {
      // A cancel is the user's own action, not a failure — reporting it as an
      // error banner contradicts the button they just pressed.
      if (isCancellation(err)) return;
      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "protect_failed" });
      setError(describeEncryptionError(err) || describePdfError(err, "Could not protect this PDF."));
    }
  }

  const rating = useMemo(() => ratePassword(userPassword), [userPassword]);
  const summary = useMemo(
    () => describeProtection({ userPassword, restrict, permissions }),
    [userPassword, restrict, permissions]
  );

  const downloadName = file ? file.name.replace(/\.pdf$/i, "") + "-protected.pdf" : "protected.pdf";

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

          {encryption?.needsPassword && (
            <>
              <p
                style={{
                  fontSize: "14px",
                  color: colors.textSecondary,
                  lineHeight: 1.6,
                  margin: "0 0 16px",
                }}
              >
                This PDF is already password-protected. Enter its current password to change the
                protection.
              </p>
              <PasswordField
                label="Current password"
                value={existingPassword}
                onChange={setExistingPassword}
                placeholder="The password this PDF opens with"
                autoComplete="current-password"
                disabled={isRunning}
              />
            </>
          )}

          <PasswordField
            label="Password to open the PDF"
            value={userPassword}
            onChange={setUserPassword}
            placeholder="Leave empty to only restrict permissions"
            disabled={isRunning}
            hint={
              rating.label
                ? `${rating.label}${rating.hint ? ` — ${rating.hint}` : ""}`
                : "Anyone with this password can open the document."
            }
          />

          {userPassword.length > 0 && (
            <PasswordField
              label="Confirm password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="Type it again"
              disabled={isRunning}
              hint="There is no way to recover this password later, so it's worth checking."
            />
          )}

          <div style={{ margin: "20px 0" }}>
            <label
              style={{
                display: "flex",
                gap: "10px",
                alignItems: "flex-start",
                cursor: "pointer",
                fontSize: "14px",
                color: colors.text,
              }}
            >
              <input
                type="checkbox"
                checked={restrict}
                onChange={(event) => setRestrict(event.target.checked)}
                disabled={isRunning}
                style={{ marginTop: "3px" }}
              />
              <span>
                Also restrict what readers can do
                <span style={{ display: "block", fontSize: "13px", color: colors.textMuted }}>
                  Switch off printing, copying, editing, or comments.
                </span>
              </span>
            </label>
          </div>

          {restrict && (
            <fieldset
              style={{
                border: `1px solid ${colors.border}`,
                borderRadius: "10px",
                padding: "14px 16px",
                margin: "0 0 20px",
              }}
            >
              <legend style={{ fontSize: "13px", fontWeight: 600, color: colors.text, padding: "0 6px" }}>
                Allowed in PDF readers
              </legend>
              {PERMISSIONS.map((permission) => (
                <label
                  key={permission.id}
                  style={{
                    display: "flex",
                    gap: "10px",
                    alignItems: "flex-start",
                    cursor: "pointer",
                    fontSize: "14px",
                    color: colors.text,
                    padding: "6px 0",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={permissions[permission.id] !== false}
                    onChange={(event) =>
                      setPermissions((current) => ({
                        ...current,
                        [permission.id]: event.target.checked,
                      }))
                    }
                    disabled={isRunning}
                    style={{ marginTop: "3px" }}
                  />
                  <span>
                    {permission.label}
                    <span style={{ display: "block", fontSize: "13px", color: colors.textMuted }}>
                      {permission.description}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          {/* Generated from the real settings rather than written as static help
              text. The user/owner password distinction is the most misread thing
              about PDF security, and a sentence describing what WILL happen is
              much harder to misread than two checkboxes. */}
          <div
            role="status"
            aria-live="polite"
            style={{
              marginBottom: "20px",
              padding: "12px 14px",
              borderRadius: "10px",
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.surfaceMuted,
              fontSize: "13px",
              color: colors.textSecondary,
              lineHeight: 1.6,
            }}
          >
            {summary.lines.map((line) => (
              <p key={line} style={{ margin: "0 0 4px" }}>
                {line}
              </p>
            ))}
          </div>

          <WarningBanner>
            There is no way to recover this password — not by us, and not by any PDF reader. If it
            is lost, the document cannot be opened again. Keep a copy of the original somewhere
            safe.
          </WarningBanner>

          {isRunning && <ProgressBar progress={progress} indeterminate label="Encrypting…" />}

          <div
            style={{
              display: "flex",
              gap: "12px",
              alignItems: "center",
              flexWrap: "wrap",
              marginTop: "20px",
            }}
          >
            <PrimaryButton onClick={handleProtect} disabled={isRunning}>
              <LockKeyhole size={16} />
              {isRunning ? "Protecting…" : "Protect PDF"}
            </PrimaryButton>

            {isRunning && <SecondaryButton onClick={cancel}>Cancel</SecondaryButton>}

            {resultBlob && !isRunning && (
              <DownloadButton getBlob={() => resultBlob} filename={downloadName}>
                Download protected PDF
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
              {userPassword.length > 0
                ? "Protected. The downloaded copy asks for the password when opened."
                : "Restrictions applied to the downloaded copy."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
