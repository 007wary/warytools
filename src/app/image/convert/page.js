import ConvertImageClient from "./ConvertImageClient";

export const metadata = {
  title: "Convert Image — WaryTools",
  description: "Convert between PNG, JPG, and WebP, right in your browser.",
};

export default function ConvertImagePage() {
  return (
    <section style={{ maxWidth: "800px", margin: "0 auto", padding: "48px 20px 80px" }}>
      <h1 style={{ fontSize: "28px", fontWeight: 700, color: "var(--text)", marginBottom: "12px" }}>
        Convert Image
      </h1>
      <p style={{ fontSize: "15px", color: "var(--text-muted)", marginBottom: "32px" }}>
        Convert between PNG, JPG, and WebP. Everything happens in your browser — files are never
        uploaded anywhere.
      </p>

      <ConvertImageClient />
    </section>
  );
}
