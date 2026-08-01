import UnitConverterClient from "./UnitConverterClient";

export const metadata = {
  title: "Unit Converter — WaryTools",
  description: "Convert length, weight, and temperature units.",
};

export default function UnitConverterPage() {
  return (
    <section style={{ maxWidth: "700px", margin: "0 auto", padding: "48px 20px 80px" }}>
      <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#111827", marginBottom: "12px" }}>
        Unit Converter
      </h1>
      <p style={{ fontSize: "15px", color: "#6b7280", marginBottom: "32px" }}>
        Convert between length, weight, and temperature units.
      </p>

      <UnitConverterClient />
    </section>
  );
}
