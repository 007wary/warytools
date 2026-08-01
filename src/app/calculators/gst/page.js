import GstCalculatorClient from "./GstCalculatorClient";

export const metadata = {
  title: "GST Calculator — WaryTools",
  description: "Add or remove GST using common Indian GST slabs.",
};

export default function GstCalculatorPage() {
  return (
    <section style={{ maxWidth: "600px", margin: "0 auto", padding: "48px 20px 80px" }}>
      <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#111827", marginBottom: "12px" }}>
        GST Calculator
      </h1>
      <p style={{ fontSize: "15px", color: "#6b7280", marginBottom: "32px" }}>
        Add or remove GST using the common Indian slabs — 5%, 12%, 18%, and 28%.
      </p>

      <GstCalculatorClient />
    </section>
  );
}
