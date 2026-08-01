"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { colors } from "@/lib/theme";

export default function Error({ error, reset }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <section style={{ maxWidth: "600px", margin: "0 auto", padding: "80px 20px 100px", textAlign: "center" }}>
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: colors.text, marginBottom: "12px" }}>
        Something went wrong
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "24px" }}>
        We&apos;ve been notified and are looking into it. You can try again or head back home.
      </p>
      <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
        <button
          onClick={reset}
          style={{
            fontSize: "15px",
            fontWeight: 500,
            color: colors.primaryContrast,
            background: colors.primary,
            border: "none",
            borderRadius: "8px",
            padding: "10px 18px",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
        <Link
          href="/"
          style={{
            fontSize: "15px",
            fontWeight: 500,
            color: colors.text,
            background: colors.surfaceMuted,
            border: `1px solid ${colors.border}`,
            borderRadius: "8px",
            padding: "10px 18px",
            textDecoration: "none",
          }}
        >
          Back to home
        </Link>
      </div>
    </section>
  );
}
