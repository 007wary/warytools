import RotatePdfClient from "./RotatePdfClient";

export const metadata = {
  title: "Rotate PDF — WaryTools",
  description: "Rotate specific pages or the entire PDF document, right in your browser.",
};

export default function RotatePdfPage() {
  return (
    <section style={{ maxWidth: "800px", margin: "0 auto", padding: "48px 20px 80px" }}>
      <h1 style={{ fontSize: "28px", fontWeight: 700, color: "var(--text)", marginBottom: "12px" }}>
        Rotate PDF
      </h1>
      <p style={{ fontSize: "15px", color: "var(--text-muted)", marginBottom: "32px" }}>
        Rotate individual pages or the whole document in 90° steps. Everything happens in your
        browser — files are never uploaded anywhere.
      </p>

      <RotatePdfClient />
    </section>
  );
}
