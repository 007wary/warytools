import DateDifferenceClient from "./DateDifferenceClient";

export const metadata = {
  title: "Date Difference Calculator — WaryTools",
  description: "Days, months, and years between two dates.",
};

export default function DateDifferencePage() {
  return (
    <section style={{ maxWidth: "600px", margin: "0 auto", padding: "48px 20px 80px" }}>
      <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#111827", marginBottom: "12px" }}>
        Date Difference Calculator
      </h1>
      <p style={{ fontSize: "15px", color: "#6b7280", marginBottom: "32px" }}>
        Find the number of days, months, and years between two dates.
      </p>

      <DateDifferenceClient />
    </section>
  );
}
