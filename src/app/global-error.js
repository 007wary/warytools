"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <section style={{ maxWidth: "600px", margin: "0 auto", padding: "48px 20px 80px", textAlign: "center" }}>
          <h1 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px" }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: "15px", marginBottom: "20px" }}>
            We&apos;ve been notified and are looking into it.
          </p>
          <button onClick={reset} style={{ padding: "10px 20px", cursor: "pointer" }}>
            Try again
          </button>
        </section>
      </body>
    </html>
  );
}
