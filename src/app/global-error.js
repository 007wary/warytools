"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import "./globals.css";
import { colors } from "@/lib/theme";

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <section style={{ maxWidth: "600px", margin: "0 auto", padding: "80px 20px 100px", textAlign: "center" }}>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: colors.text, marginBottom: "12px" }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "24px" }}>
            We&apos;ve been notified and are looking into it. Try reloading the page.
          </p>
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
        </section>
      </body>
    </html>
  );
}
