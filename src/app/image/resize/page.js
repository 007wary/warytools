import ResizeImageClient from "./ResizeImageClient";

export const metadata = {
  title: "Resize Image — WaryTools",
  description: "Resize images by dimensions or percentage, right in your browser.",
};

export default function ResizeImagePage() {
  return (
    <section style={{ maxWidth: "800px", margin: "0 auto", padding: "48px 20px 80px" }}>
      <h1 style={{ fontSize: "28px", fontWeight: 700, color: "var(--text)", marginBottom: "12px" }}>
        Resize Image
      </h1>
      <p style={{ fontSize: "15px", color: "var(--text-muted)", marginBottom: "32px" }}>
        Resize by exact dimensions or by percentage. Everything happens in your browser — files
        are never uploaded anywhere.
      </p>

      <ResizeImageClient />
    </section>
  );
}
