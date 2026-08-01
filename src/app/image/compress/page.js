import CompressImageClient from "./CompressImageClient";

export const metadata = {
  title: "Compress Image — WaryTools",
  description: "Reduce image file size with a quality slider, right in your browser.",
};

export default function CompressImagePage() {
  return (
    <section style={{ maxWidth: "800px", margin: "0 auto", padding: "48px 20px 80px" }}>
      <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#111827", marginBottom: "12px" }}>
        Compress Image
      </h1>
      <p style={{ fontSize: "15px", color: "#6b7280", marginBottom: "32px" }}>
        Reduce your image&apos;s file size with an adjustable quality slider. Everything happens
        in your browser — files are never uploaded anywhere.
      </p>

      <CompressImageClient />
    </section>
  );
}
