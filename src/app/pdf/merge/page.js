import MergePdfClient from "./MergePdfClient";

export const metadata = {
  title: "Merge PDF — WaryTools",
  description: "Combine multiple PDFs into one file, right in your browser. No uploads, 100% private.",
};

export default function MergePdfPage() {
  return (
    <section style={{ maxWidth: "800px", margin: "0 auto", padding: "48px 20px 80px" }}>
      <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#111827", marginBottom: "12px" }}>
        Merge PDF
      </h1>
      <p style={{ fontSize: "15px", color: "#6b7280", marginBottom: "32px" }}>
        Combine multiple PDFs into one file. Reorder them however you like before merging.
        Everything happens in your browser — files are never uploaded anywhere.
      </p>

      <MergePdfClient />
    </section>
  );
}
