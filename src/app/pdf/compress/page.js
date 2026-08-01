import CompressPdfClient from "./CompressPdfClient";

export const metadata = {
  title: "Compress PDF — WaryTools",
  description: "Reduce PDF file size, right in your browser.",
};

export default function CompressPdfPage() {
  return (
    <section style={{ maxWidth: "800px", margin: "0 auto", padding: "48px 20px 80px" }}>
      <h1 style={{ fontSize: "28px", fontWeight: 700, color: "var(--text)", marginBottom: "12px" }}>
        Compress PDF
      </h1>
      <p style={{ fontSize: "15px", color: "var(--text-muted)", marginBottom: "32px" }}>
        Shrink your PDF&apos;s file size. Everything happens in your browser — files are never
        uploaded anywhere.
      </p>

      <CompressPdfClient />
    </section>
  );
}
