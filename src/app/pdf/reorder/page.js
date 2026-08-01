import ReorderPdfClient from "./ReorderPdfClient";

export const metadata = {
  title: "Reorder PDF Pages — WaryTools",
  description: "Drag and drop to reorder or delete PDF pages, right in your browser.",
};

export default function ReorderPdfPage() {
  return (
    <section style={{ maxWidth: "900px", margin: "0 auto", padding: "48px 20px 80px" }}>
      <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#111827", marginBottom: "12px" }}>
        Reorder PDF Pages
      </h1>
      <p style={{ fontSize: "15px", color: "#6b7280", marginBottom: "32px" }}>
        Drag and drop to reorder pages, or delete the ones you don&apos;t need. Everything
        happens in your browser — files are never uploaded anywhere.
      </p>

      <ReorderPdfClient />
    </section>
  );
}
