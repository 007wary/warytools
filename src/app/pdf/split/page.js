import SplitPdfClient from "./SplitPdfClient";

export const metadata = {
  title: "Split PDF — WaryTools",
  description: "Split a PDF into separate files or extract a page range, right in your browser.",
};

export default function SplitPdfPage() {
  return (
    <section style={{ maxWidth: "800px", margin: "0 auto", padding: "48px 20px 80px" }}>
      <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#111827", marginBottom: "12px" }}>
        Split PDF
      </h1>
      <p style={{ fontSize: "15px", color: "#6b7280", marginBottom: "32px" }}>
        Extract a page range into a new PDF, or split every page into its own file.
        Everything happens in your browser — files are never uploaded anywhere.
      </p>

      <SplitPdfClient />
    </section>
  );
}
